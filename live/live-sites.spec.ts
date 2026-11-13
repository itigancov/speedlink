// `pnpm smoke:live`: release checklist #9, the four open modes on live sites. Real ⌥ + key presses on real pages
// (CDP `page.keyboard.press`, as in e2e/key-capture.spec.ts), against the production build or, with
// `SPEEDLINK_EXTENSION=<folder>`, the unzipped release candidate. Not part of `pnpm e2e` or CI: live sites change
// and go down, so a failure is read by hand before it counts.
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { EXTENSION_PATH, expect, serviceWorker, test } from '../e2e/extension';

interface Tab {
  id: number;
  url?: string;
  pendingUrl?: string;
  active: boolean;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { set(items: object): Promise<void> } };
  tabs: { query(info: object): Promise<Tab[]> };
};

test.use({ extensionPath: process.env.SPEEDLINK_EXTENSION ?? EXTENSION_PATH });

/** A site that redirects to another host (wikipedia.org → www.wikipedia.org), a SPA, and two plain sites. */
const KEYMAP = {
  'key.W': { link: 'https://wikipedia.org/', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
  'key.G': { link: 'https://github.com/', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
  'key.M': { link: 'https://developer.mozilla.org/', openMode: 'new', tabMatch: 'site', closeCurrent: false },
  'key.D': { link: 'https://duckduckgo.com/', openMode: 'this', tabMatch: 'site', closeCurrent: false },
  'key.H': { link: 'https://news.ycombinator.com/', openMode: 'bg', tabMatch: 'site', closeCurrent: false },
};

const allTabs = (worker: Worker) => worker.evaluate(() => chrome.tabs.query({}));
/** A tab's host, or '' while it has no URL yet; a tab that is still loading has only a pending one. */
const host = (tab: Tab) => {
  const url = tab.url || tab.pendingUrl;
  return url !== undefined && URL.canParse(url) ? new URL(url).host : '';
};
const hosts = async (worker: Worker) => (await allTabs(worker)).map(host);
const activeHost = async (worker: Worker) => (await allTabs(worker)).filter((tab) => tab.active).map(host);

async function setUp(context: BrowserContext): Promise<Worker> {
  const worker = await serviceWorker(context);
  await worker.evaluate((items) => chrome.storage.sync.set(items), KEYMAP);
  return worker;
}

async function open(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.bringToFront();
  return page;
}

test('Smart switch opens a redirecting site once, then switches to it', async ({ context }) => {
  const worker = await setUp(context);
  const start = await open(context, 'https://example.com/');

  await start.keyboard.press('Alt+KeyW');
  await expect.poll(() => activeHost(worker)).toEqual(['www.wikipedia.org']);
  const count = (await allTabs(worker)).length;

  await start.bringToFront();
  await start.keyboard.press('Alt+KeyW');
  await expect.poll(() => activeHost(worker)).toEqual(['www.wikipedia.org']);
  expect(await allTabs(worker)).toHaveLength(count);
});

test('Smart switch from a SPA goes to an open tab on the same site', async ({ context }) => {
  const worker = await setUp(context);
  await open(context, 'https://www.wikipedia.org/');
  const spa = await open(context, 'https://github.com/');
  const count = (await allTabs(worker)).length;

  await spa.keyboard.press('Alt+KeyW');

  await expect.poll(() => activeHost(worker)).toEqual(['www.wikipedia.org']);
  expect(await allTabs(worker)).toHaveLength(count);
});

test('New tab opens another tab even when the site is open', async ({ context }) => {
  const worker = await setUp(context);
  await open(context, 'https://developer.mozilla.org/');
  const start = await open(context, 'https://example.com/');

  await start.keyboard.press('Alt+KeyM');

  await expect
    .poll(async () => (await hosts(worker)).filter((host) => host === 'developer.mozilla.org'))
    .toHaveLength(2);
  expect(await activeHost(worker)).toEqual(['developer.mozilla.org']);
});

test('This tab replaces the current page', async ({ context }) => {
  const worker = await setUp(context);
  const start = await open(context, 'https://example.com/');
  const count = (await allTabs(worker)).length;

  await start.keyboard.press('Alt+KeyD');

  await expect(start).toHaveURL(/^https:\/\/duckduckgo\.com\//);
  expect(await allTabs(worker)).toHaveLength(count);
});

test('Background opens the site without leaving the page', async ({ context }) => {
  const worker = await setUp(context);
  const start = await open(context, 'https://example.com/');

  await start.keyboard.press('Alt+KeyH');

  await expect.poll(async () => (await hosts(worker)).includes('news.ycombinator.com')).toBe(true);
  expect(await activeHost(worker)).toEqual(['example.com']);
});
