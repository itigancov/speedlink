import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { registerStoragePreparation } from './storage-preparation';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const sync = () => browser.storage.sync.get(null);

const speedlink = {
  shortcuts: [
    { canEdit: false, id: '1', shortcut: '1', title: 'Google', url: 'https://google.com' },
    { canEdit: false, id: '2', shortcut: 'S', title: '', url: 'https://github.com' },
  ],
  settings: { theme: 'system', useShift: true, postAction: 'Open in background', smartTabs: false },
};

const stored = (link: string, name?: string) => ({
  link,
  ...(name === undefined ? {} : { name }),
  openMode: 'bg',
  tabMatch: 'site',
  closeCurrent: false,
});

const installed = () => fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', previousVersion: '1.6' });

describe('registerStoragePreparation', () => {
  it('on install or update, stamps the schema version and imports v1 in one write with the marker', async () => {
    await browser.storage.sync.set({ speedlink });
    const set = vi.spyOn(browser.storage.sync, 'set');
    registerStoragePreparation();

    await installed();

    expect(await sync()).toEqual({
      speedlink,
      meta: { schemaVersion: 1, v1Imported: true },
      'key.1': stored('https://google.com/', 'Google'),
      'key.G': stored('https://github.com/'),
    });
    // The migration stamps meta first; the import is a single set holding the shortcuts and the marker.
    expect(set.mock.calls.map(([items]) => Object.keys(items).sort())).toEqual([['meta'], ['key.1', 'key.G', 'meta']]);
  });

  it('imports on browser startup too', async () => {
    await browser.storage.sync.set({ speedlink });
    registerStoragePreparation();

    await fakeBrowser.runtime.onStartup.trigger();

    expect((await sync())['key.1']).toEqual(stored('https://google.com/', 'Google'));
  });

  it('logs a report of what was imported and where S went', async () => {
    await browser.storage.sync.set({ speedlink });
    registerStoragePreparation();

    await installed();

    expect(console.info).toHaveBeenCalledWith('SpeedLink: v1 import', {
      imported: ['1', 'G'],
      skipped: [],
      moved: { from: 'S', to: 'G' },
    });
  });

  it('imports when v1 data arrives through sync after start', async () => {
    registerStoragePreparation();
    await installed();
    expect((await sync()).meta).toEqual({ schemaVersion: 1 });

    await browser.storage.sync.set({ speedlink });

    expect(await sync()).toMatchObject({
      meta: { schemaVersion: 1, v1Imported: true },
      'key.1': stored('https://google.com/', 'Google'),
    });
  });

  it('ignores sync changes that do not touch speedlink', async () => {
    registerStoragePreparation();
    const set = vi.spyOn(browser.storage.sync, 'set');

    await browser.storage.sync.set({ 'key.A': stored('https://a.example/') });

    expect(set).toHaveBeenCalledTimes(1);
    expect((await sync()).meta).toBeUndefined();
  });

  it('never overwrites a key holding a 4.0 item, readable or not, and keeps meta fields', async () => {
    await browser.storage.sync.set({
      speedlink,
      meta: { schemaVersion: 1, future: 'field' },
      'key.1': { name: 'unreadable: no link' },
    });
    registerStoragePreparation();

    await installed();

    expect(await sync()).toEqual({
      speedlink,
      meta: { schemaVersion: 1, future: 'field', v1Imported: true },
      'key.1': { name: 'unreadable: no link' },
      'key.G': stored('https://github.com/'),
    });
  });

  it('does nothing more once v1 is marked imported', async () => {
    await browser.storage.sync.set({ speedlink, meta: { schemaVersion: 1, v1Imported: true } });
    registerStoragePreparation();
    const set = vi.spyOn(browser.storage.sync, 'set');

    await installed();
    await browser.storage.sync.set({ speedlink: { ...speedlink, shortcuts: [] } });

    expect(set).toHaveBeenCalledTimes(1);
    expect(Object.keys(await sync()).sort()).toEqual(['meta', 'speedlink']);
  });

  it('marks nothing on a fresh install with no v1 data', async () => {
    registerStoragePreparation();

    await installed();

    expect(await sync()).toEqual({ meta: { schemaVersion: 1 } });
    expect(console.info).not.toHaveBeenCalled();
  });

  it('marks malformed v1 data as imported, so it is not retried', async () => {
    await browser.storage.sync.set({ speedlink: { shortcuts: 'broken' } });
    registerStoragePreparation();

    await installed();

    expect(await sync()).toEqual({ speedlink: { shortcuts: 'broken' }, meta: { schemaVersion: 1, v1Imported: true } });
  });

  it('marks nothing when the write fails, and imports on the next trigger', async () => {
    await browser.storage.sync.set({ speedlink, meta: { schemaVersion: 1 } });
    registerStoragePreparation();
    const set = vi
      .spyOn(browser.storage.sync, 'set')
      .mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'));

    await installed();

    expect(await sync()).toEqual({ speedlink, meta: { schemaVersion: 1 } });
    expect(console.error).toHaveBeenCalledWith('SpeedLink: v1 import failed', 'quota-exceeded');

    set.mockRestore();
    await fakeBrowser.runtime.onStartup.trigger();

    expect(await sync()).toMatchObject({
      meta: { schemaVersion: 1, v1Imported: true },
      'key.G': stored('https://github.com/'),
    });
  });

  it('imports once when two triggers fire together', async () => {
    await browser.storage.sync.set({ speedlink });
    registerStoragePreparation();
    const set = vi.spyOn(browser.storage.sync, 'set');

    await Promise.all([installed(), fakeBrowser.runtime.onStartup.trigger(), browser.storage.sync.set({ speedlink })]);

    const imports = set.mock.calls.filter(([items]) => 'key.1' in items);
    expect(imports).toHaveLength(1);
    expect(console.info).toHaveBeenCalledTimes(1);
  });
});
