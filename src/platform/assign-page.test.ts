import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { UndoRecord } from '@/domain/assign-plan';
import { createAssignPage, createUndo } from './assign-page';

type Tab = Browser.tabs.Tab;

const URL = 'https://docs.example.com/guide';
const tab = (id: number, fields: Partial<Tab> = {}): Tab => ({ id, url: URL, title: 'The Guide', ...fields }) as Tab;

/** The tabs Chrome knows, by id; `tabs.get` rejects any other id as Chrome does. */
function openTabs(...tabs: Tab[]) {
  (vi.spyOn(browser.tabs, 'get') as unknown as MockInstance<(id: number) => Promise<Tab>>).mockImplementation(
    async (id) => {
      const found = tabs.find((t) => t.id === id);
      if (found === undefined) throw new Error(`No tab with id: ${id}.`);
      return found;
    },
  );
}

const DEFAULTS = { openMode: 'smart', tabMatch: 'site', closeCurrent: false } as const;
const stored = async (key: string) => (await browser.storage.sync.get(`key.${key}`))[`key.${key}`];
/** The stored undo record; undefined at runtime when there is none. */
const undoRecord = async () => (await browser.storage.session.get('undo')).undo as UndoRecord;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('assignPage', () => {
  it("puts the tab's page on a free key, records the undo, and replies saved with the record's id", async () => {
    openTabs(tab(3));

    const reply = await createAssignPage()({ key: 'K', tabId: 3 }, undefined);

    const saved = { link: URL, name: 'The Guide', ...DEFAULTS };
    expect(await stored('K')).toEqual(saved);
    const record = await undoRecord();
    expect(reply).toEqual({ kind: 'saved', undoId: record.id });
    expect(record).toEqual({
      id: expect.any(String),
      expiresAt: expect.any(Number),
      keys: { K: null },
      written: { K: saved },
    });
  });

  it("uses a content script's own tab, whatever tabId it names", async () => {
    openTabs(tab(3), tab(4, { url: 'https://other.example/', title: 'Other' }));

    await createAssignPage()({ key: 'K', tabId: 4 }, tab(3));

    expect(await stored('K')).toMatchObject({ link: URL });
  });

  it('applies the open mode', async () => {
    openTabs(tab(3));

    await createAssignPage()({ key: 'K', tabId: 3, openMode: 'bg' }, undefined);

    expect(await stored('K')).toMatchObject({ openMode: 'bg' });
  });

  it('replies conflict on an occupied key, and writes nothing', async () => {
    openTabs(tab(3));
    const github = { link: 'https://github.com/', name: 'GitHub', ...DEFAULTS };
    await browser.storage.sync.set({ 'key.G': github });

    expect(await createAssignPage()({ key: 'G', tabId: 3 }, undefined)).toEqual({
      kind: 'conflict',
      existing: github,
      moveTarget: 'I',
    });
    expect(await stored('G')).toEqual(github);
    expect(await undoRecord()).toBeUndefined();
  });

  it('moves the old shortcut aside on resolve: move, and records both keys', async () => {
    openTabs(tab(3));
    const github = { link: 'https://github.com/', name: 'GitHub', ...DEFAULTS };
    await browser.storage.sync.set({ 'key.G': github });

    expect((await createAssignPage()({ key: 'G', tabId: 3, resolve: 'move' }, undefined)).kind).toBe('saved');

    expect(await stored('I')).toEqual(github);
    expect((await undoRecord()).keys).toEqual({ G: github, I: null });
  });

  it('treats a key holding an unreadable item as free, and overwrites it', async () => {
    openTabs(tab(3));
    await browser.storage.sync.set({ 'key.K': { fromTheFuture: true } });

    expect((await createAssignPage()({ key: 'K', tabId: 3 }, undefined)).kind).toBe('saved');

    expect(await stored('K')).toMatchObject({ link: URL });
    expect((await undoRecord()).keys).toEqual({ K: null });
  });

  it("replies unusable for a page that can't go on a key, and writes nothing", async () => {
    openTabs(tab(3, { url: 'chrome://settings/' }));

    expect(await createAssignPage()({ key: 'K', tabId: 3 }, undefined)).toEqual({ kind: 'unusable' });
    expect(await stored('K')).toBeUndefined();
  });

  it('replies failed when the tab is gone, and writes nothing', async () => {
    openTabs();

    expect(await createAssignPage()({ key: 'K', tabId: 3 }, undefined)).toEqual({ kind: 'failed' });
    expect(await stored('K')).toBeUndefined();
    expect(await undoRecord()).toBeUndefined();
  });

  it('replies failed with no tab at all', async () => {
    expect(await createAssignPage()({ key: 'K' }, undefined)).toEqual({ kind: 'failed' });
  });

  it('replies failed when sync storage refuses the write, and leaves no undo record', async () => {
    openTabs(tab(3));
    vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

    expect(await createAssignPage()({ key: 'K', tabId: 3 }, undefined)).toEqual({ kind: 'failed' });
    expect(await undoRecord()).toBeUndefined();
  });

  it('a second assign replaces the undo record', async () => {
    openTabs(tab(3), tab(4, { url: 'https://other.example/', title: 'Other' }));
    const assignPage = createAssignPage();
    const first = await assignPage({ key: 'K', tabId: 3 }, undefined);
    const second = await assignPage({ key: 'J', tabId: 4 }, undefined);

    const record = await undoRecord();
    expect(first.kind === 'saved' && second.kind === 'saved' && first.undoId !== second.undoId).toBe(true);
    expect(record).toMatchObject({ id: second.kind === 'saved' && second.undoId, keys: { J: null } });
  });

  it('keeps the record for 60 s', async () => {
    openTabs(tab(3));
    vi.spyOn(Date, 'now').mockReturnValue(5_000);

    await createAssignPage()({ key: 'K', tabId: 3 }, undefined);

    expect((await undoRecord()).expiresAt).toBe(65_000);
  });
});

