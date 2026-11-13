// The overlay's hold state machine (product spec §5.1, §11.5): plain events in, the next state and effects out.
// The content script's hold tracker feeds it and runs the effects (timer, model fetch, overlay, frame relay).
import type { BrowserOs, KeydownInput } from './keydown';

/** What stops a pending ⌥ hold besides a key. */
export type HoldCancelReason = 'mousedown' | 'wheel' | 'blur' | 'visibilitychange';

/**
 * - `closed`: nothing pending.
 * - `arming`: ⌥ is held alone; the 400 ms timer runs.
 * - `peek`: the overlay shows while ⌥ is held.
 * - `pinned`: the pinned overlay (item 17); nothing enters it yet.
 *
 * `peeked` is true from a shown Peek until the ⌥ keyup, whatever closed the Peek: the Windows ⌥ keyup is then
 * consumed, so Chrome doesn't focus its ⋮ menu.
 */
export interface HudState {
  readonly phase: 'closed' | 'arming' | 'peek' | 'pinned';
  readonly peeked: boolean;
}

export const INITIAL_HUD_STATE: HudState = { phase: 'closed', peeked: false };

/** Which frame the reducer runs in: only the top frame renders; a sub-frame relays show and close to it. */
export interface HudContext {
  os: BrowserOs;
  frame: 'top' | 'sub';
}

/**
 * - `keydown` / `keyup`: every key event, as plain data.
 * - `timer-fired`: the 400 ms hold timer ran out.
 * - `cancel`: a page-side mousedown or wheel, or the window's blur or visibilitychange.
 * - `opened`: a tile click opened a key.
 * - `close`: Esc-free ways out: a scrim click, the pencil.
 * - `remote-show` / `remote-close`: a sub-frame's Peek, relayed to the top frame.
 */
export type HudEvent =
  | { kind: 'keydown'; input: KeydownInput }
  | { kind: 'keyup'; input: KeydownInput }
  | { kind: 'timer-fired' }
  | { kind: 'cancel'; reason: HoldCancelReason }
  | { kind: 'opened' }
  | { kind: 'close' }
  | { kind: 'remote-show' }
  | { kind: 'remote-close' };

export type HudEffect =
  | { kind: 'startTimer' }
  | { kind: 'clearTimer' }
  | { kind: 'fetchModel' }
  | { kind: 'show' }
  | { kind: 'close' }
  | { kind: 'relay'; event: 'show' | 'close' };

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

export function stepHud(state: HudState, event: HudEvent, context: HudContext): HudStep {
  const top = context.frame === 'top';
  const show: HudEffect = top ? { kind: 'show' } : { kind: 'relay', event: 'show' };
  const close: HudEffect = top ? { kind: 'close' } : { kind: 'relay', event: 'close' };

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
      if (event.kind === 'cancel' && leftWindow(event.reason)) return step(INITIAL_HUD_STATE);
      return step(state);

    case 'arming':
      if (event.kind === 'timer-fired') return step({ phase: 'peek', peeked: true }, [show]);
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
          // A key reaches key capture (which opens it, or answers free) and anything else the page; Esc is ours.
          return step(closed, [close], code === 'Escape');
        }
        case 'cancel':
          return step(leftWindow(event.reason) ? INITIAL_HUD_STATE : closed, [close]);
        case 'opened':
        case 'close':
        case 'remote-close':
          return step(closed, [close]);
        default:
          return step(state);
      }
    }

    case 'pinned':
      return step(state);
  }
}
