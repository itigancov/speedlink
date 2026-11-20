import { defineExtensionMessaging } from '@webext-core/messaging';
import type { Resolve } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
import type { OverlayModel } from '@/domain/overlay-model';
import type { OpenMode, Shortcut } from '@/domain/shortcut';

/**
 * What `openKey` did. `opened.switched` is true when Smart switch activated an existing tab; the background sends
 * the switched toast itself (item 10), since the caller's tab may already be closed.
 */
export type OpenKeyReply =
  | { kind: 'opened'; tabId: number; switched: boolean }
  | { kind: 'noop' }
  | { kind: 'free' }
  | { kind: 'failed' };

/**
 * What `assignPage` did. `saved`: the page is on the key and the background sends the saved toast to the tab;
 * `undoId` is the handle for `undo`. `conflict`: the key holds `existing`, nothing written; `moveTarget` is where
 * Move would put it (null when no key is free). `unusable`: the page can't go on a key. `failed`: no such tab, or
 * the write failed.
 */
export type AssignPageReply =
  | { kind: 'saved'; undoId: string }
  | { kind: 'conflict'; existing: Shortcut; moveTarget: Key | null }
  | { kind: 'unusable' }
  | { kind: 'failed' };

/** What the popup's key card asks of a shortcut already on a key (product spec §7). */
export type EditOp =
  | { kind: 'openMode'; openMode: OpenMode }
  | { kind: 'remove' }
  | { kind: 'move'; to: Key; resolve?: 'replace' }
  | { kind: 'exactPage' };

/**
 * What `editShortcut` did. `saved`: written; `undo` (the record's handle and when it lapses) only for remove and
 * move. `conflict`: a move onto a taken key without `resolve`, nothing written. `missing`: the key is free now.
 * `unusable`: exactPage on a tab URL that isn't a link. `failed`: no such tab, a refused move, or the write failed.
 */
export type EditShortcutReply =
  | { kind: 'saved'; undo?: { id: string; expiresAt: number } }
  | { kind: 'conflict'; existing: Shortcut }
  | { kind: 'missing' }
  | { kind: 'unusable' }
  | { kind: 'failed' };

/** A sub-frame's Peek or pin, for the top frame (§4.4). */
export interface FrameEvent {
  kind: 'show' | 'close' | 'pin';
}

/** What `undo` did. `stale`: the record is gone, expired, someone else's, or a touched key changed; nothing written. */
export type UndoReply = { kind: 'undone' } | { kind: 'stale' } | { kind: 'failed' };

/**
 * The one message protocol (product spec §11.4). Every message between the background, content scripts and
 * extension pages goes through here; never call `runtime.sendMessage` / `tabs.sendMessage` directly.
 *
 * Shapes the spec has settled are typed literally. No handlers live here.
 *
 * Directions:
 * - content → bg: openKey, assignPage, undo, openOptions, getOverlayModel, frameEvent
 * - popup → bg: openKey, assignPage, editShortcut, undo, openOptions, getOverlayModel
 * - options, welcome → bg: tryKey, openOptions
 * - bg → tab (frameId 0, via `sendToTab` in `injection.ts`): ping, overlay, toast, frameEvent
 */
/**
 * A page toast. `free`: ⌥ + a free key was pressed on the page. `switched`: Smart switch activated this tab.
 * `saved`: a page was just put on the key; `undoId` is the assign's `undo` handle. `error`: an Undo was refused or a
 * save failed. `name` is the shortcut's display name (its name, else its link's site).
 */
/** Why the error toast shows: an Undo refused (§3.3), or an assign that saved nothing. */
export type PageToastErrorReason = 'undo-stale' | 'save-failed';

export type PageToastData =
  | { kind: 'free'; key: Key }
  | { kind: 'switched'; key: Key; name: string }
  | { kind: 'saved'; key: Key; name: string; undoId: string }
  | { kind: 'error'; key: Key; reason: PageToastErrorReason };

export interface ProtocolMap {
  // content → bg

  /**
   * ⌥+key pressed on a page (sender.tab is the current tab, sub-frames too); `force` is Force new tab. A content
   * script's own tab always wins and it sends no `tabId`; the popup on a restricted page names the tab it came from.
   */
  openKey(data: { key: Key; force: boolean; tabId?: number }): OpenKeyReply;

  /**
   * Put a tab's page on a key (popup, free-key toast) and write the undo record in `storage.session`. A content
   * script's own tab (sender.tab) always wins, and it sends no `tabId`: the page doesn't know it. The popup names it.
   */
  assignPage(data: { key: Key; tabId?: number; openMode?: OpenMode; resolve?: Resolve }): AssignPageReply;

  /**
   * Edit the shortcut on `key` from the popup's key card. Only `key`, `tabId` and `op` come from the popup: the
   * keymap and the tab's URL are read fresh by the background. Remove and move write the undo record.
   */
  editShortcut(data: { key: Key; tabId: number; op: EditOp }): EditShortcutReply;

  /** Undo the change whose saved toast (or the popup's inline Undo) carried `id`. */
  undo(data: { id: string }): UndoReply;

  /** Focus an open Options tab, or open one next to the sender, optionally with a key selected (`#key=K`). */
  openOptions(data?: { key?: Key }): void;

  /**
   * The overlay's model for the sender's tab (else the popup's named `tabId`), built by the background from the fresh
   * keymap and tabs.
   */
  getOverlayModel(data?: { tabId?: number }): OverlayModel;

  /**
   * A sub-frame's Peek: `show` once ⌥ was held 400 ms there, `close` when it ends; `pin` on ⌥S there. The background
   * relays it to the same tab's top frame, which renders the overlay.
   */
  frameEvent(data: FrameEvent): void;

  // SpeedLink's own pages → bg

  /**
   * Options' Test, and ⌥+key on Options or welcome: open the key as if pressed on the SpeedLink page (sender.tab), which is
   * never replaced or closed. `force` is Force new tab. A free key replies `free`, with no toast (nothing to show it).
   */
  tryKey(data: { key: Key; force?: boolean }): OpenKeyReply;

  // bg → tab

  /** Liveness check before injecting the content script: every frame's script answers `true`. */
  ping(): true;

  /** The `toggle-overlay` command: pins the overlay in the top frame, or closes the pinned one. */
  overlay(data: { action: 'toggle' }): void;

  /** Show a page toast in the top frame (product spec §6). */
  toast(data: PageToastData): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
