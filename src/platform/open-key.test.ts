import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOpenKey } from './open-key';

type Tab = Browser.tabs.Tab;

/** A tab in window 1 (normal) unless told otherwise. */
const tab = (id: number, fields: Partial<Tab> = {}): Tab =>
  ({
    id,
    windowId: 1,
    index: id,
    url: 'https://other.example/',
    lastAccessed: id,
    pinned: false,
    incognito: false,
    groupId: -1,
    active: false,
    highlighted: false,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    selected: false,
    ...fields,
  }) as Tab;

const LINK = 'https://docs.example.com/';
const current = tab(1, { index: 0, active: true });

/** Calls to the tab and window APIs, in order: what Chrome was asked to do. */
let calls: string[];
let create: MockInstance;
let remove: MockInstance;

function openTabs(
  tabs: Tab[],
  windows: Browser.windows.Window[] = [{ id: 1, type: 'normal' } as Browser.windows.Window],
) {
  // The promise overloads; the callback ones make `mockResolvedValue` expect void.
  (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockResolvedValue(tabs);
  (
    vi.spyOn(browser.windows, 'getAll') as unknown as MockInstance<() => Promise<Browser.windows.Window[]>>
  ).mockResolvedValue(windows);
}

const store = (key: string, fields: object) =>
  browser.storage.sync.set({
    [`key.${key}`]: { link: LINK, openMode: 'smart', tabMatch: 'site', closeCurrent: false, ...fields },
  });

const badge = (tabId: number) => browser.action.getBadgeText({ tabId });

const status = (tabId: number, value: 'loading' | 'complete') =>
  fakeBrowser.tabs.onUpdated.trigger(tabId, { status: value }, tab(tabId, { status: value }));

/** Chrome's `status: 'loading'`, then `'complete'`, for a tab. */
const loaded = async (tabId: number) => {
  await status(tabId, 'loading');
  await status(tabId, 'complete');
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  calls = [];
  vi.spyOn(browser.tabs, 'update').mockImplementation(async (tabId, info) => {
    calls.push(`tabs.update ${tabId} ${JSON.stringify(info)}`);
    return tab(tabId as number);
  });
  vi.spyOn(browser.windows, 'update').mockImplementation(async (windowId, info) => {
    calls.push(`windows.update ${windowId} ${JSON.stringify(info)}`);
    return { id: windowId } as Browser.windows.Window;
  });
  create = vi.spyOn(browser.tabs, 'create').mockImplementation(async (props) => {
    calls.push(`tabs.create ${JSON.stringify(props)}`);
    return tab(9, { windowId: props.windowId ?? 1 });
  });
  vi.spyOn(browser.tabs, 'group').mockImplementation(async (options) => {
    calls.push(`tabs.group ${JSON.stringify(options)}`);
    return options.groupId ?? 0;
  });
  remove = vi.spyOn(browser.tabs, 'remove').mockImplementation(async (tabIds) => {
    calls.push(`tabs.remove ${tabIds}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('openKey', () => {
  it('replies free for a key with no shortcut, and touches no tab', async () => {
    openTabs([current]);
    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({ kind: 'free' });
    expect(calls).toEqual([]);
  });

  it('reads the keymap fresh on every press, so a key cleared since reads as free', async () => {
    openTabs([current]);
    const openKey = createOpenKey();
    await store('D', { openMode: 'new' });
    expect((await openKey({ key: 'D', force: false }, current)).kind).toBe('opened');

    await browser.storage.sync.remove('key.D');

    expect(await openKey({ key: 'D', force: false }, current)).toEqual({ kind: 'free' });
  });

  it('replies failed without a sender tab', async () => {
    await store('D', {});
    expect(await createOpenKey()({ key: 'D', force: false }, undefined)).toEqual({ kind: 'failed' });
  });

  it('replies noop, with no badge, when Smart switch is already on the tab', async () => {
    const onIt = tab(1, { url: LINK });
    openTabs([onIt]);
    await store('D', { closeCurrent: true });

    expect(await createOpenKey()({ key: 'D', force: false }, onIt)).toEqual({ kind: 'noop' });
    expect(calls).toEqual([]);
    expect(await badge(1)).toBe('');
  });

  it('switches to a matching tab in another window, raising that window, and reports the switch', async () => {
    openTabs(
      [current, tab(5, { url: LINK, windowId: 2 })],
      [{ id: 1, type: 'normal' } as Browser.windows.Window, { id: 2, type: 'normal' } as Browser.windows.Window],
    );
    await store('D', {});

    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({
      kind: 'opened',
      tabId: 5,
      switched: true,
    });
    expect(calls).toEqual(['tabs.update 5 {"active":true}', 'windows.update 2 {"focused":true}']);
  });

  it('opens a new tab next to the current one, in its group, with the current tab as opener', async () => {
    const grouped = tab(1, { index: 3, groupId: 7 });
    openTabs([grouped]);
    await store('D', { openMode: 'new' });

    expect(await createOpenKey()({ key: 'D', force: false }, grouped)).toEqual({
      kind: 'opened',
      tabId: 9,
      switched: false,
    });
    expect(calls).toEqual([
      `tabs.create {"url":"${LINK}","windowId":1,"index":4,"openerTabId":1,"active":true}`,
      'tabs.group {"tabIds":[9],"groupId":7}',
    ]);
  });

  it('loads This tab in the current tab', async () => {
    openTabs([current]);
    await store('D', { openMode: 'this', closeCurrent: true });

    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({
      kind: 'opened',
      tabId: 1,
      switched: false,
    });
    expect(calls).toEqual([`tabs.update 1 {"url":"${LINK}"}`]);
  });

  it('closes the current tab only after the link is open and its window focused', async () => {
    openTabs([current, tab(5, { url: LINK })]);
    await store('D', { closeCurrent: true });

    await createOpenKey()({ key: 'D', force: false }, current);

    expect(calls).toEqual(['tabs.update 5 {"active":true}', 'windows.update 1 {"focused":true}', 'tabs.remove 1']);
  });

  it('still counts the open when closing the current tab fails', async () => {
    openTabs([current]);
    await store('D', { openMode: 'new', closeCurrent: true });
    remove.mockRejectedValue(new Error('Tabs cannot be edited right now'));

    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({
      kind: 'opened',
      tabId: 9,
      switched: false,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('replies failed, logged and without a retry, when a tab call fails', async () => {
    openTabs([current]);
    await store('D', { openMode: 'new' });
    create.mockRejectedValue(new Error('boom'));

    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({ kind: 'failed' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('Force new tab opens a new tab even on a matching tab, and never closes it', async () => {
    const onIt = tab(1, { url: LINK });
    openTabs([onIt]);
    await store('D', { closeCurrent: true });

    expect(await createOpenKey()({ key: 'D', force: true }, onIt)).toMatchObject({ kind: 'opened', tabId: 9 });
    expect(calls).toEqual([`tabs.create {"url":"${LINK}","windowId":1,"index":2,"openerTabId":1,"active":true}`]);
  });
});

describe('openKey: page toasts', () => {
  /** Messages sent to tabs, as `<tabId>/<frameId> <type> <data>`; the tab's script answers every one. */
  let sent: string[];

  beforeEach(() => {
    sent = [];
    vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(((
      tabId: number,
      message: { type: string; data: unknown },
      options: { frameId?: number } | undefined,
      callback: (response: unknown) => void,
    ) => {
      sent.push(`${tabId}/${options?.frameId} ${message.type} ${JSON.stringify(message.data ?? null)}`);
      callback({ res: message.type === 'ping' ? true : undefined });
    }) as never);
  });

  it('on a free key, sends the free toast to the top frame of the tab the key was pressed on', async () => {
    openTabs([current]);

    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({ kind: 'free' });

    await vi.waitFor(() => expect(sent).toEqual(['1/0 ping null', '1/0 toast {"kind":"free","key":"D"}']));
  });

  it('after a Smart switch, sends the switched toast with the shortcut name to the activated tab', async () => {
    openTabs(
      [current, tab(5, { url: LINK, windowId: 2 })],
      [{ id: 1, type: 'normal' } as Browser.windows.Window, { id: 2, type: 'normal' } as Browser.windows.Window],
    );
    await store('D', { name: 'Docs' });

    await createOpenKey()({ key: 'D', force: false }, current);

    await vi.waitFor(() =>
      expect(sent).toEqual(['5/0 ping null', '5/0 toast {"kind":"switched","key":"D","name":"Docs"}']),
    );
  });

  it("names a shortcut without a name by its link's site", async () => {
    openTabs([current, tab(5, { url: LINK })]);
    await store('D', {});

    await createOpenKey()({ key: 'D', force: false }, current);

    await vi.waitFor(() =>
      expect(sent).toEqual(['5/0 ping null', '5/0 toast {"kind":"switched","key":"D","name":"docs.example.com"}']),
    );
  });

  it('still replies opened when the switched toast cannot be delivered', async () => {
    openTabs([current, tab(5, { url: LINK })]);
    await store('D', {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.mocked(browser.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      _options: unknown,
      callback: (response: unknown) => void,
    ) => {
      // How Chrome refuses a restricted page: `lastError` set during the callback.
      Object.defineProperty(browser.runtime, 'lastError', {
        value: { message: 'Cannot access contents of url "chrome://newtab/".' },
        configurable: true,
      });
      callback(undefined);
      Object.defineProperty(browser.runtime, 'lastError', { value: undefined, configurable: true });
    }) as never);

    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({
      kind: 'opened',
      tabId: 5,
      switched: true,
    });
    await vi.waitFor(() => expect(console.debug).toHaveBeenCalled());
  });

  it.each([
    ['an assigned key that opens a new tab', { openMode: 'new' }, false, tab(1)],
    ['an assigned key that updates the current tab', { openMode: 'this' }, false, tab(1)],
    ['Force new tab past a matching tab', {}, true, tab(1)],
    ['a Smart switch already on the tab (noop)', {}, false, tab(1, { url: LINK })],
  ] as const)('sends nothing for %s', async (_, fields, force, from) => {
    openTabs([from, tab(5, { url: LINK })]);
    await store('D', fields);

    await createOpenKey()({ key: 'D', force }, from);
    await vi.advanceTimersByTimeAsync(0);

    expect(sent).toEqual([]);
  });

  it('sends nothing when the switch fails', async () => {
    openTabs([current, tab(5, { url: LINK })]);
    await store('D', {});
    vi.mocked(browser.tabs.update).mockRejectedValue(new Error('No tab with id: 5.'));

    expect(await createOpenKey()({ key: 'D', force: false }, current)).toEqual({ kind: 'failed' });
    await vi.advanceTimersByTimeAsync(0);

    expect(sent).toEqual([]);
  });
});

describe('openKey: badge flash', () => {
  it('after a switch, shows the key on the target at once, in the accent colour, then clears it after 1.5 s', async () => {
    openTabs([current, tab(5, { url: LINK })]);
    await store('D', {});

    await createOpenKey()({ key: 'D', force: false }, current);
    await vi.advanceTimersByTimeAsync(0);

    expect(await badge(5)).toBe('D');
    expect(await browser.action.getBadgeBackgroundColor({ tabId: 5 })).toEqual([0, 102, 255, 255]);
    await vi.advanceTimersByTimeAsync(1499);
    expect(await badge(5)).toBe('D');
    await vi.advanceTimersByTimeAsync(1);
    expect(await badge(5)).toBe('');
  });

  it('after a new tab, waits for the page to finish loading', async () => {
    openTabs([current]);
    await store('D', { openMode: 'new' });

    await createOpenKey()({ key: 'D', force: false }, current);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await badge(9)).toBe('');

    await loaded(9);
    await vi.advanceTimersByTimeAsync(0);
    expect(await badge(9)).toBe('D');
  });

  it('after This tab, waits for the current tab to finish loading', async () => {
    openTabs([current]);
    await store('D', { openMode: 'this' });

    await createOpenKey()({ key: 'D', force: false }, current);
    await vi.advanceTimersByTimeAsync(0);
    expect(await badge(1)).toBe('');

    await loaded(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(await badge(1)).toBe('D');
  });

  it('after This tab, ignores the old page finishing its load', async () => {
    openTabs([current]);
    await store('D', { openMode: 'this' });

    await createOpenKey()({ key: 'D', force: false }, current);
    await status(1, 'complete');
    await vi.advanceTimersByTimeAsync(0);
    expect(await badge(1)).toBe('');

    await loaded(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(await badge(1)).toBe('D');
  });

  it('ignores loads of other tabs', async () => {
    openTabs([current]);
    await store('D', { openMode: 'new' });

    await createOpenKey()({ key: 'D', force: false }, current);
    await loaded(4);
    await vi.advanceTimersByTimeAsync(0);

    expect(await badge(9)).toBe('');
    expect(await badge(4)).toBe('');
  });

  it('gives up when the page has not loaded after 10 s', async () => {
    openTabs([current]);
    await store('D', { openMode: 'new' });

    await createOpenKey()({ key: 'D', force: false }, current);
    await vi.advanceTimersByTimeAsync(10_000);
    await loaded(9);
    await vi.advanceTimersByTimeAsync(0);

    expect(await badge(9)).toBe('');
  });

  it('Background tab flashes the tab you stay on, at once', async () => {
    openTabs([current]);
    await store('D', { openMode: 'bg' });

    await createOpenKey()({ key: 'D', force: false }, current);
    await vi.advanceTimersByTimeAsync(0);

    expect(await badge(1)).toBe('D');
    expect(await badge(9)).toBe('');
  });

  it('a second flash on the same tab restarts its timer', async () => {
    openTabs([current, tab(5, { url: LINK })]);
    await store('D', {});
    const openKey = createOpenKey();

    await openKey({ key: 'D', force: false }, current);
    await vi.advanceTimersByTimeAsync(1000);
    await openKey({ key: 'D', force: false }, current);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await badge(5)).toBe('D');
    await vi.advanceTimersByTimeAsync(500);
    expect(await badge(5)).toBe('');
  });
});
