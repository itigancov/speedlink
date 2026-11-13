// Assign with undo (product spec §3.3, §11.3): the one path that puts a tab's page on a key from outside Options,
// for the free-key toast and the popup. Read fresh, plan, write, record the undo, toast the tab.
import type { Browser } from 'wxt/browser';
import { type AssignOptions, planAssign, planUndo, undoRecord } from '@/domain/assign-plan';
import type { Key } from '@/domain/keys';
import { displayName } from '@/domain/shortcut';
import { sendToast } from './injection';
import { readKeymap, writeChange } from './keymap-store';
import type { AssignPageReply, UndoReply } from './messaging';
import { readUndo, removeUndo, writeUndo } from './undo-store';

export interface AssignPageRequest extends AssignOptions {
  key: Key;
  /** The popup's tab; ignored when a content script asks, since its own tab is the sender's. */
  tabId?: number;
}

export type AssignPage = (
  request: AssignPageRequest,
  senderTab: Browser.tabs.Tab | undefined,
) => Promise<AssignPageReply>;

/**
 * The sender's tab when a content script sent the message, else undefined. An extension page has a tab too when it
 * is shown in one (the popup opened as `popup.html` in e2e), but it names the tab it means instead.
 */
export function contentScriptTab(sender: Browser.runtime.MessageSender): Browser.tabs.Tab | undefined {
  const extensionPage = sender.url?.startsWith(browser.runtime.getURL('/')) ?? false;
  return extensionPage ? undefined : sender.tab;
}

/**
 * The function behind the `assignPage` message. The tab's url and title come from the tabs API, never from the page,
 * and the keymap is read fresh on every call. The undo record is written only after the keymap write succeeded, so
 * it never points at a change that didn't happen; if only the record fails, the page is still saved and says so,
 * and its Undo comes back stale. The saved toast goes to whatever page the tab shows by then.
 */
export function createAssignPage(): AssignPage {
  return async ({ key, tabId: named, openMode, resolve }, senderTab) => {
    const tabId = senderTab?.id ?? named;
    if (tabId === undefined) return { kind: 'failed' };
    try {
      const [tab, keymap] = await Promise.all([browser.tabs.get(tabId), readKeymap()]);
      const page = { url: tab.url ?? '', title: tab.title ?? '' };
      const plan = planAssign(keymap, key, page, { openMode, resolve });
      if (plan.kind !== 'written') return plan;

      const written = await writeChange(plan.change);
      if (!written.ok) return { kind: 'failed' };
      const record = undoRecord(plan.undo, crypto.randomUUID(), Date.now());
      await writeUndo(record).catch((error: unknown) => console.error('SpeedLink: no undo record', error));
      sendToast(tabId, { kind: 'saved', key, name: displayName(plan.shortcut), undoId: record.id });
      return { kind: 'saved', undoId: record.id };
    } catch (error) {
      console.error('SpeedLink: could not assign', key, error);
      return { kind: 'failed' };
    }
  };
}

export type Undo = (request: { id: string }) => Promise<UndoReply>;

/**
 * The function behind the `undo` message: all or nothing (`planUndo`). Only a successful undo removes the record;
 * a stale or failed one leaves it to expire.
 */
export function createUndo(): Undo {
  return async ({ id }) => {
    try {
      const [record, keymap] = await Promise.all([readUndo(), readKeymap()]);
      const plan = planUndo(keymap, record, { id, now: Date.now() });
      if (plan.kind === 'stale') return plan;
      const written = await writeChange(plan.change);
      if (!written.ok) return { kind: 'failed' };
      await removeUndo();
      return { kind: 'undone' };
    } catch (error) {
      console.error('SpeedLink: could not undo', error);
      return { kind: 'failed' };
    }
  };
}
