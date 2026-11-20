import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, HOOKS_EXTENSION_PATH, test } from './extension';

// Popup · Assign this page in real Chrome (product spec §7): the save goes through the background, the popup closes
// and the saved toast with Undo shows on the page. Playwright can't open the toolbar popup, so the e2e-hooks build
// takes `popup.html?tabId=N` and the popup is opened in a normal tab; the active-tab path is covered by
// src/entrypoints/popup/PopupPage.test.tsx, as are the picker's states. On a restricted page the popup is a launcher
// (§7): a key press opens through the background, with that page as the current tab.

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
const SAVED = { link: PAGE, name: 'Fixture: keys', openMode: 'smart', tabMatch: 'page', closeCurrent: false };
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
  await expect(popup.getByRole('button', { name: 'Open keymap →' })).toBeVisible();
  return popup;
}

/** "⌥K" on macOS, "Alt+K" elsewhere. */
const chord = async (page: Page, key: string) =>
  (await page.evaluate(() => /Macintosh|Mac OS X/.test(navigator.userAgent))) ? `⌥${key}` : `Alt+${key}`;

const toast = (page: Page): Locator => page.getByTestId('page-toast');

/** The popup for a tab that can't take a key, once it has drawn its tiles. */
async function openLauncher(context: BrowserContext, extensionId: string, tabId: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await expect(popup.getByTestId('overlay-tiles')).toBeVisible();
  return popup;
}

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

test('Show keyboard swaps the chips for the keyboard, a click picks any key and ↵ saves it', async ({
  context,
  extensionId,
}) => {
  const worker = await serviceWorker(context);
  const { page, tabId } = await openPage(context, PAGE);
  const popup = await openPopup(context, extensionId, tabId);

  await expect(popup.getByRole('group', { name: 'Free & fitting' })).toBeVisible();
  await popup.getByRole('button', { name: 'Show keyboard' }).click();
  await expect(popup.getByRole('group', { name: 'Free & fitting' })).toHaveCount(0);
  await popup.getByRole('button', { name: /^(Option|Alt) 7:/ }).click();
  await expect(popup.getByTestId('primary')).toHaveText(`Save to ${await chord(popup, '7')}`);
  const closed = popup.waitForEvent('close');
  await popup.keyboard.press('Enter');

  await closed;
  expect(await storedOn(worker, '7')).toEqual(SAVED);
  await expect(toast(page)).toContainText('→ Fixture: keys saved');
});

test('a taken key: Replace puts the page on it and the old shortcut is gone', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', OLD);
  const { page, tabId } = await openPage(context, PAGE);
  const popup = await openPopup(context, extensionId, tabId);

  await popup.keyboard.press('KeyK');
  await expect(popup.getByRole('alert')).toContainText(`${await chord(popup, 'K')} already opens Old.`);
  const closed = popup.waitForEvent('close');
  await popup.getByTestId('primary').click();

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

// The key card (product spec §7): the fixture page is on K by its site, so the popup shows the card, not the picker.
const ON_K = { link: `${ORIGIN}/`, name: 'Fixture site', openMode: 'smart', tabMatch: 'site', closeCurrent: false };

/** The popup for a tab whose page is already on a key, once it has drawn the key card. */
async function openCard(context: BrowserContext, extensionId: string, tabId: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await expect(popup.getByText(/^This page is on /)).toBeVisible();
  return popup;
}

test('key card: Opens as saves at once', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', ON_K);
  const { tabId } = await openPage(context, PAGE);
  const popup = await openCard(context, extensionId, tabId);

  await popup.getByRole('combobox', { name: 'Opens as: Smart switch' }).click();
  await popup.getByRole('option', { name: 'Background tab' }).click();

  await expect.poll(() => storedOn(worker, 'K')).toEqual({ ...ON_K, openMode: 'bg' });
  await expect(popup.getByRole('combobox', { name: 'Opens as: Background tab' })).toBeVisible();
});

test('key card: Remove frees the key and the inline Undo puts it back', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', ON_K);
  const { tabId } = await openPage(context, PAGE);
  const popup = await openCard(context, extensionId, tabId);

  await popup.getByRole('button', { name: `Remove from ${await chord(popup, 'K')}` }).click();

  await expect(popup.getByRole('status')).toContainText(`Removed from ${await chord(popup, 'K')}`);
  await expect(popup.getByTestId('primary')).toBeVisible();
  expect(await storedOn(worker, 'K')).toBeUndefined();

  await popup.getByRole('button', { name: 'Undo' }).click();

  await expect(popup.getByText(`This page is on ${await chord(popup, 'K')}`)).toBeVisible();
  expect(await storedOn(worker, 'K')).toEqual(ON_K);
});

