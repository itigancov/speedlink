// Schema migrations keyed on `meta.schemaVersion` (product spec §3.2, ADR 0002). Only migrations rewrite data.
import { planSiteToPage } from '@/domain/migrations';
import { rewriteKeyItems } from './keymap-store';
import { readMeta, updateMeta } from './meta';

/** One step: rewrites stored data from schema version `to - 1` to `to`. */
export interface Migration {
  readonly to: number;
  readonly run: () => Promise<void>;
}

/** Schema version 1 is the 4.0 baseline. Adding version n is adding `{ to: n, run }` here, in order. */
export const MIGRATIONS: readonly Migration[] = [
  // 4.1.1: the default tab match became page; keys stored on site, mostly by default, move to it.
  { to: 2, run: () => rewriteKeyItems(planSiteToPage) },
];

const BASELINE_VERSION = 1;

/**
 * Brings stored data up to this build's schema version, the last step's `to`. A missing `meta` counts as the
 * baseline. An equal version does nothing; a higher one (a newer device synced it) is left alone, never lowered,
 * and so is one this build cannot read.
 */
export async function runMigrations(steps: readonly Migration[] = MIGRATIONS): Promise<void> {
  const current = steps.at(-1)?.to ?? BASELINE_VERSION;
  const { schemaVersion } = await readMeta();
  if (schemaVersion !== undefined && (typeof schemaVersion !== 'number' || schemaVersion >= current)) return;

  const stored = schemaVersion ?? BASELINE_VERSION;
  for (const step of steps) {
    if (step.to > stored) await step.run();
  }
  await updateMeta({ schemaVersion: current });
}
