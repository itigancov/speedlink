import { defineExtensionMessaging } from '@webext-core/messaging';
import type { Key } from '@/domain/keys';
import type { OpenMode } from '@/domain/shortcut';

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
 * The one message protocol (product spec §11.4). Every message between the background, content scripts and
 * extension pages goes through here; never call `runtime.sendMessage` / `tabs.sendMessage` directly.
 *
 * Shapes the spec has settled are typed literally. Anything still undecided is `unknown`, with a TODO naming the
 * backlog item that defines it. No handlers live here.
 *
 * Directions:
 * - content → bg: openKey, assignPage, undo, openOptions, getOverlayModel, frameEvent
 * - popup → bg: assignPage, openOptions
 * - bg → tab (frameId 0, via `sendToTab` in `injection.ts`): ping, overlay, toast, frameEvent
 */
/**
 * A page toast. `free`: ⌥ + a free key was pressed on the page. `switched`: Smart switch activated this tab;
 * `name` is the shortcut's display name (its name, else its link's site).
 */
export type PageToastData = { kind: 'free'; key: Key } | { kind: 'switched'; key: Key; name: string };
// TODO(item 14): add `{ kind: 'saved'; … }` with the undo handle.

export interface ProtocolMap {
  // content → bg

  /** ⌥+key pressed on a page (sender.tab is the current tab, sub-frames too); `force` is Force new tab. */
  openKey(data: { key: Key; force: boolean }): OpenKeyReply;

  /** Assign the current page to a key (popup, free-key toast). Writes the undo record in `storage.session`. */
  assignPage(data: { key: string; tabId: number; openMode?: OpenMode; resolve?: 'replace' | 'move' }): unknown; // TODO(item 14): reply shape (conflict / saved + undo handle)

  /** Undo the last assign. */
  undo(): unknown; // TODO(item 14): reply shape

  /** Focus an open Options tab, or open one next to the sender, optionally with a key selected (`#key=K`). */
  openOptions(data?: { key?: Key }): void;

  /** The overlay's model, built by the background. */
  getOverlayModel(): unknown; // TODO(item 16): overlay model type

  /** Hold/release state shared between frames; relayed through the background to the top frame. */
  frameEvent(data: {
    kind: 'hold-start' | 'hold-cancel' | 'release' | 'key';
    // TODO(item 16): the rest of the payload, with the relay and its first consumer
  }): void;

  // bg → tab

  /** Liveness check before injecting the content script: every frame's script answers `true`. */
  ping(): true;

  /** Overlay control from the `toggle-overlay` command and the background. */
  overlay(data: { action: 'toggle' | 'pin' | 'cancel-hold' }): void;

  /** Show a page toast in the top frame (product spec §6). */
  toast(data: PageToastData): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
