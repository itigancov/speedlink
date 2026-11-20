// A keymap change with its undo record (product spec §3.3): the one executor behind assign, Remove and Move.
import type { ChangeUndo } from '@/domain/assign-plan';
import { undoRecord } from '@/domain/assign-plan';
import type { KeymapChange } from '@/domain/keymap-ops';
import { writeChange } from './keymap-store';
import { writeUndo } from './undo-store';

export type WriteWithUndo = { ok: true; id: string; expiresAt: number } | { ok: false };

/**
 * Writes the change, then records its undo, so the record never points at a change that didn't happen. If only the
 * record fails the change is still saved (the failure is logged) and its Undo comes back stale.
 */
export async function writeWithUndo(change: KeymapChange, undo: ChangeUndo): Promise<WriteWithUndo> {
  const written = await writeChange(change);
  if (!written.ok) return { ok: false };
  const record = undoRecord(undo, crypto.randomUUID(), Date.now());
  await writeUndo(record).catch((error: unknown) => console.error('SpeedLink: no undo record', error));
  return { ok: true, id: record.id, expiresAt: record.expiresAt };
}
