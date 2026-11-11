import { defineExtensionMessaging } from '@webext-core/messaging';

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
 * - bg → tab (frameId 0, via item 08's `sendToTab`): ping, overlay, toast, frameEvent
 */
export interface ProtocolMap {
  // content → bg

  /** ⌥+key pressed on a page. `key` becomes the domain Key type in item 03. */
  openKey(data: { key: string; force: boolean }): unknown; // TODO(item 07): reply shape

  /** Assign the current page to a key (popup, free-key toast). Writes the undo record in `storage.session`. */
  assignPage(data: {
    key: string;
    tabId: number;
    openMode?: unknown; // TODO(item 07): the domain open-mode type
    resolve?: 'replace' | 'move';
  }): unknown; // TODO(item 14): reply shape (conflict / saved + undo handle)

  /** Undo the last assign. */
  undo(): unknown; // TODO(item 14): reply shape

  /** Open the Options page, optionally with a key selected. */
  openOptions(data?: { key?: string }): void;

  /** The overlay's model, built by the background. */
  getOverlayModel(): unknown; // TODO(item 16): overlay model type

  /** Hold/release state shared between frames; relayed through the background to the top frame. */
  frameEvent(data: {
    kind: 'hold-start' | 'hold-cancel' | 'release' | 'key';
    // TODO(item 08): the rest of the payload
  }): void;

  // bg → tab

  /** Liveness check before injecting the content script. */
  ping(): unknown; // TODO(item 08): reply shape

  /** Overlay control from the `toggle-overlay` command and the background. */
  overlay(data: { action: 'toggle' | 'pin' | 'cancel-hold' }): void;

  /** Show a page toast. */
  toast(data: {
    kind: 'saved' | 'free' | 'switched';
    // TODO(item 10/14): the rest of the payload and the remaining kinds
  }): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
