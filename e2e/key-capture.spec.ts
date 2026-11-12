import type { BrowserContext, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, test } from './extension';

// ⌥ + key on pages in real Chrome (product spec §4.2–§4.5). Keys go through CDP (`page.keyboard.press`), which
// reaches the page the same way on every OS. Every guard and suppression rule is unit-tested in
// src/domain/keydown.test.ts and src/platform/key-capture.test.tsx; this covers the real listener, frames and the
// injection. The OS pass-through table and the free signal are not asserted here.

interface Tab {
  id: number;
  windowId: number;
  active: boolean;
  url?: string;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { set(items: object): Promise<void> } };
  tabs: {
    query(info: object): Promise<Tab[]>;
    sendMessage(tabId: number, message: object, options: object): Promise<{ res?: unknown } | undefined>;
  };
};

const ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;
const target = (name: string) => `${ORIGIN}/frame-child.html?${name}`;

async function serviceWorker(context: BrowserContext, extensionId: string): Promise<Worker> {
  const worker =
    context.serviceWorkers().find((w) => w.url().includes(extensionId)) ??
    (await context.waitForEvent('serviceworker'));
  return worker;
}

/** Puts a link on a key, opening as `openMode`. */
const store = (worker: Worker, key: string, link: string, openMode = 'new') =>
  worker.evaluate(([item, value]) => chrome.storage.sync.set({ [item]: value }), [
    `key.${key}`,
    { link, openMode, tabMatch: 'exact', closeCurrent: false },
  ] as const);

const allTabs = (worker: Worker) => worker.evaluate(() => chrome.tabs.query({}));
const tabsOn = async (worker: Worker, url: string) => (await allTabs(worker)).filter((tab) => tab.url === url);

/** Opens a fixture page, with the key's target link not yet open anywhere. */
async function open(context: BrowserContext, path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(path, { waitUntil: 'load' });
  return page;
}

test.describe('⌥ + key on a page', () => {
  test('⌥ + an assigned key opens its link, and the page never sees the key', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'K', target('k'));
    const page = await open(context, '/keys.html');

    await page.keyboard.press('Alt+KeyK');

    await expect.poll(() => tabsOn(worker, target('k')).then((tabs) => tabs.length)).toBe(1);
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
    expect(seen.filter((entry) => entry.endsWith('KeyK'))).toEqual([]);
  });

  test('Smart switch goes to the open matching tab instead of opening another', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'D', target('docs'), 'smart');
    await open(context, target('docs'));
    const page = await open(context, '/keys.html');
    await page.bringToFront();

    await page.keyboard.press('Alt+KeyD');

    await expect
      .poll(async () => (await allTabs(worker)).find((tab) => tab.active)?.url, { message: 'the docs tab is active' })
      .toBe(target('docs'));
    expect(await tabsOn(worker, target('docs'))).toHaveLength(1);
  });

  test('⌥⇧ + key forces a new tab even with a match open', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'D', target('docs'), 'smart');
    await open(context, target('docs'));
    const page = await open(context, '/keys.html');
    await page.bringToFront();

    await page.keyboard.press('Alt+Shift+KeyD');

    await expect.poll(() => tabsOn(worker, target('docs')).then((tabs) => tabs.length)).toBe(2);
  });

  test('⌥ + key in a field types instead, and a free key opens nothing', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'K', target('k'));
    await store(worker, 'B', target('barrier'));
    const page = await open(context, '/keys.html');

    for (const field of ['#input', '#textarea', '#editor']) {
      await page.locator(field).focus();
      await page.keyboard.press('Alt+KeyK');
    }
    await page.locator('h1').click();
    await page.keyboard.press('Alt+KeyJ');
    // A barrier: once B's tab is open, every earlier press has been handled.
    await page.keyboard.press('Alt+KeyB');

    await expect.poll(() => tabsOn(worker, target('barrier')).then((tabs) => tabs.length)).toBe(1);
    expect(await tabsOn(worker, target('k'))).toEqual([]);
  });

  test('works with focus in a same-origin child frame', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'K', target('k'));
    const page = await open(context, '/frames.html');

    await page.frameLocator('iframe').getByText('Child frame').click();
    await page.keyboard.press('Alt+KeyK');

    await expect.poll(() => tabsOn(worker, target('k')).then((tabs) => tabs.length)).toBe(1);
  });

  test('works with focus in a cross-origin child frame', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'K', target('k'));
    const page = await open(context, '/cross-origin.html');
    const child = page.frameLocator('#child');
    await expect(child.getByText('Child frame')).toBeVisible();
    expect(page.frames().some((frame) => frame.url().startsWith(`http://localhost:${FIXTURE_PORT}/`))).toBe(true);

    await child.getByText('Child frame').click();
    await page.keyboard.press('Alt+KeyK');

    await expect.poll(() => tabsOn(worker, target('k')).then((tabs) => tabs.length)).toBe(1);
  });
});

/** Asks frame 0 of the tab showing `url` whether a live content script answers, in the messaging wire format. */
const pingTab = (worker: Worker, url: string) =>
  worker.evaluate(async (pageUrl) => {
    const [tab] = await chrome.tabs.query({ url: pageUrl });
    if (tab === undefined) return false;
    try {
      const message = { id: 1, type: 'ping', data: undefined, timestamp: Date.now() };
      const reply = await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 });
      return reply?.res === true;
    } catch {
      return false;
    }
  }, url);

test('after an update, an open tab works without a reload and opens the link exactly once', async ({
  context,
  extensionId,
  updateExtension,
}) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'K', target('k'));
  const page = await open(context, '/keys.html');
  await expect.poll(() => pingTab(worker, `${ORIGIN}/keys.html`)).toBe(true);

  const updated = await updateExtension();
  // The old copy in the page is orphaned; the new version injects a fresh one on onInstalled.
  await expect.poll(() => pingTab(updated, `${ORIGIN}/keys.html`), { timeout: 10_000 }).toBe(true);

  await page.bringToFront();
  await page.keyboard.press('Alt+KeyK');

  await expect.poll(() => tabsOn(updated, target('k')).then((tabs) => tabs.length)).toBe(1);
  // Give a second copy every chance to open it again.
  await page.waitForTimeout(1000);
  expect(await tabsOn(updated, target('k'))).toHaveLength(1);
});
