// Editing a shortcut from the popup's key card (product spec §7, §11.3): read fresh, plan, write. Remove and Move
// record the undo; a successful Move toasts the tab like an assign does.
import type { Browser } from 'wxt/browser';
import { planExactPage, planMove, planRemove, planSetOpenMode } from '@/domain/edit-plan';
import type { Keymap } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
import { displayName } from '@/domain/shortcut';
import { sendToast } from './injection';
import { readKeymap, writeChange } from './keymap-store';
import type { EditOp, EditShortcutReply } from './messaging';
import { writeWithUndo } from './write-with-undo';

export interface EditShortcutRequest {
  key: Key;
  /** The popup's tab; ignored when a content script asks, since its own tab is the sender's. */
  tabId: number;
  op: EditOp;
}

export type EditShortcut = (
  request: EditShortcutRequest,
  senderTab: Browser.tabs.Tab | undefined,
) => Promise<EditShortcutReply>;

/**
 * The function behind the `editShortcut` message. Nothing but `key`, `tabId` and `op` is taken from the popup: the
 * keymap and the tab's URL are read fresh on every call, so a key cleared meanwhile is `missing`, never recreated.
 */
export function createEditShortcut(): EditShortcut {
  return async ({ key, tabId: named, op }, senderTab) => {
    const tabId = senderTab?.id ?? named;
    if (tabId === undefined) return { kind: 'failed' };
    try {
      const [tab, keymap] = await Promise.all([browser.tabs.get(tabId), readKeymap()]);
      return await run(keymap, key, tabId, tab.url ?? '', op);
    } catch (error) {
      console.error('SpeedLink: could not edit', key, error);
      return { kind: 'failed' };
    }
  };
}

async function run(keymap: Keymap, key: Key, tabId: number, tabUrl: string, op: EditOp): Promise<EditShortcutReply> {
  switch (op.kind) {
    case 'openMode':
      return writePlain(planSetOpenMode(keymap, key, op.openMode));
    case 'exactPage':
      return writePlain(planExactPage(keymap, key, tabUrl));
    case 'remove': {
      const plan = planRemove(keymap, key);
      if (plan.kind !== 'written') return plan;
      return savedWithUndo(await writeWithUndo(plan.change, plan.undo));
    }
    case 'move': {
      const plan = planMove(keymap, key, op.to, op.resolve);
      if (plan.kind === 'refused') return { kind: 'failed' };
      if (plan.kind !== 'written') return plan;
      const reply = savedWithUndo(await writeWithUndo(plan.change, plan.undo));
      if (reply.kind === 'saved' && reply.undo !== undefined) {
        sendToast(tabId, { kind: 'saved', key: op.to, name: displayName(plan.shortcut), undoId: reply.undo.id });
      }
      return reply;
    }
  }
}

async function writePlain(
  plan: ReturnType<typeof planSetOpenMode> | ReturnType<typeof planExactPage>,
): Promise<EditShortcutReply> {
  if (plan.kind !== 'written') return plan;
  const written = await writeChange(plan.change);
  return written.ok ? { kind: 'saved' } : { kind: 'failed' };
}

function savedWithUndo(written: Awaited<ReturnType<typeof writeWithUndo>>): EditShortcutReply {
  return written.ok ? { kind: 'saved', undo: { id: written.id, expiresAt: written.expiresAt } } : { kind: 'failed' };
}
