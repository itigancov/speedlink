import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type Migration, runMigrations } from './migrations';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

const meta = async () => (await browser.storage.sync.get('meta')).meta;

describe('runMigrations', () => {
  it('stamps a fresh install with schema version 1', async () => {
    await runMigrations();

    expect(await meta()).toEqual({ schemaVersion: 1 });
  });

  it('does nothing when the stored version equals this build', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: 1, v1Imported: true } });
    const set = vi.spyOn(browser.storage.sync, 'set');

    await runMigrations();

    expect(set).not.toHaveBeenCalled();
    expect(await meta()).toEqual({ schemaVersion: 1, v1Imported: true });
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

    expect(await meta()).toEqual({ schemaVersion: 1, v1Imported: true });
  });

  it('leaves a version it cannot read alone, as it would a newer one', async () => {
    await browser.storage.sync.set({ meta: { schemaVersion: '2.0', v1Imported: true } });
    const step2 = vi.fn(async () => {});

    await runMigrations([{ to: 2, run: step2 }]);

    expect(step2).not.toHaveBeenCalled();
    expect(await meta()).toEqual({ schemaVersion: '2.0', v1Imported: true });
  });
});