describe('assignPage: the saved toast', () => {
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

  it('is sent to the tab, with the name and the undo handle', async () => {
    openTabs(tab(3));

    const reply = await createAssignPage()({ key: 'K', tabId: 3 }, undefined);

    const undoId = reply.kind === 'saved' ? reply.undoId : '';
    await vi.waitFor(() =>
      expect(sent).toEqual([
        '3/0 ping null',
        `3/0 toast ${JSON.stringify({ kind: 'saved', key: 'K', name: 'The Guide', undoId })}`,
      ]),
    );
  });

  it("names a page without a title by its link's site", async () => {
    openTabs(tab(3, { title: '' }));

    await createAssignPage()({ key: 'K', tabId: 3 }, undefined);

    await vi.waitFor(() => expect(sent[1]).toContain('"name":"docs.example.com"'));
  });

  it('is not sent when nothing was saved', async () => {
    openTabs(tab(3, { url: 'chrome://settings/' }));

    await createAssignPage()({ key: 'K', tabId: 3 }, undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent).toEqual([]);
  });
});

describe('undo', () => {
  /** Assigns tab 3's page to K and returns the undo handle. */
  async function assignK(fields: Partial<{ key: 'K' | 'G'; resolve: 'replace' | 'move' }> = {}): Promise<string> {
    openTabs(tab(3));
    const reply = await createAssignPage()({ key: 'K', tabId: 3, ...fields }, undefined);
    if (reply.kind !== 'saved') throw new Error(`not saved: ${reply.kind}`);
    return reply.undoId;
  }

  it('frees the key again and removes the record', async () => {
    const id = await assignK();

    expect(await createUndo()({ id })).toEqual({ kind: 'undone' });

    expect(await stored('K')).toBeUndefined();
    expect(await undoRecord()).toBeUndefined();
  });

  it('after a Move, puts the old shortcut back and frees the key it was moved to', async () => {
    const github = { link: 'https://github.com/', name: 'GitHub', ...DEFAULTS };
    await browser.storage.sync.set({ 'key.G': github });
    const id = await assignK({ key: 'G', resolve: 'move' });

    expect(await createUndo()({ id })).toEqual({ kind: 'undone' });

    expect(await stored('G')).toEqual(github);
    expect(await stored('I')).toBeUndefined();
  });

  it('is stale after a touched key was written since, and writes nothing', async () => {
    const id = await assignK();
    const edited = { link: URL, name: 'Edited in Options', ...DEFAULTS };
    await browser.storage.sync.set({ 'key.K': edited });

    expect(await createUndo()({ id })).toEqual({ kind: 'stale' });

    expect(await stored('K')).toEqual(edited);
    expect(await undoRecord()).toMatchObject({ id });
  });

  it("is stale for an older assign's handle once a newer one replaced the record", async () => {
    const older = await assignK();
    openTabs(tab(4, { url: 'https://other.example/', title: 'Other' }));
    await createAssignPage()({ key: 'J', tabId: 4 }, undefined);

    expect(await createUndo()({ id: older })).toEqual({ kind: 'stale' });

    expect(await stored('K')).toMatchObject({ link: URL });
    expect(await stored('J')).toMatchObject({ link: 'https://other.example/' });
  });

  it('is stale once the 60 s backstop has passed', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000);
    const id = await assignK();
    now.mockReturnValue(65_000);

    expect(await createUndo()({ id })).toEqual({ kind: 'stale' });
    expect(await stored('K')).toMatchObject({ link: URL });
  });

  it('is stale with no record', async () => {
    expect(await createUndo()({ id: 'nothing' })).toEqual({ kind: 'stale' });
  });

  it('replies failed when the write fails, keeping the record', async () => {
    const id = await assignK();
    vi.spyOn(browser.storage.sync, 'remove').mockRejectedValue(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE'));

    expect(await createUndo()({ id })).toEqual({ kind: 'failed' });
    expect(await undoRecord()).toMatchObject({ id });
  });
});
