// The overlay's hold state machine (product spec §5.1, §11.5): plain events in, the next state and effects out.
// The content script's hold tracker feeds it and runs the effects (timer, model fetch, overlay, frame relay).
import type { BrowserOs, KeydownInput } from './keydown';
import { isAssignable, keyLabelFromCode } from './keys';

/** What stops a pending ⌥ hold besides a key. */
export type HoldCancelReason = 'mousedown' | 'wheel' | 'blur' | 'visibilitychange';

/**
 * - `closed`: nothing pending.
 * - `arming`: ⌥ is held alone; the 400 ms timer runs.
 * - `peek`: the overlay shows while ⌥ is held.
 * - `pinned`: the pinned overlay (§5.2): it stays after the ⌥ release, and the overlay itself handles the search.
 *
 * `peeked` is true from a shown Peek or a pin until the ⌥ keyup, whatever closed the overlay: the Windows ⌥ keyup is
 * then consumed, so Chrome doesn't focus its ⋮ menu (nor take focus from the search).
 */
export interface HudState {
  readonly phase: 'closed' | 'arming' | 'peek' | 'pinned';
  readonly peeked: boolean;
}

export const INITIAL_HUD_STATE: HudState = { phase: 'closed', peeked: false };

/** Which frame the reducer runs in: only the top frame renders; a sub-frame relays show, close and pin to it. */
export interface HudContext {
  os: BrowserOs;
  frame: 'top' | 'sub';
}

/**
 * - `keydown` / `keyup`: every key event, as plain data.
 * - `timer-fired`: the 400 ms hold timer ran out.
 * - `cancel`: a page-side mousedown or wheel, or the window's blur or visibilitychange.
 * - `opened`: the overlay opened a key (a tile click, ↵ in the search).
 * - `close`: the overlay's own ways out: a scrim click, the pencil, Esc on an empty search.
 * - `toggle`: ⌥S in this frame, the `toggle-overlay` command, or a sub-frame's pin.
 * - `remote-show` / `remote-close`: a sub-frame's Peek, relayed to the top frame.
 */
export type HudEvent =
  | { kind: 'keydown'; input: KeydownInput }
  | { kind: 'keyup'; input: KeydownInput }
  | { kind: 'timer-fired' }
  | { kind: 'cancel'; reason: HoldCancelReason }
  | { kind: 'opened' }
  | { kind: 'close' }
  | { kind: 'toggle' }
  | { kind: 'remote-show' }
  | { kind: 'remote-close' };

export type HudEffect =
  | { kind: 'startTimer' }
  | { kind: 'clearTimer' }
  | { kind: 'fetchModel' }
  | { kind: 'show' }
  | { kind: 'pin' }
  | { kind: 'close' }
  | { kind: 'relay'; event: 'show' | 'close' | 'pin' };

/** `consumed`: the event stops here, and neither key capture nor the page sees it. */
export interface HudStep {
  state: HudState;
  effects: HudEffect[];
  consumed: boolean;
}

const isAlt = (code: string) => code === 'AltLeft' || code === 'AltRight';

/** ⌥ pressed with nothing else, outside a field and an IME composition. */
const startsHold = ({ code, shiftKey, ctrlKey, metaKey, altGraph, repeat, composing, editable }: KeydownInput) =>
  isAlt(code) && !shiftKey && !ctrlKey && !metaKey && !altGraph && !repeat && !composing && !editable;

const step = (state: HudState, effects: HudEffect[] = [], consumed = false): HudStep => ({ state, effects, consumed });

/** The window lost the keyboard: the ⌥ keyup that ends this hold goes elsewhere, so nothing is left to consume. */
const leftWindow = (reason: HoldCancelReason) => reason === 'blur' || reason === 'visibilitychange';

const isShift = (code: string) => code === 'ShiftLeft' || code === 'ShiftRight';

/** ⌥ + one of the 35 keys, outside a page field: key capture opens it, or answers that it is free. */
const opensKey = ({ code, altKey, ctrlKey, metaKey, altGraph, composing, editable }: KeydownInput) => {
  const label = keyLabelFromCode(code);
  return (
    altKey && !ctrlKey && !metaKey && !altGraph && !composing && !editable && label !== null && isAssignable(label)
  );
};

