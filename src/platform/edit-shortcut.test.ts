import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { UndoRecord } from '@/domain/assign-plan';
import { createUndo } from './assign-page';
import { createEditShortcut } from './edit-shortcut';

type Tab = Browser.tabs.Tab;

const tab = (id: number, fields: Partial<Tab> = {}): Tab =>
  ({ id, url: 'https://mail.google.com/mail/u/0/#inbox', title: 'Inbox', ...fields }) as Tab;

function openTabs(...tabs: Tab[]) {
  (vi.spyOn(browser.tabs, 'get') as unknown as MockInstance<(id: number) => Promise<Tab>>).mockImplementation(
    async (id) => {
      const found = tabs.find((t) => t.id === id);
      if (found === undefined) throw new Error(`No tab with id: ${id}.`);
      return found;
    },
  );
}

const DEFAULTS = { openMode: 'smart', tabMatch: 'page', closeCurrent: false } as const;
const mail = { link: 'https://mail.google.com/', name: 'Mail', ...DEFAULTS };
const github = { link: 'https://github.com/', name: 'GitHub', ...DEFAULTS };
const stored = async (key: string) => (await browser.storage.sync.get(`key.${key}`))[`key.${key}`];
const undoRecord = async () => (await browser.storage.session.get('undo')).undo as UndoRecord | undefined;

/** Messages sent to tabs, as `<tabId>/<frameId> <type> <data>`; the tab's script answers every one. */
let sent: string[];

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
  await browser.storage.sync.set({ 'key.M': mail });
  openTabs(tab(3));
});

const edit = createEditShortcut();

describe('editShortcut: openMode', () => {
  it('writes the new open mode, keeping the rest, with no undo record and no toast', async () => {
    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'openMode', openMode: 'new' } }, undefined)).toEqual({
      kind: 'saved',
    });

    expect(await stored('M')).toEqual({ ...mail, openMode: 'new' });
    expect(await undoRecord()).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual([]);
  });

  it('is missing on a free key, and writes nothing', async () => {
    expect(await edit({ key: 'K', tabId: 3, op: { kind: 'openMode', openMode: 'new' } }, undefined)).toEqual({
      kind: 'missing',
    });
    expect(await stored('K')).toBeUndefined();
  });

  it('is failed when the write fails', async () => {
    vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'openMode', openMode: 'new' } }, undefined)).toEqual({
      kind: 'failed',
    });
  });
});

describe('editShortcut: exactPage', () => {
  it("sets the link to the tab's URL from the tabs API and the tab match to exact, with no undo record", async () => {
    const reply = await edit({ key: 'M', tabId: 3, op: { kind: 'exactPage' } }, undefined);

    expect(reply).toEqual({ kind: 'saved' });
    expect(await stored('M')).toEqual({ ...mail, link: 'https://mail.google.com/mail/u/0/#inbox', tabMatch: 'exact' });
    expect(await undoRecord()).toBeUndefined();
  });

  it("is unusable for a tab that isn't a link", async () => {
    openTabs(tab(3, { url: 'chrome://settings/' }));

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'exactPage' } }, undefined)).toEqual({ kind: 'unusable' });
    expect(await stored('M')).toEqual(mail);
  });

  it('is failed when the tab is gone', async () => {
    openTabs();

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'exactPage' } }, undefined)).toEqual({ kind: 'failed' });
  });

  it('is failed with no tab at all', async () => {
    expect(await edit({ key: 'M', tabId: undefined as never, op: { kind: 'exactPage' } }, undefined)).toEqual({
      kind: 'failed',
    });
  });
});

