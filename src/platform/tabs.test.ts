import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { PlanTab } from '@/domain/open-plan';
import { installTabsOnReplaced } from '@/test/fake-replaced';
import { watchPlanTabs } from './tabs';

type Tab = Browser.tabs.Tab;

const tab = (id: number, fields: Partial<Tab> = {}): Tab =>
  ({
    id,
    windowId: 1,
    index: id,
    url: 'https://example.com/',
    title: 'Example',
    lastAccessed: id,
    pinned: false,
    incognito: false,
    groupId: -1,
    ...fields,
  }) as Tab;

let open: Tab[];
let reads: PlanTab[][];
let query: MockInstance;
let onReplaced: ReturnType<typeof installTabsOnReplaced>;

/** Lets the coalescing timer fire and the read's promises settle. */
const settle = () => vi.runAllTimersAsync();

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.useFakeTimers();
  onReplaced = installTabsOnReplaced();
  open = [tab(1)];
  reads = [];
  query = (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockImplementation(
    async () => open,
  );
  (
    vi.spyOn(browser.windows, 'getAll') as unknown as MockInstance<() => Promise<Browser.windows.Window[]>>
  ).mockResolvedValue([{ id: 1, type: 'normal' } as Browser.windows.Window]);
});

afterEach(() => {
  vi.useRealTimers();
});

const urls = () => reads.at(-1)?.map((t) => t.url);

describe('watchPlanTabs', () => {
  it('calls back with a first read, titles included', async () => {
    watchPlanTabs((tabs) => reads.push(tabs));
    await settle();
    expect(reads).toEqual([[expect.objectContaining({ id: 1, url: 'https://example.com/', title: 'Example' })]]);
  });

  it('reads again when a tab is created, removed or replaced', async () => {
    watchPlanTabs((tabs) => reads.push(tabs));
    await settle();

    open = [tab(1), tab(2, { url: 'https://two.example/' })];
    await fakeBrowser.tabs.onCreated.trigger(open[1] as Tab);
    await settle();
    expect(urls()).toEqual(['https://example.com/', 'https://two.example/']);

    open = [tab(2, { url: 'https://two.example/' })];
    await fakeBrowser.tabs.onRemoved.trigger(1, { windowId: 1, isWindowClosing: false });
    await settle();
    expect(urls()).toEqual(['https://two.example/']);

    open = [tab(3, { url: 'https://three.example/' })];
    onReplaced.trigger(3, 2);
    await settle();
    expect(urls()).toEqual(['https://three.example/']);
  });

  it('reads again when a tab’s URL changes, but not on other updates', async () => {
    watchPlanTabs((tabs) => reads.push(tabs));
    await settle();

    await fakeBrowser.tabs.onUpdated.trigger(1, { status: 'loading' }, tab(1));
    await fakeBrowser.tabs.onUpdated.trigger(1, { title: 'New title' }, tab(1));
    await settle();
    expect(reads).toHaveLength(1);

    open = [tab(1, { url: 'https://moved.example/' })];
    await fakeBrowser.tabs.onUpdated.trigger(1, { url: 'https://moved.example/' }, open[0] as Tab);
    await settle();
    expect(urls()).toEqual(['https://moved.example/']);
  });

  it('reads again when a window opens or closes', async () => {
    watchPlanTabs((tabs) => reads.push(tabs));
    await settle();

    await fakeBrowser.windows.onCreated.trigger({ id: 2, type: 'popup' } as Browser.windows.Window);
    await settle();
    await fakeBrowser.windows.onRemoved.trigger(2);
    await settle();
    expect(reads).toHaveLength(3);
  });

  it('coalesces a burst of events into one read', async () => {
    watchPlanTabs((tabs) => reads.push(tabs));
    await settle();
    query.mockClear();

    await fakeBrowser.tabs.onCreated.trigger(tab(2));
    await fakeBrowser.tabs.onCreated.trigger(tab(3));
    await fakeBrowser.tabs.onRemoved.trigger(2, { windowId: 1, isWindowClosing: false });
    await settle();

    expect(query).toHaveBeenCalledTimes(1);
    expect(reads).toHaveLength(2);
  });

  it('stops after unsubscribe', async () => {
    const unwatch = watchPlanTabs((tabs) => reads.push(tabs));
    await settle();
    unwatch();

    await fakeBrowser.tabs.onCreated.trigger(tab(2));
    await settle();
    expect(reads).toHaveLength(1);
  });
});
