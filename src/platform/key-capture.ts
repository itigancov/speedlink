// The content script's keydown/keyup pipeline (product spec §4.2, §4.3): a thin DOM adapter around
// `classifyKeydown`. The entrypoint registers it on `window` in the capture phase.
import type { HoldCancelReason } from '@/domain/hud-state';
import { type BrowserOs, classifyKeydown, type KeydownInput } from '@/domain/keydown';
import type { Key } from '@/domain/keys';
import type { OpenKeyRequest } from './open-key';

/**
 * The sink for the overlay hold (`hold-tracker.ts`). It sees every keydown and keyup before anything else and may
 * return `consumed` to stop the pipeline there (Esc in a Peek, the Windows Alt keyup after one); it swallows such an
 * event itself.
 */
export interface HoldTracker {
  keydown(event: KeyboardEvent): 'consumed' | undefined;
  keyup(event: KeyboardEvent): 'consumed' | undefined;
  cancel(reason: HoldCancelReason): void;
  dispose(): void;
}

export interface KeyCaptureOptions {
  os: BrowserOs;
  /** From the occupied-keys cache: decides only between swallowing a key and letting it through. */
  isAssigned(key: Key): boolean;
  holdTracker: HoldTracker;
  /** True once this copy's extension context is gone; checking it tears the copy down. */
  isInvalid(): boolean;
  /** Sends `openKey`. Whatever the background replies, the page does nothing. */
  openKey(request: OpenKeyRequest): Promise<unknown>;
  /** ⌥S: pins the overlay, or closes the pinned one (§5.3). */
  toggle(): void;
  /** The HUD's own search field, where ⌥ + key is still ours; see `keyInput`. */
  isHudField?: HudField;
}

/** Whether a key event's real target is one of the HUD's own fields. */
export type HudField = (target: EventTarget) => boolean;

const NO_HUD_FIELD: HudField = () => false;

/** Input types that don't take text: ⌥ + key on them is still ours. */
const NON_TEXT_INPUTS: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
  'hidden',
]);

/**
 * A press the page's field should get: a text-like `input`, `textarea`, `select`, a rich editor or a `designMode`
 * document. `target` is `composedPath()[0]`, so a field inside a shadow root counts too.
 */
export function isEditableTarget(target: EventTarget | undefined): boolean {
  if (target === undefined || !('nodeType' in target)) return false;
  const node = target as Node;
  const document = node.nodeType === Node.DOCUMENT_NODE ? (node as Document) : node.ownerDocument;
  if (document?.designMode === 'on') return true;
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const element = node as HTMLElement;
  switch (element.localName) {
    case 'input':
      return !NON_TEXT_INPUTS.has((element as HTMLInputElement).type);
    case 'textarea':
    case 'select':
      return true;
    default:
      return element.isContentEditable === true;
  }
}

/** A key event as the plain data the domain reads. A HUD field is not `editable`: the pinned search keeps ⌥ + key. */
export function keyInput(event: KeyboardEvent, isHudField: HudField = NO_HUD_FIELD): KeydownInput {
  const target = event.composedPath()[0];
  return {
    code: event.code,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altGraph: event.getModifierState('AltGraph'),
    repeat: event.repeat,
    composing: event.isComposing || event.keyCode === 229,
    editable: isEditableTarget(target) && !(target !== undefined && isHudField(target)),
  };
}

export const swallow = (event: Event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
};

/**
 * The listeners for one copy of the content script. Each event: stop if the context is gone, hand it to the hold
 * tracker, then (keydown only) classify it synchronously and apply the decision.
 */
export function createKeyCapture(options: KeyCaptureOptions): {
  keydown(event: KeyboardEvent): void;
  keyup(event: KeyboardEvent): void;
} {
  const { os, isAssigned, holdTracker, isInvalid, openKey, toggle, isHudField } = options;
  return {
    keydown(event) {
      if (isInvalid()) return;
      if (holdTracker.keydown(event) === 'consumed') return;

      const decision = classifyKeydown(keyInput(event, isHudField), os, isAssigned);
      if (decision.kind === 'ignore' || decision.kind === 'pass') return;

      swallow(event);
      if (decision.kind === 'reserved') toggle();
      if (decision.kind !== 'open') return;
      openKey({ key: decision.key, force: decision.force }).catch((error: unknown) =>
        console.debug('SpeedLink: could not ask to open', decision.key, error),
      );
    },
    keyup(event) {
      if (isInvalid()) return;
      holdTracker.keyup(event);
    },
  };
}