describe('editShortcut: remove', () => {
  it("frees the key and replies saved with the undo record's handle", async () => {
    const reply = await edit({ key: 'M', tabId: 3, op: { kind: 'remove' } }, undefined);

    const record = await undoRecord();
    expect(await stored('M')).toBeUndefined();
    expect(record).toEqual({
      id: expect.any(String),
      expiresAt: expect.any(Number),
      keys: { M: mail },
      written: { M: null },
    });
    expect(reply).toEqual({ kind: 'saved', undo: { id: record?.id, expiresAt: record?.expiresAt } });
  });

  it('sends no page toast: the popup shows the result', async () => {
    await edit({ key: 'M', tabId: 3, op: { kind: 'remove' } }, undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent).toEqual([]);
  });

  it('is missing when the key was cleared meanwhile, and recreates nothing', async () => {
    await browser.storage.sync.remove('key.M');

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'remove' } }, undefined)).toEqual({ kind: 'missing' });
    expect(await undoRecord()).toBeUndefined();
  });

  it('is put back by undo', async () => {
    const reply = await edit({ key: 'M', tabId: 3, op: { kind: 'remove' } }, undefined);
    const id = reply.kind === 'saved' ? (reply.undo?.id ?? '') : '';

    expect(await createUndo()({ id })).toEqual({ kind: 'undone' });

    expect(await stored('M')).toEqual(mail);
  });

  it('still replies saved, without an undo, when only the record could not be written', async () => {
    vi.spyOn(browser.storage.session, 'set').mockRejectedValue(new Error('session storage unavailable'));

    const reply = await edit({ key: 'M', tabId: 3, op: { kind: 'remove' } }, undefined);

    expect(reply).toEqual({ kind: 'saved', undo: { id: expect.any(String), expiresAt: expect.any(Number) } });
    expect(await stored('M')).toBeUndefined();
  });

  it('is failed when the write fails, with no undo record', async () => {
    vi.spyOn(browser.storage.sync, 'remove').mockRejectedValue(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE'));

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'remove' } }, undefined)).toEqual({ kind: 'failed' });
    expect(await undoRecord()).toBeUndefined();
  });
});

describe('editShortcut: move', () => {
  it('moves the shortcut to a free key, records the undo and toasts the tab', async () => {
    const reply = await edit({ key: 'M', tabId: 3, op: { kind: 'move', to: 'K' } }, undefined);

    const record = await undoRecord();
    expect(await stored('M')).toBeUndefined();
    expect(await stored('K')).toEqual(mail);
    expect(record).toMatchObject({ keys: { M: mail, K: null }, written: { M: null, K: mail } });
    expect(reply).toEqual({ kind: 'saved', undo: { id: record?.id, expiresAt: record?.expiresAt } });
    await vi.waitFor(() =>
      expect(sent).toEqual([
        '3/0 ping null',
        `3/0 toast ${JSON.stringify({ kind: 'saved', key: 'K', name: 'Mail', link: mail.link, undoId: record?.id })}`,
      ]),
    );
  });

  it('names the toast after the site when the shortcut has no name', async () => {
    const { name: _name, ...unnamed } = mail;
    await browser.storage.sync.set({ 'key.M': unnamed });

    await edit({ key: 'M', tabId: 3, op: { kind: 'move', to: 'K' } }, undefined);

    await vi.waitFor(() => expect(sent[1]).toContain('"name":"mail.google.com"'));
  });

  it('is a conflict on a taken key, writing nothing', async () => {
    await browser.storage.sync.set({ 'key.G': github });

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'move', to: 'G' } }, undefined)).toEqual({
      kind: 'conflict',
      existing: github,
    });
    expect(await stored('M')).toEqual(mail);
    expect(await stored('G')).toEqual(github);
    expect(await undoRecord()).toBeUndefined();
  });

  it('replaces a taken key on resolve: replace, and undo puts both back', async () => {
    await browser.storage.sync.set({ 'key.G': github });

    const reply = await edit({ key: 'M', tabId: 3, op: { kind: 'move', to: 'G', resolve: 'replace' } }, undefined);

    expect(await stored('M')).toBeUndefined();
    expect(await stored('G')).toEqual(mail);
    expect(await stored('I')).toBeUndefined();
    const id = reply.kind === 'saved' ? (reply.undo?.id ?? '') : '';
    expect(await createUndo()({ id })).toEqual({ kind: 'undone' });
    expect(await stored('M')).toEqual(mail);
    expect(await stored('G')).toEqual(github);
  });

  it('is missing when the source is free, writing nothing', async () => {
    await browser.storage.sync.remove('key.M');

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'move', to: 'K' } }, undefined)).toEqual({ kind: 'missing' });
    expect(await stored('K')).toBeUndefined();
  });

  it('is failed onto itself, writing nothing', async () => {
    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'move', to: 'M' } }, undefined)).toEqual({ kind: 'failed' });
    expect(await stored('M')).toEqual(mail);
  });

  it('is failed when the write fails, with no toast and no record', async () => {
    vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

    expect(await edit({ key: 'M', tabId: 3, op: { kind: 'move', to: 'K' } }, undefined)).toEqual({ kind: 'failed' });
    expect(await undoRecord()).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual([]);
  });

  it("toasts a content script's own tab, whatever tabId the request names", async () => {
    openTabs(tab(3), tab(4));

    await edit({ key: 'M', tabId: 4, op: { kind: 'move', to: 'K' } }, tab(3));

    await vi.waitFor(() => expect(sent[0]).toBe('3/0 ping null'));
  });
});
