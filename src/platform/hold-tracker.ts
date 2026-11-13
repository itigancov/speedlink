// The overlay hold (product spec §5.1): feeds `stepHud` with the content script's events and runs its effects. One
// per frame, each with its own timer; the top frame renders, a sub-frame relays.
import { type HudContext, type HudEffect, type HudEvent, INITIAL_HUD_STATE, stepHud } from '@/domain/hud-state';
import { type HoldTracker, keyInput, swallow } from './key-capture';

/** How long ⌥ must be held alone before the Peek shows. Fixed, no setting. */
export const PEEK_DELAY_MS = 400;

/** What the effects do in this frame. The top frame gets every one but `relay`; a sub-frame gets only `relay`. */
export interface HoldEffects {
  fetchModel(): void;
  show(): void;
  close(): void;
  relay(event: 'show' | 'close'): void;
}

export interface HoldTrackerOptions extends HudContext {
  effects: HoldEffects;
}

/** The `HoldTracker` for key capture, plus `dispatch` for the overlay's own events and the sub-frame relay. */
export function createHoldTracker({ effects, ...context }: HoldTrackerOptions): HoldTracker & {
  dispatch(event: HudEvent): void;
} {
  let state = INITIAL_HUD_STATE;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const run = (effect: HudEffect) => {
    switch (effect.kind) {
      case 'startTimer':
        clearTimer();
        timer = setTimeout(() => {
          timer = undefined;
          dispatch({ kind: 'timer-fired' });
        }, PEEK_DELAY_MS);
        return;
      case 'clearTimer':
        return clearTimer();
      case 'fetchModel':
        return effects.fetchModel();
      case 'show':
        return effects.show();
      case 'close':
        return effects.close();
      case 'relay':
        return effects.relay(effect.event);
    }
  };

  /** Returns whether the event was consumed. */
  function dispatch(event: HudEvent): boolean {
    const next = stepHud(state, event, context);
    state = next.state;
    for (const effect of next.effects) run(effect);
    return next.consumed;
  }

  const onKey = (kind: 'keydown' | 'keyup') => (event: KeyboardEvent) => {
    if (!dispatch({ kind, input: keyInput(event) })) return undefined;
    swallow(event);
    return 'consumed' as const;
  };

  return {
    keydown: onKey('keydown'),
    keyup: onKey('keyup'),
    cancel: (reason) => {
      dispatch({ kind: 'cancel', reason });
    },
    dispatch: (event) => {
      dispatch(event);
    },
    dispose: () => {
      clearTimer();
      state = INITIAL_HUD_STATE;
    },
  };
}
