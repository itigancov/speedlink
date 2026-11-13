import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, HOOKS_EXTENSION_PATH, test } from './extension';

// Popup · Assign this page in real Chrome (product spec §7): the save goes through the background, the popup closes
// and the saved toast with Undo shows on the page. Playwright can't open the toolbar popup, so the e2e-hooks build
// takes `popup.html?tabId=N` and the popup is opened in a normal tab; the active-tab path is covered by
// src/entrypoints/popup/PopupPage.test.tsx, as are the picker's states.

interface Tab {
  id: number;
  url?: string;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: {
    sync: { set(items: object): Promise<void>; get(keys: string | null): Promise<Record<string, unknown>> };
  };
  tabs: { query(info: object): Promise<Tab[]> };
};

test.use({ extensionPath: HOOKS_EXTENSION_PATH });

const ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;
const PAGE = `${ORIGIN}/keys.html`;
/** What the fixture page becomes on a key: its tab title as the name, the default settings. */
const SAVED = { link: PAGE, name: 'Fixture: keys', openMode: 'smart', tabMatch: 'site', closeCurrent: false };
const OLD = {
  link: `${ORIGIN}/frame-child.html?old`,
  name: 'Old',
  openMode: 'bg',
  tabMatch: 'exact',
  closeCurrent: false,
};

async function serviceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

const store = (worker: Worker, key: string, value: object) =>
  worker.evaluate(([item, shortcut]) => chrome.storage.sync.set({ [item]: shortcut }), [`key.${key}`, value] as const);

const storedOn = async (worker: Worker, key: string) =>
  (await worker.evaluate((item) => chrome.storage.sync.get(item), `key.${key}`))[`key.${key}`];

/** Opens a page and returns it with its tab id. */
async function openPage(context: BrowserContext, url: string): Promise<{ page: Page; tabId: number }> {
  const worker = await serviceWorker(context);
  // A round trip first, so the content script is up before the page's own scripts (see page-toast.spec.ts).
  await worker.evaluate(() => chrome.storage.sync.get(null));
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  const [tab] = await worker.evaluate((match) => chrome.tabs.query({ url: match }), url.replace(/#.*$/, ''));
  if (tab === undefined) throw new Error(`no tab for ${url}`);
  return { page, tabId: tab.id };
}

/** The popup for a tab, opened in a tab of its own, once it has drawn the picker. */
async function openPopup(context: BrowserContext, extensionId: string, tabId: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await expect(popup.getByTestId('primary')).toBeVisible();
  return popup;
}

/** "⌥K" on macOS, "Alt+K" elsewhere. */
const chord = async (page: Page, key: string) =>
  (await page.evaluate(() => /Macintosh|Mac OS X/.test(navigator.userAgent))) ? `⌥${key}` : `Alt+${key}`;

const toast = (page: Page): Locator => page.getByTestId('page-toast');

test('a free key: ↵ saves the page, the popup closes, the saved toast shows and Undo frees the key', async ({
  context,
  extensionId,
}) => {
  const worker = await serviceWorker(context);
  const { page, tabId } = await openPage(context, PAGE);
  const popup = await openPopup(context, extensionId, tabId);

  await popup.keyboard.press('KeyK');
  await expect(popup.getByTestId('primary')).toHaveText(`Save to ${await chord(popup, 'K')}`);
  const closed = popup.waitForEvent('close');
  await popup.keyboard.press('Enter');

  await closed;
  expect(await storedOn(worker, 'K')).toEqual(SAVED);
  await expect(toast(page)).toContainText(await chord(page, 'K'));
  await expect(toast(page)).toContainText('→ Fixture: keys saved');

  await toast(page).getByRole('button', { name: 'Undo' }).click();

  await expect.poll(() => storedOn(worker, 'K')).toBeUndefined();
});

test('a taken key: Replace puts the page on it and the old shortcut is gone', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', OLD);
  const { page, tabId } = await openPage(context, PAGE);
  const popup = await openPopup(context, extensionId, tabId);

  await popup.keyboard.press('KeyK');
  await expect(popup.getByRole('alert')).toContainText(`${await chord(popup, 'K')} already opens Old.`);
  const closed = popup.waitForEvent('close');
  await popup.getByRole('alert').getByRole('button', { name: 'Replace' }).click();

  await closed;
  expect(await storedOn(worker, 'K')).toEqual(SAVED);
  const all = await worker.evaluate(() => chrome.storage.sync.get(null));
  expect(Object.values(all)).not.toContainEqual(OLD);
  await expect(toast(page)).toContainText('→ Fixture: keys saved');
});

test('a taken key: Move it to ⌥X keeps both, and Undo puts both keys back', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', OLD);
  const { page, tabId } = await openPage(context, PAGE);
  const popup = await openPopup(context, extensionId, tabId);

  await popup.keyboard.press('KeyK');
  // The old shortcut's site label (127.0.0.1) starts with 1, which is free.
  const move = popup.getByRole('button', { name: `Move it to ${await chord(popup, '1')}` });
  const closed = popup.waitForEvent('close');
  await move.click();

  await closed;
  expect(await storedOn(worker, 'K')).toEqual(SAVED);
  expect(await storedOn(worker, '1')).toEqual(OLD);
  await expect(toast(page)).toContainText('→ Fixture: keys saved');

  await toast(page).getByRole('button', { name: 'Undo' }).click();

  await expect.poll(() => storedOn(worker, 'K')).toEqual(OLD);
  expect(await storedOn(worker, '1')).toBeUndefined();
});

test("an unusable page says it can't go on a key, with Save disabled", async ({ context, extensionId }) => {
  const { tabId } = await openPage(context, `chrome-extension://${extensionId}/options.html`);
  const popup = await openPopup(context, extensionId, tabId);

  await expect(popup.getByText('This page can’t be put on a key')).toBeVisible();
  await expect(popup.getByTestId('primary')).toBeDisabled();
});
