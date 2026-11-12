import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { injectIntoOpenTabs, registerInjectionOnInstall, sendToTab } from './injection';

type Tab = Browser.tabs.Tab;

const NO_RECEIVER = 'Could not establish connection. Receiving end does not exist.';
const RESTRICTED = 'Cannot access contents of url "chrome://newtab/". Extension manifest must request permission.';

/** What the tab answers, per message type: a reply, or a Chrome error message. */
type Answer = { reply: unknown } | { error: string };

/** Every message sent, as `<tabId>/<frameId> <type>`, interleaved with injections. */
let calls: string[];
let answers: Record<string, Answer[]>;
let inject: MockInstance;

/**
 * Fakes Chrome's callback `tabs.sendMessage`, which `@webext-core/messaging` calls on `chrome` (the same fake as
 * `browser` in tests), answering from `answers`.
 */
function fakeTab() {
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(((
    tabId: number,
    message: { type: string },
    options: { frameId?: number } | undefined,
    callback: (response: unknown) => void,
  ) => {
    calls.push(`${tabId}/${options?.frameId} ${message.type}`);
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
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  calls = [];
  answers = {};
  fakeTab();
  inject = vi.spyOn(browser.scripting, 'executeScript').mockImplementation(async (injection) => {
    calls.push(`inject ${JSON.stringify(injection)}`);
    return [];
  });
});

const INJECT_ALL_FRAMES = (tabId: number) =>
  `inject ${JSON.stringify({ target: { tabId, allFrames: true }, files: ['/content-scripts/hud.js'] })}`;

describe('sendToTab', () => {
  it('pings frame 0, then sends the message there and returns its reply', async () => {
    answers = { ping: [{ reply: true }], toast: [{ reply: 'shown' }] };

    expect(await sendToTab(4, 'toast', { kind: 'free', key: 'K' })).toEqual({ kind: 'sent', reply: 'shown' });
    expect(calls).toEqual(['4/0 ping', '4/0 toast']);
  });

  it('injects into every frame when nobody answers, pings once more, then sends', async () => {
    answers = { ping: [{ error: NO_RECEIVER }, { reply: true }], toast: [{ reply: undefined }] };

    expect(await sendToTab(4, 'toast', { kind: 'free', key: 'K' })).toEqual({ kind: 'sent', reply: undefined });
    expect(calls).toEqual(['4/0 ping', INJECT_ALL_FRAMES(4), '4/0 ping', '4/0 toast']);
  });

  it('reports a restricted page without retrying', async () => {
    answers = { ping: [{ error: NO_RECEIVER }] };
    inject.mockRejectedValue(new Error(RESTRICTED));

    expect(await sendToTab(4, 'toast', { kind: 'free', key: 'K' })).toEqual({ kind: 'restricted' });
    expect(calls).toEqual(['4/0 ping']);
  });

  it('reports a restricted page when the ping itself says so', async () => {
    answers = { ping: [{ error: RESTRICTED }] };

    expect(await sendToTab(4, 'toast', { kind: 'free', key: 'K' })).toEqual({ kind: 'restricted' });
    expect(calls).toEqual(['4/0 ping']);
    expect(inject).not.toHaveBeenCalled();
  });

  it('fails after one retry when the injected script still does not answer', async () => {
    answers = { ping: [{ error: NO_RECEIVER }, { error: NO_RECEIVER }] };

    expect(await sendToTab(4, 'toast', { kind: 'free', key: 'K' })).toMatchObject({ kind: 'failed' });
    expect(calls).toEqual(['4/0 ping', INJECT_ALL_FRAMES(4), '4/0 ping']);
  });

  it('fails, without injecting, on any other ping error', async () => {
    answers = { ping: [{ error: 'No tab with id: 4.' }] };

    expect(await sendToTab(4, 'toast', { kind: 'free', key: 'K' })).toMatchObject({ kind: 'failed' });
    expect(inject).not.toHaveBeenCalled();
  });

  it('fails when the live script has no handler for the message', async () => {
    answers = {
      ping: [{ reply: true }],
      toast: [{ error: 'The message port closed before a response was received.' }],
    };

    expect(await sendToTab(4, 'toast', { kind: 'free', key: 'K' })).toMatchObject({ kind: 'failed' });
    expect(calls).toEqual(['4/0 ping', '4/0 toast']);
  });
});

const tab = (id: number, url: string | undefined, fields: Partial<Tab> = {}): Tab =>
  ({ id, url, discarded: false, ...fields }) as Tab;

describe('injectIntoOpenTabs', () => {
  it('injects into every frame of each awake http(s) tab, and skips sleeping and restricted ones', async () => {
    (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockResolvedValue([
      tab(1, 'https://example.com/'),
      tab(2, 'http://localhost:8080/'),
      tab(3, 'chrome://extensions/'),
      tab(4, 'https://sleeping.example/', { discarded: true }),
      tab(5, undefined),
      tab(6, 'file:///tmp/a.html'),
      tab(7, 'https://chromewebstore.google.com/'),
    ]);

    await injectIntoOpenTabs();

    expect(calls).toEqual([INJECT_ALL_FRAMES(1), INJECT_ALL_FRAMES(2)]);
  });

  it('keeps going when one tab refuses the script', async () => {
    (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockResolvedValue([
      tab(1, 'https://closing.example/'),
      tab(2, 'https://example.com/'),
    ]);
    inject.mockRejectedValueOnce(new Error('No tab with id: 1.'));

    await expect(injectIntoOpenTabs()).resolves.toBeUndefined();

    expect(inject).toHaveBeenCalledTimes(2);
  });
});

describe('registerInjectionOnInstall', () => {
  it.each([
    ['install', { reason: 'install' }],
    ['update', { reason: 'update', previousVersion: '1.6.0' }],
  ] as const)('injects into open tabs on %s', async (_, details) => {
    (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockResolvedValue([
      tab(1, 'https://example.com/'),
    ]);
    registerInjectionOnInstall();

    await fakeBrowser.runtime.onInstalled.trigger(details);

    await vi.waitFor(() => expect(calls).toEqual([INJECT_ALL_FRAMES(1)]));
  });
});
