import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openOptions } from './options-tab';

type Tab = Browser.tabs.Tab;

const OPTIONS = browser.runtime.getURL('/options.html');

const tab = (id: number, fields: Partial<Tab> = {}): Tab =>
  ({ id, windowId: 1, index: id, url: 'https://example.com/', lastAccessed: id, pinned: false, ...fields }) as Tab;

let calls: string[];

function openTabs(tabs: Tab[], windowType = 'normal') {
  // The promise overloads; the callback ones make `mockResolvedValue` expect void.
  (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockResolvedValue(tabs);
  (
    vi.spyOn(browser.windows, 'get') as unknown as MockInstance<() => Promise<Browser.windows.Window>>
  ).mockResolvedValue({ id: 1, type: windowType } as Browser.windows.Window);
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  calls = [];
  vi.spyOn(browser.tabs, 'update').mockImplementation(async (tabId, info) => {
    calls.push(`tabs.update ${tabId} ${JSON.stringify(info)}`);
    return tab(tabId as number);
  });
  vi.spyOn(browser.windows, 'update').mockImplementation(async (windowId, info) => {
    calls.push(`windows.update ${windowId} ${JSON.stringify(info)}`);
    return { id: windowId } as Browser.windows.Window;
  });
  vi.spyOn(browser.tabs, 'create').mockImplementation(async (props) => {
    calls.push(`tabs.create ${JSON.stringify(props)}`);
    return tab(9);
  });
});

describe('openOptions', () => {
  const sender = tab(2, { index: 4 });

  it('focuses the most recently used Options tab, its window too, and selects the key through the hash', async () => {
    openTabs([
      sender,
      tab(5, { url: `${OPTIONS}#key=A`, lastAccessed: 50, windowId: 3 }),
      tab(6, { url: OPTIONS, lastAccessed: 10 }),
    ]);

    await openOptions('K', sender);

    // Only the hash changes, so the page is not reloaded and an unsaved draft survives.
    expect(calls).toEqual([
      `tabs.update 5 {"active":true,"url":"${OPTIONS}#key=K"}`,
      'windows.update 3 {"focused":true}',
    ]);
  });

  it('without a key, focuses the Options tab and leaves its URL alone', async () => {
    openTabs([sender, tab(5, { url: `${OPTIONS}#key=A` })]);

    await openOptions(undefined, sender);

    expect(calls).toEqual(['tabs.update 5 {"active":true}', 'windows.update 1 {"focused":true}']);
  });

  it('with no Options tab, opens one next to the sender tab with the key selected', async () => {
    openTabs([sender, tab(5, { url: `${OPTIONS.replace('options', 'welcome')}` })]);

    await openOptions('K', sender);

    expect(calls).toEqual([`tabs.create {"url":"${OPTIONS}#key=K","windowId":1,"index":5,"openerTabId":2}`]);
  });

  it('without a sender tab (the popup), opens Options wherever Chrome puts it', async () => {
    openTabs([]);

    await openOptions(undefined, undefined);

    expect(calls).toEqual([`tabs.create {"url":"${OPTIONS}"}`]);
  });

  it('from a tab in a popup window, opens Options in a normal window', async () => {
    openTabs([sender], 'popup');

    await openOptions('K', sender);

    expect(calls).toEqual([`tabs.create {"url":"${OPTIONS}#key=K"}`]);
  });
});
