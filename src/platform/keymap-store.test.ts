import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Keymap } from '@/domain/keymap-ops';
import { validShortcut } from '@/domain/test-shortcut';
import { clearAll, readKeymap, watchKeymap, writeChange } from './keymap-store';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

const github = validShortcut({ link: 'https://github.com/' });
const youtube = validShortcut({ link: 'https://youtube.com/' });

/** Records the item names of every storage.sync change event, in order. */
function recordSyncChanges(): string[][] {
  const events: string[][] = [];
  browser.storage.sync.onChanged.addListener((changes) => events.push(Object.keys(changes).sort()));
  return events;
}

describe('readKeymap', () => {
  it('reads every key.<K> item into a keymap and leaves free keys out', async () => {
    await browser.storage.sync.set({
      'key.Y': { link: 'https://youtube.com/', openMode: 'new', tabMatch: 'page', closeCurrent: true },
      'key.1': { link: 'https://one.example/', name: 'One', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
    });

    expect(await readKeymap()).toEqual({
      Y: validShortcut({ link: 'https://youtube.com/', openMode: 'new', tabMatch: 'page', closeCurrent: true }),
      1: validShortcut({ link: 'https://one.example/', name: 'One' }),
    });
  });

  it('defaults missing open mode, tab match and close current', async () => {
    await browser.storage.sync.set({ 'key.G': { link: 'https://github.com/' } });

    expect(await readKeymap()).toEqual({
      G: validShortcut({ link: 'https://github.com/', openMode: 'smart', tabMatch: 'site', closeCurrent: false }),
    });
  });

  it('treats an unreadable item as a free key and leaves it in storage', async () => {
    await browser.storage.sync.set({
      'key.A': { name: 'no link' },
      'key.B': 'not an object',
      'key.C': { link: 'https://ok.example/' },
    });

    expect(await readKeymap()).toEqual({ C: validShortcut({ link: 'https://ok.example/' }) });
    expect(await browser.storage.sync.get(['key.A', 'key.B'])).toEqual({
      'key.A': { name: 'no link' },
      'key.B': 'not an object',
    });
  });

  it('ignores items that are not keys, and the reserved S', async () => {
    await browser.storage.sync.set({
      meta: { schemaVersion: 1 },
      speedlink: { anything: true },
      'key.S': { link: 'https://s.example/' },
    });

    expect(await readKeymap()).toEqual({});
  });
});

describe('writeChange', () => {
  it('stores a shortcut as its own key.<K> item', async () => {
    const shortcut = validShortcut({ link: 'https://github.com/', name: 'GitHub', openMode: 'bg' });

    expect(await writeChange({ G: shortcut })).toEqual({ ok: true, value: undefined });
    expect(await browser.storage.sync.get(null)).toEqual({
      'key.G': { link: 'https://github.com/', name: 'GitHub', openMode: 'bg', tabMatch: 'site', closeCurrent: false },
    });
  });

  it('writes back fields this version does not know', async () => {
    await browser.storage.sync.set({ 'key.G': { link: 'https://github.com/', icon: 'octocat', future: { a: 1 } } });
    const { G } = await readKeymap();

    await writeChange({ H: G ?? null });

    expect(await browser.storage.sync.get('key.H')).toEqual({
      'key.H': {
        link: 'https://github.com/',
        icon: 'octocat',
        future: { a: 1 },
        openMode: 'smart',
        tabMatch: 'site',
        closeCurrent: false,
      },
    });
  });

  it('writes a two-key swap as one write', async () => {
    await browser.storage.sync.set({ 'key.G': { ...github }, 'key.Y': { ...youtube } });
    const events = recordSyncChanges();

    await writeChange({ G: youtube, Y: github });

    expect(events).toEqual([['key.G', 'key.Y']]);
    expect(await readKeymap()).toEqual({ G: youtube, Y: github });
  });

  it('writes the new key of a Move before freeing the old one', async () => {
    await browser.storage.sync.set({ 'key.G': { ...github } });
    const events = recordSyncChanges();

    await writeChange({ G: null, H: github });

    expect(events).toEqual([['key.H'], ['key.G']]);
    expect(await browser.storage.sync.get(null)).toEqual({ 'key.H': { ...github } });
  });

  it('keeps the old key when a Move fails after the set', async () => {
    await browser.storage.sync.set({ 'key.G': { ...github } });
    vi.spyOn(browser.storage.sync, 'remove').mockRejectedValue(new Error('boom'));

    expect(await writeChange({ G: null, H: github })).toEqual({ ok: false, error: 'write-failed' });
    expect(await readKeymap()).toEqual({ G: github, H: github });
  });

  it('writes nothing for an empty change', async () => {
    const events = recordSyncChanges();
    const set = vi.spyOn(browser.storage.sync, 'set');
    const remove = vi.spyOn(browser.storage.sync, 'remove');

    expect(await writeChange({})).toEqual({ ok: true, value: undefined });
    expect(events).toEqual([]);
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ['QUOTA_BYTES quota exceeded', 'quota-exceeded'],
    ['QUOTA_BYTES_PER_ITEM quota exceeded', 'quota-exceeded'],
    ['MAX_ITEMS quota exceeded', 'quota-exceeded'],
    ['MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded', 'quota-exceeded'],
    ['MAX_WRITE_OPERATIONS_PER_HOUR quota exceeded', 'quota-exceeded'],
    ['IO error: something broke', 'write-failed'],
  ])('maps a rejected set "%s" to %s', async (message, error) => {
    vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(new Error(message));

    expect(await writeChange({ G: github })).toEqual({ ok: false, error });
  });
});

describe('clearAll', () => {
  it('removes every key.<K> item and nothing else', async () => {
    await browser.storage.sync.set({
      'key.G': { ...github },
      'key.1': { broken: true },
      meta: { schemaVersion: 1, v1Imported: true },
      speedlink: { v1: 'data' },
      shortcuts: ['legacy'],
    });

    expect(await clearAll()).toEqual({ ok: true, value: undefined });
    expect(await browser.storage.sync.get(null)).toEqual({
      meta: { schemaVersion: 1, v1Imported: true },
      speedlink: { v1: 'data' },
      shortcuts: ['legacy'],
    });
  });

  it('maps a rejected remove to an error', async () => {
    vi.spyOn(browser.storage.sync, 'remove').mockRejectedValue(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE'));

    expect(await clearAll()).toEqual({ ok: false, error: 'quota-exceeded' });
  });
});

describe('watchKeymap', () => {
  /** Collects every emitted keymap; `next(n)` waits until n have arrived. */
  function watch() {
    const emitted: Keymap[] = [];
    const unwatch = watchKeymap((keymap) => emitted.push(keymap));
    const next = (count: number) => vi.waitFor(() => expect(emitted).toHaveLength(count));
    return { emitted, unwatch, next };
  }

  it('emits the full keymap once for a two-key write', async () => {
    await browser.storage.sync.set({ 'key.1': { ...youtube } });
    const { emitted, next } = watch();

    await writeChange({ G: github, H: youtube });
    await next(1);
    await browser.storage.sync.set({ 'key.Z': { ...github } });
    await next(2);

    expect(emitted[0]).toEqual({ 1: youtube, G: github, H: youtube });
  });

  it('sees changes written straight to sync, as a remote device would', async () => {
    const { emitted, next } = watch();

    await browser.storage.sync.set({ 'key.Q': { link: 'https://remote.example/' } });
    await next(1);

    expect(emitted).toEqual([{ Q: validShortcut({ link: 'https://remote.example/' }) }]);
  });

  it('ignores changes that touch no key', async () => {
    const { emitted, next } = watch();

    await browser.storage.sync.set({ meta: { schemaVersion: 1 }, speedlink: {} });
    await browser.storage.local.set({ 'key.G': { ...github } });
    await browser.storage.sync.set({ 'key.Y': { ...youtube } });
    await next(1);

    expect(emitted).toEqual([{ Y: youtube }]);
  });

  it('stops emitting after unsubscribe', async () => {
    const { emitted, unwatch, next } = watch();
    await browser.storage.sync.set({ 'key.Y': { ...youtube } });
    await next(1);

    unwatch();
    await browser.storage.sync.set({ 'key.G': { ...github } });
    await readKeymap();

    expect(emitted).toEqual([{ Y: youtube }]);
  });
});
