import type { BrowserContext, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, HOOKS_EXTENSION_PATH, test } from './extension';

// Opening a shortcut in real Chrome (product spec §4.1), driven through the e2e-only `speedlinkE2E.openKey` hook:
// the same function the `openKey` message runs, given a real sender tab. Combinations are unit-tested in
// src/domain/open-plan.test.ts; this covers what the fake browser can't: lastAccessed, focus, close, the badge.

interface Tab {
  id: number;
  windowId: number;
  index: number;
  active: boolean;
  url?: string;
  status?: string;
}
interface Window {
  id: number;
  focused: boolean;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { set(items: object): Promise<void> } };
  tabs: {
    create(props: object): Promise<Tab>;
    get(id: number): Promise<Tab>;
    update(id: number, props: object): Promise<Tab>;
    query(info: object): Promise<Tab[]>;
  };
  windows: {
    create(data: object): Promise<Window & { tabs: Tab[] }>;
    get(id: number): Promise<Window>;
    update(id: number, info: object): Promise<Window>;
    getAll(): Promise<Window[]>;
  };
  action: { getBadgeText(details: object): Promise<string> };
};
declare const speedlinkE2E: { openKey(request: object, senderTab: Tab): Promise<unknown> };

test.use({ extensionPath: HOOKS_EXTENSION_PATH });

const page = (name: string) => `http://127.0.0.1:${FIXTURE_PORT}/frame-child.html?${name}`;

async function serviceWorker(context: BrowserContext, extensionId: string): Promise<Worker> {
  const worker = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  if (worker === undefined) throw new Error('no service worker');
  await expect.poll(() => worker.evaluate(() => typeof speedlinkE2E)).toBe('object');
  return worker;
}

const store = (worker: Worker, key: string, fields: object) =>
  worker.evaluate(([item, value]) => chrome.storage.sync.set({ [item]: value }), [
    `key.${key}`,
    { tabMatch: 'exact', closeCurrent: false, ...fields },
  ] as const);

/** Opens a tab and waits until it has loaded. */
async function openTab(worker: Worker, url: string, windowId?: number): Promise<Tab> {
  const tab = await worker.evaluate((props) => chrome.tabs.create(props), { url, windowId, active: true });
  await expect.poll(() => worker.evaluate((id) => chrome.tabs.get(id), tab.id).then((t) => t.status)).toBe('complete');
  return worker.evaluate((id) => chrome.tabs.get(id), tab.id);
}

const activate = (worker: Worker, tab: Tab) =>
  worker.evaluate(
    async ({ id, windowId }) => {
      await chrome.windows.update(windowId, { focused: true });
      await chrome.tabs.update(id, { active: true });
    },
    { id: tab.id, windowId: tab.windowId },
  );

const press = (worker: Worker, tab: Tab, key: string, force = false) =>
  worker.evaluate(async ({ id, request }) => speedlinkE2E.openKey(request, await chrome.tabs.get(id)), {
    id: tab.id,
    request: { key, force },
  });

const tabsIn = (worker: Worker, windowId: number) =>
  worker.evaluate((id) => chrome.tabs.query({ windowId: id }), windowId);

const activeTab = async (worker: Worker, windowId: number) =>
  (await tabsIn(worker, windowId)).find((tab) => tab.active);

test('Smart switch goes to the most recently used matching tab', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'D', { link: page('docs'), openMode: 'smart' });
  const older = await openTab(worker, page('docs'));
  const newer = await openTab(worker, page('docs'));
  const current = await openTab(worker, page('elsewhere'));
  // Use the older one last, so it is the most recently used.
  await activate(worker, newer);
  await activate(worker, older);
  await activate(worker, current);

  expect(await press(worker, current, 'D')).toEqual({ kind: 'opened', tabId: older.id, switched: true });
  expect((await activeTab(worker, current.windowId))?.id).toBe(older.id);
});

test('Smart switch activates a match in another window and focuses that window', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'D', { link: page('docs'), openMode: 'smart' });
  const [first] = await worker.evaluate(() => chrome.windows.getAll());
  if (first === undefined) throw new Error('no window');
  const other = await worker.evaluate((url) => chrome.windows.create({ url, focused: true }), page('docs'));
  const current = await openTab(worker, page('elsewhere'), first.id);
  await activate(worker, current);

  expect(await press(worker, current, 'D')).toMatchObject({ kind: 'opened', switched: true });
  await expect.poll(() => worker.evaluate((id) => chrome.windows.get(id), other.id).then((w) => w.focused)).toBe(true);
  expect((await activeTab(worker, other.id))?.url).toBe(page('docs'));
});

test('New tab opens right after the current tab, active', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'D', { link: page('docs'), openMode: 'new' });
  const current = await openTab(worker, page('first'));
  await openTab(worker, page('last'));
  await activate(worker, current);

  const reply = (await press(worker, current, 'D')) as { tabId: number };

  const tabs = await tabsIn(worker, current.windowId);
  expect(tabs.find((tab) => tab.id === reply.tabId)).toMatchObject({ index: current.index + 1, active: true });
});

test('close current removes the source tab and leaves the target active', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'D', { link: page('docs'), openMode: 'smart', closeCurrent: true });
  const target = await openTab(worker, page('docs'));
  const current = await openTab(worker, page('elsewhere'));

  await press(worker, current, 'D');

  const tabs = await tabsIn(worker, current.windowId);
  expect(tabs.map((tab) => tab.id)).not.toContain(current.id);
  expect((await activeTab(worker, current.windowId))?.id).toBe(target.id);
});

test('Background tab with close current leaves the new tab active', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'D', { link: page('docs'), openMode: 'bg', closeCurrent: true });
  await openTab(worker, page('before'));
  const current = await openTab(worker, page('elsewhere'));
  await openTab(worker, page('after'));
  await activate(worker, current);

  const reply = (await press(worker, current, 'D')) as { tabId: number };

  const tabs = await tabsIn(worker, current.windowId);
  expect(tabs.map((tab) => tab.id)).not.toContain(current.id);
  expect((await activeTab(worker, current.windowId))?.id).toBe(reply.tabId);
});

test('the badge shows the key once the new page has loaded, then clears', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'D', { link: page('docs'), openMode: 'new' });
  const current = await openTab(worker, page('elsewhere'));

  const { tabId } = (await press(worker, current, 'D')) as { tabId: number };
  const badge = () => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

  await expect.poll(badge, { intervals: [50] }).toBe('D');
  expect(await worker.evaluate((id) => chrome.tabs.get(id), tabId).then((t) => t.status)).toBe('complete');
  await expect.poll(badge, { intervals: [100], timeout: 3000 }).toBe('');
});