test('key card: Move to another key closes the popup, the saved toast shows and its Undo puts the key back', async ({
  context,
  extensionId,
}) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', ON_K);
  const { page, tabId } = await openPage(context, PAGE);
  const popup = await openCard(context, extensionId, tabId);

  await popup.getByRole('button', { name: /^Move to another key/ }).click();
  await popup.keyboard.press('KeyJ');
  await expect(popup.getByTestId('primary')).toHaveText(`Move to ${await chord(popup, 'J')}`);
  const closed = popup.waitForEvent('close');
  await popup.keyboard.press('Enter');

  await closed;
  expect(await storedOn(worker, 'K')).toBeUndefined();
  expect(await storedOn(worker, 'J')).toEqual(ON_K);
  await expect(toast(page)).toContainText(`${await chord(page, 'J')}`);
  await expect(toast(page)).toContainText('→ Fixture site saved');

  await toast(page).getByRole('button', { name: 'Undo' }).click();

  await expect.poll(() => storedOn(worker, 'K')).toEqual(ON_K);
  expect(await storedOn(worker, 'J')).toBeUndefined();
});

test('key card: Use this exact page instead points the link at the tab and the action goes away', async ({
  context,
  extensionId,
}) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', ON_K);
  const { tabId } = await openPage(context, PAGE);
  const popup = await openCard(context, extensionId, tabId);

  await popup.getByRole('button', { name: /^Use this exact page instead/ }).click();

  await expect.poll(() => storedOn(worker, 'K')).toEqual({ ...ON_K, link: PAGE, tabMatch: 'exact' });
  await expect(popup.getByRole('button', { name: /^Use this exact page instead/ })).toHaveCount(0);
  await expect(popup.getByText('Saved as Fixture site ·')).toBeVisible();
});

test('key card: Put it on another key too saves the page on a second key, with the saved toast', async ({
  context,
  extensionId,
}) => {
  const worker = await serviceWorker(context);
  await store(worker, 'K', ON_K);
  const { page, tabId } = await openPage(context, PAGE);
  const popup = await openCard(context, extensionId, tabId);

  await popup.getByRole('button', { name: 'Put it on another key too' }).click();
  await expect(popup.getByText(`Already on ${await chord(popup, 'K')}`)).toBeVisible();
  await popup.keyboard.press('KeyJ');
  const closed = popup.waitForEvent('close');
  await popup.keyboard.press('Enter');

  await closed;
  expect(await storedOn(worker, 'J')).toEqual(SAVED);
  expect(await storedOn(worker, 'K')).toEqual(ON_K);
  await expect(toast(page)).toContainText('→ Fixture: keys saved');
});

test('an unusable page gets the launcher instead of the picker', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  await store(worker, 'D', { link: `${ORIGIN}/frame-child.html?launch`, name: 'Docs', openMode: 'new' });
  const { tabId } = await openPage(context, `chrome-extension://${extensionId}/options.html`);
  const popup = await openLauncher(context, extensionId, tabId);

  await expect(popup.getByText('This page can’t be put on a key')).toBeVisible();
  await expect(popup.getByTestId('overlay-tile')).toHaveText([/Docs/]);
  await expect(popup.getByTestId('primary')).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Open keymap →' })).toBeVisible();
  await expect(popup.getByText(/^Hold /)).toHaveCount(0);
});

test('on a restricted page a key press opens, and This tab replaces that tab', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  const link = `${ORIGIN}/frame-child.html?launch`;
  await store(worker, 'D', { link, name: 'Docs', openMode: 'this', tabMatch: 'exact' });
  const { page, tabId } = await openPage(context, 'chrome://version/');
  const popup = await openLauncher(context, extensionId, tabId);

  await popup.keyboard.press('KeyD');

  await expect(page).toHaveURL(link);
  // Replaced, not opened next to it: no other page is on the link.
  expect(context.pages().filter((other) => other.url() === link)).toEqual([page]);
});

test('on a restricted page a free key says it is free and opens nothing', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  await store(worker, 'D', { link: `${ORIGIN}/frame-child.html?launch`, name: 'Docs' });
  const { tabId } = await openPage(context, 'chrome://version/');
  const popup = await openLauncher(context, extensionId, tabId);
  const pages = context.pages().length;

  await popup.keyboard.press('KeyQ');

  await expect(popup.getByText(`${await chord(popup, 'Q')} is free`)).toBeVisible();
  expect(context.pages()).toHaveLength(pages);
});