export function stepHud(state: HudState, event: HudEvent, context: HudContext): HudStep {
  const top = context.frame === 'top';
  const show: HudEffect = top ? { kind: 'show' } : { kind: 'relay', event: 'show' };
  const close: HudEffect = top ? { kind: 'close' } : { kind: 'relay', event: 'close' };
  /** Pins from any phase but `pinned`. A sub-frame hands the pin to the top frame and has nothing left showing. */
  const pin = (effects: HudEffect[]) =>
    top
      ? step({ phase: 'pinned', peeked: true }, [...effects, { kind: 'pin' }])
      : step({ phase: 'closed', peeked: true }, [...effects, { kind: 'relay', event: 'pin' }]);

  // The ⌥ release ends the hold in every phase; on Windows, after a Peek, it is consumed.
  if (event.kind === 'keyup' && isAlt(event.input.code)) {
    const consumed = context.os === 'windows' && state.peeked;
    switch (state.phase) {
      case 'arming':
        return step(INITIAL_HUD_STATE, [{ kind: 'clearTimer' }], consumed);
      case 'peek':
        return step(INITIAL_HUD_STATE, [close], consumed);
      case 'closed':
        return step(INITIAL_HUD_STATE, [], consumed);
      case 'pinned':
        return step({ ...state, peeked: false }, [], consumed);
    }
  }

  switch (state.phase) {
    case 'closed':
      if (event.kind === 'keydown' && startsHold(event.input)) {
        return step({ phase: 'arming', peeked: false }, [
          { kind: 'startTimer' },
          ...(top ? [{ kind: 'fetchModel' } as const] : []),
        ]);
      }
      // A sub-frame's Peek: its ⌥ keyup stays in that frame, which consumes it itself.
      if (event.kind === 'remote-show' && top) {
        return step({ phase: 'peek', peeked: false }, [{ kind: 'fetchModel' }, show]);
      }
      if (event.kind === 'toggle') return pin(top ? [{ kind: 'fetchModel' }] : []);
      if (event.kind === 'cancel' && leftWindow(event.reason)) return step(INITIAL_HUD_STATE);
      return step(state);

    case 'arming':
      if (event.kind === 'timer-fired') return step({ phase: 'peek', peeked: true }, [show]);
      if (event.kind === 'toggle') return pin([{ kind: 'clearTimer' }]);
      if (event.kind === 'keydown' && isAlt(event.input.code) && event.input.repeat) return step(state);
      if (event.kind === 'keydown' || event.kind === 'cancel') {
        return step(INITIAL_HUD_STATE, [{ kind: 'clearTimer' }]);
      }
      return step(state);

    case 'peek': {
      // A shown Peek is remembered until the ⌥ keyup, for the Windows menu.
      const closed: HudState = { phase: 'closed', peeked: state.peeked };
      switch (event.kind) {
        case 'keydown': {
          const { code } = event.input;
          if ((isAlt(code) && event.input.repeat) || isShift(code)) return step(state);
          if (code === 'KeyS' && event.input.altKey) return { ...pin([]), consumed: true };
          // A key reaches key capture (which opens it, or answers free) and anything else the page; Esc is ours.
          return step(closed, [close], code === 'Escape');
        }
        case 'cancel':
          return step(leftWindow(event.reason) ? INITIAL_HUD_STATE : closed, [close]);
        case 'opened':
        case 'close':
        case 'remote-close':
          return step(closed, [close]);
        case 'toggle':
          return pin([]);
        default:
          return step(state);
      }
    }

    case 'pinned': {
      // Only an open or a way out closes it: the ⌥ release, the page and other frames leave it alone (Esc, ↵ and the
      // search keys are the overlay's own).
      const closed: HudState = { phase: 'closed', peeked: state.peeked };
      switch (event.kind) {
        case 'keydown':
          return opensKey(event.input) ? step(closed, [close]) : step(state);
        // ⌥S closes as it pinned: its ⌥ release follows.
        case 'toggle':
          return step({ phase: 'closed', peeked: true }, [close]);
        case 'opened':
        case 'close':
          return step(closed, [close]);
        default:
          return step(state);
      }
    }
  }
}
