import { defineExtensionMessaging } from '@webext-core/messaging';
import type { Resolve } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
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

/** What `undo` did. `stale`: the record is gone, expired, someone else's, or a touched key changed; nothing written. */
export type UndoReply = { kind: 'undone' } | { kind: 'stale' } | { kind: 'failed' };

/**
 * The one message protocol (product spec §11.4). Every message between the background, content scripts and
 * extension pages goes through here; never call `runtime.sendMessage` / `tabs.sendMessage` directly.
 *
 * Shapes the spec has settled are typed literally. Anything still undecided is `unknown`, with a TODO naming the
 * backlog item that defines it. No handlers live here.
 *
 * Directions:
 * - content → bg: openKey, assignPage, undo, openOptions, getOverlayModel, frameEvent
 * - popup → bg: assignPage, openOptions
 * - options → bg: tryKey
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

  /** ⌥+key pressed on a page (sender.tab is the current tab, sub-frames too); `force` is Force new tab. */
  openKey(data: { key: Key; force: boolean }): OpenKeyReply;

  /**
   * Put a tab's page on a key (popup, free-key toast) and write the undo record in `storage.session`. A content
   * script's own tab (sender.tab) always wins, and it sends no `tabId`: the page doesn't know it. The popup names it.
   */
  assignPage(data: { key: Key; tabId?: number; openMode?: OpenMode; resolve?: Resolve }): AssignPageReply;

  /** Undo the assign whose saved toast carried `id`. */
  undo(data: { id: string }): UndoReply;

  /** Focus an open Options tab, or open one next to the sender, optionally with a key selected (`#key=K`). */
  openOptions(data?: { key?: Key }): void;

  /** The overlay's model, built by the background. */
  getOverlayModel(): unknown; // TODO(item 16): overlay model type

  /** Hold/release state shared between frames; relayed through the background to the top frame. */
  frameEvent(data: {
    kind: 'hold-start' | 'hold-cancel' | 'release' | 'key';
    // TODO(item 16): the rest of the payload, with the relay and its first consumer
  }): void;

  // options → bg

  /** Try ⌥K: open the key as if pressed on the Options tab (sender.tab), which is never replaced or closed. */
  tryKey(data: { key: Key }): OpenKeyReply;

  // bg → tab

  /** Liveness check before injecting the content script: every frame's script answers `true`. */
  ping(): true;

  /** Overlay control from the `toggle-overlay` command and the background. */
  overlay(data: { action: 'toggle' | 'pin' | 'cancel-hold' }): void;

  /** Show a page toast in the top frame (product spec §6). */
  toast(data: PageToastData): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
