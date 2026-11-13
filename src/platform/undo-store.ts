// The only module that reads or writes `undo` in storage.session (product spec §3.3). Never synced, gone on restart.
import type { UndoRecord } from '@/domain/assign-plan';

const undoItem = storage.defineItem<UndoRecord>('session:undo');

/** The stored record, or undefined. Only the background writes it, so its shape is trusted. */
export async function readUndo(): Promise<UndoRecord | undefined> {
  return (await undoItem.getValue()) ?? undefined;
}

export async function writeUndo(record: UndoRecord): Promise<void> {
  await undoItem.setValue(record);
}

export async function removeUndo(): Promise<void> {
  await undoItem.removeValue();
}
