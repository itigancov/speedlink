import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, fromExtension, test } from './extension';

// The Peek in real Chrome (product spec §5.1, §5.4): holding ⌥ alone shows the overlay in the top frame, a key or a
// tile opens, Esc and the ⌥ release close it, and focus stays on the page. The hold rules are pinned in
// src/domain/hud-state.test.ts, the tiles in src/domain/overlay-model.test.ts and src/components/Overlay.test.tsx.
// The Windows ⋮-menu suppression can't run here (manual QA). Playwright locators pierce the HUD's open shadow root.

interface Tab {
  url?: string;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { set(items: object): Promise<void>; get(keys: string | null): Promise<object> } };
  tabs: { query(info: object): Promise<Tab[]> };
};

const ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;
const target = (name: string) => `${ORIGIN}/frame-child.html?${name}`;

/** Past the 400 ms hold. */
const PAST_HOLD_MS = 600;

async function serviceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

/** Puts a link on a key, opening in a new tab. */
const store = (worker: Worker, key: string, name: string) =>
  worker.evaluate(([item, value]) => chrome.storage.sync.set({ [item]: value }), [
    `key.${key}`,
    { link: target(key.toLowerCase()), name, openMode: 'new', tabMatch: 'exact', closeCurrent: false },
  ] as const);

const tabsOn = async (worker: Worker, url: string) =>
  (await worker.evaluate(() => chrome.tabs.query({}))).filter((tab) => tab.url === url).length;

/** Opens a fixture page once the extension is up, so our key listeners come before the page's (as page-toast). */
async function open(context: BrowserContext, path: string): Promise<Page> {
  const worker = await serviceWorker(context);
  await worker.evaluate(() => chrome.storage.sync.get(null));
  const page = await context.newPage();
  await page.goto(path, { waitUntil: 'load' });
  return page;
}

const overlay = (page: Page): Locator => page.getByRole('dialog', { name: 'Your keys' });

/** Records, from the page, whether a dialog ever appeared in the HUD's shadow root. */
const watchForDialog = (page: Page) =>
  page.evaluate(() => {
    const flag = window as unknown as { sawDialog: boolean };
    flag.sawDialog = false;
    const look = () => {
      for (const host of document.querySelectorAll('*')) {
        if (host.shadowRoot?.querySelector('[role="dialog"]')) flag.sawDialog = true;
      }
      requestAnimationFrame(look);
    };
    look();
  });
const sawDialog = (page: Page) => page.evaluate(() => (window as unknown as { sawDialog: boolean }).sawDialog);

test.describe('the Peek', () => {
  test('holding ⌥ shows the overlay; a key then opens it and closes the overlay', async ({
    context,
    openWithExceptionCapture,
    extensionId,
  }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    await store(worker, 'G', 'GitHub');
    const { page, exceptions } = await openWithExceptionCapture(`${ORIGIN}/keys.html`);

    await page.keyboard.down('Alt');
    await expect(overlay(page)).toBeVisible();
    await expect(overlay(page).getByTestId('overlay-tile')).toHaveText([/GitHub/, /Kanban/]);
    await page.keyboard.press('KeyK');
    await page.keyboard.up('Alt');

    await expect.poll(() => tabsOn(worker, target('k'))).toBe(1);
    await expect(overlay(page)).toHaveCount(0);
    expect(fromExtension(exceptions, extensionId)).toEqual([]);
  });

  test('a quick ⌥ + key opens it and never shows the overlay', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');
    await watchForDialog(page);

    await page.keyboard.press('Alt+KeyK');
    await page.waitForTimeout(PAST_HOLD_MS);

    await expect.poll(() => tabsOn(worker, target('k'))).toBe(1);
    expect(await sawDialog(page)).toBe(false);
  });

  test('Esc closes it before the page sees Esc, and the focused element keeps focus', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');
    await page.locator('#checkbox').focus();

    await page.keyboard.down('Alt');
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(overlay(page)).toHaveCount(0);
    await page.keyboard.up('Alt');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('checkbox');
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
    expect(seen.filter((entry) => entry.endsWith('Escape'))).toEqual([]);
  });

  test('releasing ⌥ closes it and leaves focus where it was', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');
    await page.locator('#checkbox').focus();

    await page.keyboard.down('Alt');
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.up('Alt');

    await expect(overlay(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('checkbox');
  });

  test('a tile click opens its key and closes the overlay', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');

    await page.keyboard.down('Alt');
    await overlay(page)
      .getByRole('button', { name: /K: Kanban/ })
      .click();
    await page.keyboard.up('Alt');

    await expect.poll(() => tabsOn(worker, target('k'))).toBe(1);
    await expect(overlay(page)).toHaveCount(0);
  });

  test('an empty keymap says "No keys yet"', async ({ context }) => {
    const page = await open(context, '/keys.html');

    await page.keyboard.down('Alt');

    await expect(overlay(page).getByText('No keys yet')).toBeVisible();
    await expect(overlay(page).getByRole('button', { name: 'Open keymap' })).toBeVisible();
    await page.keyboard.up('Alt');
  });

  test('with focus in a child frame, one overlay shows in the top document and the release closes it', async ({
    context,
  }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/frames.html');
    await page.frameLocator('iframe').getByText('Child frame').click();

    await page.keyboard.down('Alt');

    await expect(overlay(page)).toHaveCount(1);
    await expect(overlay(page)).toBeVisible();
    await expect(page.frameLocator('iframe').getByRole('dialog')).toHaveCount(0);
    await page.keyboard.up('Alt');
    await expect(overlay(page)).toHaveCount(0);
  });
});
