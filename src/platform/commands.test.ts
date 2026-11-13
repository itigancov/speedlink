import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { toggleOverlay } from './commands';

type Tab = Browser.tabs.Tab;

const NO_RECEIVER = 'Could not establish connection. Receiving end does not exist.';
const RESTRICTED =
  'Cannot access contents of url "chrome-extension://abc/viewer.pdf". Extension manifest must request permission.';
const OPTIONS = browser.runtime.getURL('/options.html');

/** What the tab answers, per message type: a reply, or a Chrome error message. */
type Answer = { reply: unknown } | { error: string };

/** Every message sent to a tab, as `<tabId>/<frameId> <type> <data>`, and every Options tab opened or focused. */
let calls: string[];
let answers: Record<string, Answer[]>;
let inject: MockInstance;

const tab = (id: number, url: string, fields: Partial<Tab> = {}): Tab =>
  ({ id, windowId: 1, index: id, url, lastAccessed: id, ...fields }) as Tab;

/** The open tabs; `active` answers a query for the active tab of the last focused window. */
function openTabs(tabs: Tab[], active?: Tab) {
  (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<(info: object) => Promise<Tab[]>>).mockImplementation(
    async (info) => ('active' in info ? (active === undefined ? [] : [active]) : tabs),
  );
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  calls = [];
  answers = {};
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(((
    tabId: number,
    message: { type: string; data: unknown },
    options: { frameId?: number } | undefined,
    callback: (response: unknown) => void,
  ) => {
    calls.push(`${tabId}/${options?.frameId} ${message.type} ${JSON.stringify(message.data ?? null)}`);
    const answer = answers[message.type]?.shift() ?? { error: NO_RECEIVER };
    setTimeout(() => {
      if ('error' in answer) {
        Object.defineProperty(browser.runtime, 'lastError', { value: { message: answer.error }, configurable: true });
        callback(undefined);
        Object.defineProperty(browser.runtime, 'lastError', { value: undefined, configurable: true });
      } else {
        callback({ res: answer.reply });
      }
    });
  }) as never);
  inject = vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async () => []);
  (
    vi.spyOn(browser.windows, 'get') as unknown as MockInstance<() => Promise<Browser.windows.Window>>
  ).mockResolvedValue({ id: 1, type: 'normal' } as Browser.windows.Window);
  vi.spyOn(browser.tabs, 'create').mockImplementation(async (props) => {
    calls.push(`tabs.create ${JSON.stringify(props)}`);
    return tab(9, OPTIONS);
  });
  vi.spyOn(browser.tabs, 'update').mockImplementation(async (tabId, info) => {
    calls.push(`tabs.update ${tabId} ${JSON.stringify(info)}`);
    return tab(tabId as number, OPTIONS);
  });
  vi.spyOn(browser.windows, 'update').mockImplementation(async (windowId) => ({ id: windowId }) as never);
});

describe('toggleOverlay: the toggle-overlay command', () => {
  it('toggles the overlay in the tab’s top frame', async () => {
    const page = tab(2, 'https://example.com/');
    openTabs([page]);
    answers = { ping: [{ reply: true }], overlay: [{ reply: undefined }] };

    await toggleOverlay(page);

    expect(calls).toEqual(['2/0 ping null', '2/0 overlay {"action":"toggle"}']);
  });

  it('reaches a tab opened before the install by injecting first', async () => {
    const page = tab(2, 'https://example.com/');
    openTabs([page]);
    answers = { ping: [{ error: NO_RECEIVER }, { reply: true }], overlay: [{ reply: undefined }] };

    await toggleOverlay(page);

    expect(inject).toHaveBeenCalledOnce();
    expect(calls.at(-1)).toBe('2/0 overlay {"action":"toggle"}');
  });

  it.each([
    'chrome://extensions/',
    'https://chromewebstore.google.com/detail/x',
    'https://www.google.com/_/chrome/newtab',
    browser.runtime.getURL('/welcome.html'),
  ])('opens Options next to %s, which can’t host the overlay, without messaging it', async (url) => {
    const page = tab(2, url);
    openTabs([page]);

    await toggleOverlay(page);

    expect(calls).toEqual([`tabs.create {"url":"${OPTIONS}","windowId":1,"index":3,"openerTabId":2}`]);
  });

  it('focuses an Options tab that is already open', async () => {
    const page = tab(2, 'chrome://version/');
    openTabs([page, tab(5, OPTIONS)]);

    await toggleOverlay(page);

    expect(calls).toEqual(['tabs.update 5 {"active":true}']);
  });

  it('opens Options when Chrome refuses to script the page (the PDF viewer)', async () => {
    const page = tab(2, 'https://example.com/report.pdf');
    openTabs([page]);
    answers = { ping: [{ error: RESTRICTED }] };

    await toggleOverlay(page);

    expect(calls).toEqual(['2/0 ping null', `tabs.create {"url":"${OPTIONS}","windowId":1,"index":3,"openerTabId":2}`]);
  });

  it('does nothing when the tab can’t be reached for now (mid-navigation)', async () => {
    const page = tab(2, 'https://example.com/');
    openTabs([page]);
    answers = { ping: [{ error: 'No tab with id: 2.' }] };

    await toggleOverlay(page);

    expect(calls).toEqual(['2/0 ping null']);
  });

  it('takes the active tab of the last focused window when Chrome passes none', async () => {
    const page = tab(4, 'https://example.com/');
    openTabs([page], page);
    answers = { ping: [{ reply: true }], overlay: [{ reply: undefined }] };

    await toggleOverlay(undefined);

    expect(calls).toEqual(['4/0 ping null', '4/0 overlay {"action":"toggle"}']);
  });

  it('does nothing without any tab', async () => {
    openTabs([]);

    await expect(toggleOverlay(undefined)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });
});
