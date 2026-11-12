import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, fromExtension, test } from './extension';

// The HUD's page toasts in real Chrome (product spec §6, §12.3): the free-key and switched toasts, the top frame
// only, and the spike's hostile hosts. The toast rules themselves (one slot, lifetimes, hover, Esc) are pinned in
// src/components/ToastRegion.test.tsx. Playwright locators pierce the HUD's open shadow root.

interface Tab {
  id: number;
  index: number;
  windowId: number;
  active: boolean;
  url?: string;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { set(items: object): Promise<void>; get(keys: null): Promise<object> } };
  tabs: { query(info: object): Promise<Tab[]> };
};

const ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;
const target = (name: string) => `${ORIGIN}/frame-child.html?${name}`;

/** The extension's service worker; it is the only extension loaded. */
async function serviceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

const store = (worker: Worker, key: string, fields: object) =>
  worker.evaluate(([item, value]) => chrome.storage.sync.set({ [item]: value }), [
    `key.${key}`,
    { openMode: 'smart', tabMatch: 'exact', closeCurrent: false, ...fields },
  ] as const);

const tabsOn = async (worker: Worker, url: string) =>
  (await worker.evaluate(() => chrome.tabs.query({}))).filter((tab) => tab.url === url);

/**
 * Opens a fixture page once the extension is up. Right after launch Chrome can run the content script after a
 * page's inline <head> scripts, whose key listeners would then come before ours; a round trip to the service
 * worker first avoids that race.
 */
async function open(context: BrowserContext, path: string): Promise<Page> {
  const worker = await serviceWorker(context);
  await worker.evaluate(() => chrome.storage.sync.get(null));
  const page = await context.newPage();
  await page.goto(path, { waitUntil: 'load' });
  return page;
}

/** "⌥K" on macOS, "Alt+K" elsewhere, as the content script decides it from the user agent. */
const chord = async (page: Page, key: string) =>
  (await page.evaluate(() => /Macintosh|Mac OS X/.test(navigator.userAgent))) ? `⌥${key}` : `Alt+${key}`;

const toast = (page: Page): Locator => page.getByTestId('page-toast');
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: string[] }).seen);

test.describe('the free-key toast', () => {
  test('⌥ + a free key shows "⌥K is free · Put this page on it"; Esc closes it and still reaches the page', async ({
    context,
  }) => {
    const page = await open(context, '/keys.html');

    await page.keyboard.press('Alt+KeyK');

    await expect(toast(page)).toBeVisible();
    await expect(toast(page)).toContainText(await chord(page, 'K'));
    await expect(toast(page)).toContainText('is free');
    await expect(toast(page).getByRole('button', { name: 'Put this page on it' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    await page.keyboard.press('Escape');

    await expect(toast(page)).toHaveCount(0);
    expect(await seen(page)).toContain('capture Escape');
  });

  test('× closes it, and the action leaves it up', async ({ context }) => {
    const page = await open(context, '/keys.html');
    await page.keyboard.press('Alt+KeyJ');

    await toast(page).getByRole('button', { name: 'Put this page on it' }).click();
    await expect(toast(page)).toBeVisible();
    await toast(page).getByRole('button', { name: 'Close' }).click();

    await expect(toast(page)).toHaveCount(0);
  });

  test('with focus in a child frame, shows once, in the top document only', async ({ context }) => {
    const page = await open(context, '/frames.html');
    const child = page.frameLocator('iframe');

    await child.getByText('Child frame').click();
    await page.keyboard.press('Alt+KeyJ');

    await expect(toast(page)).toHaveCount(1);
    await expect(page.locator('speedlink-hud')).toHaveCount(1);
    await expect(child.locator('speedlink-hud')).toHaveCount(0);
  });

  test('a page that never gets a key press gets no HUD', async ({ context }) => {
    const page = await open(context, '/keys.html');
    await page.waitForTimeout(300);
    await expect(page.locator('speedlink-hud')).toHaveCount(0);
  });
});

test.describe('the switched toast', () => {
  test('shows on the tab Smart switch activated, with the name, and goes after about 3 s', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'D', { link: target('docs'), name: 'Docs' });
    const docs = await open(context, target('docs'));
    const page = await open(context, '/keys.html');
    await page.bringToFront();

    await page.keyboard.press('Alt+KeyD');

    await expect(toast(docs)).toBeVisible();
    await expect(toast(docs)).toContainText(await chord(docs, 'D'));
    await expect(toast(docs)).toContainText('Switched to your open Docs tab');
    await expect(toast(page)).toHaveCount(0);
    await expect(toast(docs)).toHaveCount(0, { timeout: 5000 });
  });

  test('Open new opens one new tab next to the switched-to tab, which stays', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'D', { link: target('docs') });
    const docs = await open(context, target('docs'));
    const page = await open(context, '/keys.html');
    await page.bringToFront();
    await page.keyboard.press('Alt+KeyD');
    const [switchedTo] = await tabsOn(worker, target('docs'));

    await toast(docs).getByRole('button', { name: 'Open new' }).click();

    await expect.poll(() => tabsOn(worker, target('docs')).then((tabs) => tabs.length)).toBe(2);
    const tabs = await tabsOn(worker, target('docs'));
    expect(tabs.map((tab) => tab.id)).toContain(switchedTo?.id);
    const opened = tabs.find((tab) => tab.id !== switchedTo?.id);
    expect(opened).toMatchObject({ windowId: switchedTo?.windowId, index: (switchedTo?.index ?? -1) + 1 });
  });
});

