import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type Migration, runMigrations } from './migrations';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

const meta = async () => (await browser.storage.sync.get('meta')).meta;

describe('runMigrations', () => {
  it('stamps a fresh install with schema version 2', async () => {
    await runMigrations();

    expect(await meta()).toEqual({ schemaVersion: 2 });
  });

  it('does nothing when the stored version equals this build', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 2, v1Imported: true }, 'key.G': site() });
    const set = vi.spyOn(browser.storage.sync, 'set');

    await runMigrations();

    expect(set).not.toHaveBeenCalled();
    expect(await meta()).toEqual({ schemaVersion: 2, v1Imported: true });
  });

  it('runs each step above the stored version in order, once, and records the new version', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 1 } });
    const ran: number[] = [];
    const steps: Migration[] = [2, 3].map((to) => ({ to, run: async () => void ran.push(to) }));

    await runMigrations(steps);
    await runMigrations(steps);

    expect(ran).toEqual([2, 3]);
    expect(await meta()).toEqual({ schemaVersion: 3 });
  });

  it('runs only the steps above a partly migrated version', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 2 } });
    const ran: number[] = [];
    const steps: Migration[] = [2, 3].map((to) => ({ to, run: async () => void ran.push(to) }));

    await runMigrations(steps);

    expect(ran).toEqual([3]);
    expect(await meta()).toEqual({ schemaVersion: 3 });
  });

  it('leaves a higher version from a newer device alone', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 7, future: 'field' } });
    const step2 = vi.fn(async () => {});
    const set = vi.spyOn(browser.storage.sync, 'set');

    await runMigrations([{ to: 2, run: step2 }]);

    expect(step2).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(await meta()).toEqual({ schemaVersion: 7, future: 'field' });
  });

  it('keeps v1Imported and unknown fields when it records the new version', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 1, v1Imported: true, future: 'field' } });

    await runMigrations([{ to: 2, run: async () => {} }]);

    expect(await meta()).toEqual({ schemaVersion: 2, v1Imported: true, future: 'field' });
  });

  it('stamps a meta that has flags but no version, keeping the flags', async () => {
    await browser.storage.sync.set({ meta: { v1Imported: true } });

    await runMigrations();

    expect(await meta()).toEqual({ schemaVersion: 2, v1Imported: true });
  });

  it('leaves a version it cannot read alone, as it would a newer one', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: '2.0', v1Imported: true } });
    const step2 = vi.fn(async () => {});

    await runMigrations([{ to: 2, run: step2 }]);

    expect(step2).not.toHaveBeenCalled();
    expect(await meta()).toEqual({ schemaVersion: '2.0', v1Imported: true });
  });
});

/** A stored 4.0/4.1 item on the old default tab match. */
const site = (fields: object = {}) => ({
  link: 'https://docs.example.com/a',
  name: 'Docs',
  openMode: 'smart',
  tabMatch: 'site',
  closeCurrent: true,
  ...fields,
});

const sync = () => browser.storage.sync.get(null);

describe('schema migration 2: site tab match to page', () => {
  it('moves a site item to page and keeps its other fields, in one write before the version', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 1 }, 'key.G': site(), 'key.1': site({ openMode: 'bg' }) });
    const set = vi.spyOn(browser.storage.sync, 'set');

    await runMigrations();

    expect(await sync()).toMatchObject({
      'key.G': {
        link: 'https://docs.example.com/a',
        name: 'Docs',
        openMode: 'smart',
        tabMatch: 'page',
        closeCurrent: true,
      },
      'key.1': {
        link: 'https://docs.example.com/a',
        name: 'Docs',
        openMode: 'bg',
        tabMatch: 'page',
        closeCurrent: true,
      },
    });
    expect(set.mock.calls.map(([items]) => Object.keys(items).sort())).toEqual([['key.1', 'key.G'], ['meta']]);
  });

  it.each(['new', 'this', 'bg'])('moves a %s item on site to page too', async (openMode) => {
    await browser.storage.sync.set({ 'key.G': site({ openMode }) });

    await runMigrations();

    expect(await sync()).toMatchObject({ 'key.G': site({ openMode, tabMatch: 'page' }) });
  });

  it('leaves exact and page items exactly as stored', async () => {
    // Not normalized: the migration never rewrites an item it does not move.
    const exact = { link: 'docs.example.com', name: '  Docs ', openMode: 'new', tabMatch: 'exact' };
    const page = { link: 'https://docs.example.com/b', openMode: 'smart', tabMatch: 'page', closeCurrent: false };
    await browser.storage.sync.set({ meta: { schemaVersion: 1 }, 'key.E': exact, 'key.P': page });
    const set = vi.spyOn(browser.storage.sync, 'set');

    await runMigrations();

    expect(await sync()).toEqual({ meta: { schemaVersion: 2 }, 'key.E': exact, 'key.P': page });
    expect(set.mock.calls.map(([items]) => Object.keys(items))).toEqual([['meta']]);
  });

  it('keeps fields this build does not know, and does not normalize the ones it does', async () => {
    const raw = site({ link: 'docs.example.com', name: ' Docs ', icon: 'book', future: { a: [1] } });
    await browser.storage.sync.set({ 'key.G': raw });

    await runMigrations();

    expect((await sync())['key.G']).toEqual({ ...raw, tabMatch: 'page' });
  });

  it('leaves a non-object or unreadable key item as it is', async () => {
    const items = {
      'key.A': 'not an object',
      'key.B': ['https://b.example/'],
      'key.C': { name: 'no link', tabMatch: 'site' },
      'key.D': { link: 'chrome://settings', tabMatch: 'site' },
      'key.E': 7,
    };
    await browser.storage.sync.set(items);

    await runMigrations();

    expect(await sync()).toEqual({ ...items, meta: { schemaVersion: 2 } });
  });

  it('leaves items that are not keys alone, the reserved S among them', async () => {
    const others = {
      speedlink: { shortcuts: [], settings: { smartTabs: true }, tabMatch: 'site' },
      'key.S': site(),
      'key.Ж': site(),
      undo: site(),
    };
    await browser.storage.sync.set(others);

    await runMigrations();

    expect(await sync()).toEqual({ ...others, meta: { schemaVersion: 2 } });
  });

  it('runs once: a site set after the first run stays site', async () => {
    await browser.storage.sync.set({ 'key.G': site() });
    await runMigrations();
    await browser.storage.sync.set({ 'key.G': site() });

    await runMigrations();

    expect(await sync()).toEqual({ meta: { schemaVersion: 2 }, 'key.G': site() });
  });

  it('rewrites nothing on a newer schema version and never lowers it', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 3 }, 'key.G': site() });

    await runMigrations();

    expect(await sync()).toEqual({ meta: { schemaVersion: 3 }, 'key.G': site() });
  });

  it('treats a missing meta as the baseline and migrates', async () => {
    await browser.storage.sync.set({ 'key.G': site() });

    await runMigrations();

    expect(await sync()).toEqual({ meta: { schemaVersion: 2 }, 'key.G': site({ tabMatch: 'page' }) });
  });
});
