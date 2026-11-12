// Everything the background does to prepare storage: schema migrations, then the one-time v1 import (§3, §10).
import { planV1Import } from '@/domain/migrations';
import { readTakenKeys, writeImport } from './keymap-store';
import { readMeta } from './meta';
import { runMigrations } from './migrations';

/** v1's whole state (CWS 1.1–1.6). Read only: never written or removed, so a rollback to 1.6 keeps working. */
const V1_ITEM = 'speedlink';

/** One import run. A failure marks nothing, so the next trigger retries. */
async function importV1(): Promise<void> {
  if ((await readMeta()).v1Imported === true) return;
  const [items, taken] = await Promise.all([browser.storage.sync.get(V1_ITEM), readTakenKeys()]);
  const result = planV1Import(items[V1_ITEM], taken);
  if (result.kind === 'none') return;

  const written = await writeImport(result.shortcuts);
  if (!written.ok) {
    console.error('SpeedLink: v1 import failed', written.error);
    return;
  }
  console.info('SpeedLink: v1 import', result.report);
}

/**
 * Registers the storage preparation on the background's events. Install, update and startup run the schema
 * migrations, then the v1 import; a sync change to `speedlink` (late sync on a new device) runs the import.
 * Runs are serialized, and each reads `meta` afresh, so triggers close together import once.
 */
export function registerStoragePreparation(): void {
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (run: () => Promise<void>, failure: string) => {
    queue = queue.then(run).catch((error: unknown) => console.error(failure, error));
    return queue;
  };

  const prepare = () =>
    enqueue(async () => {
      await runMigrations();
      await importV1();
    }, 'SpeedLink: storage preparation failed');

  browser.runtime.onInstalled.addListener(() => prepare());
  browser.runtime.onStartup.addListener(() => prepare());
  browser.storage.sync.onChanged.addListener((changes) => {
    if (V1_ITEM in changes) return enqueue(importV1, 'SpeedLink: v1 import failed');
  });
}