test.describe('on a hostile host', () => {
  test('a 10px root and aggressive page rules: the toast keeps its sizes, with no content-script exceptions', async ({
    extensionId,
    openWithExceptionCapture,
  }) => {
    const { page, exceptions } = await openWithExceptionCapture('/small-root.html');

    await page.keyboard.press('Alt+KeyK');

    await expect(toast(page)).toBeVisible();
    const pill = await toast(page).evaluate((element) => {
      const computed = getComputedStyle(element);
      return { fontSize: computed.fontSize, paddingLeft: computed.paddingLeft, background: computed.backgroundColor };
    });
    // 13px text; and Tailwind's rem spacing (px-3 = 0.75rem) stays 12px, not 7.5px on this 10px root.
    expect(pill).toEqual({ fontSize: '13px', paddingLeft: '12px', background: 'rgb(26, 28, 30)' });
    // White message text, though the page sets every div's text red.
    const message = toast(page).getByText('is free');
    expect(await message.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
    expect(fromExtension(exceptions, extensionId)).toEqual([]);
  });

  test('the toast is drawn above a page bar with a huge z-index', async ({ context }) => {
    const page = await open(context, '/small-root.html');
    await page.keyboard.press('Alt+KeyK');
    await expect(toast(page)).toBeVisible();

    const box = await toast(page).boundingBox();
    if (box === null) throw new Error('no toast box');
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.localName, [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ] as const);

    expect(hit).toBe('speedlink-hud');
  });

  test('the page stays clickable under the HUD, with a toast showing and after it closes', async ({ context }) => {
    const page = await open(context, '/small-root.html');
    await page.keyboard.press('Alt+KeyK');
    await expect(toast(page)).toBeVisible();
    const clicks = () => page.evaluate(() => (window as unknown as { clicks: number }).clicks);

    // A real click at the button's position: it fails if the HUD's full-viewport container intercepts it.
    await page.locator('#page-button').click();
    expect(await clicks()).toBe(1);

    await page.keyboard.press('Escape');
    await expect(toast(page)).toHaveCount(0);
    await page.locator('#page-button').click();
    expect(await clicks()).toBe(2);
  });

  test("keys typed inside the HUD never reach the page's key listeners", async ({ context }) => {
    const page = await open(context, '/small-root.html');
    await page.keyboard.press('Alt+KeyK');
    // The toast's × is the HUD's focusable element; Tab or a script can put focus there.
    await toast(page).getByRole('button', { name: 'Close' }).focus();
    await page.evaluate(() => {
      (window as unknown as { seen: string[] }).seen = [];
    });

    // Keys that don't press the button: Enter or Space would close the toast and send the keyup to the page.
    for (const key of ['g', 's', '/', 'ArrowDown']) await page.keyboard.press(key);

    await expect(toast(page)).toBeVisible();
    expect(await seen(page)).toEqual([]);
  });

  test('a Tailwind v3 page looks the same once the HUD has mounted', async ({
    extensionId,
    openWithExceptionCapture,
  }) => {
    const { page, exceptions } = await openWithExceptionCapture('/tailwind-v3.html');
    const probe = () =>
      page.locator('#probe').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          boxShadow: style.boxShadow,
          transform: style.transform,
          filter: style.filter,
          backgroundImage: style.backgroundImage,
        };
      });
    const before = await probe();
    expect(before.backgroundImage).toContain('linear-gradient');

    await page.keyboard.press('Alt+KeyK');
    await expect(toast(page)).toBeVisible();

    expect(await probe()).toEqual(before);
    expect(fromExtension(exceptions, extensionId)).toEqual([]);
  });
});
