import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { readOverlayModel } from './overlay';

type Tab = Browser.tabs.Tab;

const tab = (id: number, url: string, fields: Partial<Tab> = {}): Tab =>
  ({
    id,
    windowId: 1,
    index: id,
    url,
    title: '',
    lastAccessed: id,
    pinned: false,
    incognito: false,
    groupId: -1,
    ...fields,
  }) as Tab;

const NEW_TAB = tab(3, 'chrome://newtab/');
const DOCS = tab(5, 'https://docs.example.com/');

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockResolvedValue([NEW_TAB, DOCS]);
  (
    vi.spyOn(browser.windows, 'getAll') as unknown as MockInstance<() => Promise<Browser.windows.Window[]>>
  ).mockResolvedValue([{ id: 1, type: 'normal' } as Browser.windows.Window]);
  await browser.storage.sync.set({
    'key.D': { link: 'https://docs.example.com/', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
  });
});

describe('readOverlayModel', () => {
  it("builds for the sender's tab", async () => {
    const model = await readOverlayModel(DOCS, undefined);
    expect(model.tiles).toHaveLength(1);
    expect(model.tiles[0]?.key).toBe('D');
  });

  it('builds for the named tab when there is no sender tab (the popup)', async () => {
    const model = await readOverlayModel(undefined, NEW_TAB.id);
    expect(model.tiles[0]?.subline).toEqual({ kind: 'tab', index: 6 });
  });

  it("prefers the sender's tab to a named one", async () => {
    await expect(readOverlayModel(DOCS, 99)).resolves.toBeDefined();
  });

  it('rejects without a tab, or with one that is gone', async () => {
    await expect(readOverlayModel(undefined, undefined)).rejects.toThrow();
    await expect(readOverlayModel(undefined, 99)).rejects.toThrow();
  });
});
