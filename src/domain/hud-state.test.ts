import { describe, expect, it } from 'vitest';
import { type HudContext, type HudEvent, type HudState, INITIAL_HUD_STATE, stepHud } from './hud-state';
import type { KeydownInput } from './keydown';

/** A keydown of `code` with nothing held but what `fields` says, on a normal page target. */
const key = (code: string, fields: Partial<KeydownInput> = {}): KeydownInput => ({
  code,
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altGraph: false,
  repeat: false,
  composing: false,
  editable: false,
  ...fields,
});

const down = (code: string, fields: Partial<KeydownInput> = {}): HudEvent => ({
  kind: 'keydown',
  input: key(code, fields),
});
const up = (code: string, fields: Partial<KeydownInput> = {}): HudEvent => ({
  kind: 'keyup',
  input: key(code, fields),
});

/** ⌥ pressed alone: the keydown of AltLeft carries `altKey` itself. */
const altDown = (fields: Partial<KeydownInput> = {}) => down('AltLeft', { altKey: true, ...fields });
const altUp = () => up('AltLeft');
/** ⌥ + a key, as it arrives while ⌥ is held. */
const withAlt = (code: string, fields: Partial<KeydownInput> = {}) => down(code, { altKey: true, ...fields });
const fired: HudEvent = { kind: 'timer-fired' };

const TOP_MAC: HudContext = { os: 'mac', frame: 'top' };
const TOP_WINDOWS: HudContext = { os: 'windows', frame: 'top' };

/** Runs events from the closed state; returns the last step and the effects of every step, in order. */
function run(events: HudEvent[], context: HudContext = TOP_MAC) {
  let state: HudState = INITIAL_HUD_STATE;
  let consumed = false;
  const effects: string[] = [];
  for (const event of events) {
    const step = stepHud(state, event, context);
    state = step.state;
    consumed = step.consumed;
    effects.push(...step.effects.map((effect) => (effect.kind === 'relay' ? `relay:${effect.event}` : effect.kind)));
  }
  /** `consumed` is the answer for the last event. */
  return { state, consumed, effects, shown: effects.includes('show') || effects.includes('relay:show') };
}

describe('stepHud: arming', () => {
  it('starts the timer and fetches the model on a bare ⌥ in the top frame', () => {
    expect(run([altDown()]).effects).toEqual(['startTimer', 'fetchModel']);
  });

  it('arms on the right ⌥ too', () => {
    expect(run([down('AltRight', { altKey: true })]).effects).toEqual(['startTimer', 'fetchModel']);
  });

  it.each([
    ['⇧', { shiftKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['⌘', { metaKey: true }],
    ['AltGr', { altGraph: true }],
    ['a repeat', { repeat: true }],
    ['composing', { composing: true }],
    ['an editable target', { editable: true }],
  ])('does not arm on ⌥ with %s', (_, fields) => {
    expect(run([altDown(fields)]).effects).toEqual([]);
  });

  it('shows the overlay when the timer fires', () => {
    expect(run([altDown(), fired]).effects).toEqual(['startTimer', 'fetchModel', 'show']);
  });

  it('never shows on a quick ⌥ + key, and leaves the key to key capture', () => {
    const result = run([altDown(), withAlt('KeyK'), fired]);
    expect(result.shown).toBe(false);
    expect(result.effects).toEqual(['startTimer', 'fetchModel', 'clearTimer']);
  });

  it('ignores the auto-repeat of a held ⌥', () => {
    expect(run([altDown(), altDown({ repeat: true }), altDown({ repeat: true }), fired]).effects).toEqual([
      'startTimer',
      'fetchModel',
      'show',
    ]);
  });
});

describe('stepHud: cancelling a hold', () => {
  it.each([
    ['another key', withAlt('KeyK')],
    ['⇧', withAlt('ShiftLeft', { shiftKey: true })],
    ['a mousedown', { kind: 'cancel', reason: 'mousedown' } as HudEvent],
    ['a wheel', { kind: 'cancel', reason: 'wheel' } as HudEvent],
    ['a blur', { kind: 'cancel', reason: 'blur' } as HudEvent],
    ['a visibilitychange', { kind: 'cancel', reason: 'visibilitychange' } as HudEvent],
    ['an early ⌥ keyup', altUp()],
  ])('cancels on %s before 400 ms, and the overlay never shows', (_, cancel) => {
    const result = run([altDown(), cancel, fired]);
    expect(result.effects).toEqual(['startTimer', 'fetchModel', 'clearTimer']);
    expect(result.shown).toBe(false);
  });

  it('consumes nothing while arming, so key capture still opens a quick ⌥ + key', () => {
    expect(run([altDown(), withAlt('KeyK')]).consumed).toBe(false);
  });

  it('arms again after a cancelled hold', () => {
    expect(run([altDown(), altUp(), altDown(), fired]).shown).toBe(true);
  });
});

/** ⌥ held past 400 ms: the overlay is up. */
const PEEK = [altDown(), fired];
const PEEK_EFFECTS = ['startTimer', 'fetchModel', 'show'];

describe('stepHud: in a Peek', () => {
  it.each([
    ['a key', withAlt('KeyK')],
    ['⇧ + key', withAlt('KeyK', { shiftKey: true })],
    ['⌥ + a free key', withAlt('KeyQ')],
  ])('closes on %s and leaves it to key capture', (_, press) => {
    const result = run([...PEEK, press]);
    expect(result.effects).toEqual([...PEEK_EFFECTS, 'close']);
    expect(result.consumed).toBe(false);
  });

  it('keeps the Peek on ⇧ alone, so ⇧ + key can follow', () => {
    const result = run([...PEEK, withAlt('ShiftLeft', { shiftKey: true }), withAlt('KeyK', { shiftKey: true })]);
    expect(result.effects).toEqual([...PEEK_EFFECTS, 'close']);
  });

  it('keeps the Peek through the auto-repeat of ⌥', () => {
    expect(run([...PEEK, altDown({ repeat: true })]).effects).toEqual(PEEK_EFFECTS);
  });

  it('closes on Esc and consumes it, so the page never sees it', () => {
    const result = run([...PEEK, withAlt('Escape')]);
    expect(result.effects).toEqual([...PEEK_EFFECTS, 'close']);
    expect(result.consumed).toBe(true);
  });

  it.each([
    ['Ctrl', withAlt('ControlLeft', { ctrlKey: true })],
    ['⌘', withAlt('MetaLeft', { metaKey: true })],
    ['Tab', withAlt('Tab')],
    ['an arrow', withAlt('ArrowDown')],
  ])('closes on %s and lets it through to the page', (_, press) => {
    const result = run([...PEEK, press]);
    expect(result.effects).toEqual([...PEEK_EFFECTS, 'close']);
    expect(result.consumed).toBe(false);
  });

  it('closes on the ⌥ release', () => {
    expect(run([...PEEK, altUp()]).effects).toEqual([...PEEK_EFFECTS, 'close']);
  });

  it.each([
    ['a blur', { kind: 'cancel', reason: 'blur' } as HudEvent],
    ['a visibilitychange', { kind: 'cancel', reason: 'visibilitychange' } as HudEvent],
    ['a tile that opened', { kind: 'opened' } as HudEvent],
    ['a scrim click or the pencil', { kind: 'close' } as HudEvent],
  ])('closes on %s', (_, event) => {
    expect(run([...PEEK, event]).effects).toEqual([...PEEK_EFFECTS, 'close']);
  });

  it('ignores keyups of other keys', () => {
    expect(run([...PEEK, up('KeyJ', { altKey: true })]).effects).toEqual(PEEK_EFFECTS);
  });

  it('opens one thing per hold: a key after the close does not show it again', () => {
    expect(run([...PEEK, withAlt('KeyK'), withAlt('KeyJ'), fired]).effects).toEqual([...PEEK_EFFECTS, 'close']);
  });
});

describe('stepHud: the Windows ⌥ keyup', () => {
  it('is consumed after a Peek on Windows', () => {
    expect(run([...PEEK, altUp()], TOP_WINDOWS).consumed).toBe(true);
  });

  it('is consumed after a Peek closed with Esc', () => {
    const result = run([...PEEK, withAlt('Escape'), altDown({ repeat: true }), altUp()], TOP_WINDOWS);
    expect(result.consumed).toBe(true);
    expect(result.effects).toEqual([...PEEK_EFFECTS, 'close']);
  });

  it('is consumed after a Peek closed by a key', () => {
    expect(run([...PEEK, withAlt('KeyK'), altUp()], TOP_WINDOWS).consumed).toBe(true);
  });

  it('is left alone on a bare ⌥ tap, so Chrome still focuses its menu', () => {
    expect(run([altDown(), altUp()], TOP_WINDOWS).consumed).toBe(false);
  });

  it('is left alone on the tap after a Peek', () => {
    expect(run([...PEEK, altUp(), altDown(), altUp()], TOP_WINDOWS).consumed).toBe(false);
  });

  it.each([
    ['a blur', { kind: 'cancel', reason: 'blur' } as HudEvent],
    ['a visibilitychange', { kind: 'cancel', reason: 'visibilitychange' } as HudEvent],
  ])('is left alone on the next tap after a Peek ended by %s, whose own keyup went elsewhere', (_, event) => {
    expect(run([...PEEK, event, altUp()], TOP_WINDOWS).consumed).toBe(false);
  });

  it.each(['mac', 'linux', 'chromeos'] as const)('is never consumed on %s', (os) => {
    expect(run([...PEEK, altUp()], { os, frame: 'top' }).consumed).toBe(false);
  });
});

describe('stepHud: frames', () => {
  const SUB_WINDOWS: HudContext = { os: 'windows', frame: 'sub' };

  it('relays show and close from a sub-frame, with no model fetch there', () => {
    expect(run([...PEEK, altUp()], SUB_WINDOWS).effects).toEqual(['startTimer', 'relay:show', 'relay:close']);
  });

  it('relays the close on Esc and consumes the Windows ⌥ keyup in the sub-frame itself', () => {
    const result = run([...PEEK, withAlt('Escape'), altUp()], SUB_WINDOWS);
    expect(result.effects).toEqual(['startTimer', 'relay:show', 'relay:close']);
    expect(result.consumed).toBe(true);
  });

  it('relays nothing for a cancelled hold', () => {
    expect(run([altDown(), withAlt('KeyK')], SUB_WINDOWS).effects).toEqual(['startTimer', 'clearTimer']);
  });

  it('fetches the model and shows on a sub-frame’s show in the top frame', () => {
    expect(run([{ kind: 'remote-show' }]).effects).toEqual(['fetchModel', 'show']);
  });

  it('closes on a sub-frame’s close', () => {
    expect(run([{ kind: 'remote-show' }, { kind: 'remote-close' }]).effects).toEqual(['fetchModel', 'show', 'close']);
  });

  it('ignores a sub-frame’s close when nothing shows', () => {
    expect(run([{ kind: 'remote-close' }]).effects).toEqual([]);
  });

  it('closes a sub-frame’s Peek on a scrim click in the top frame', () => {
    expect(run([{ kind: 'remote-show' }, { kind: 'close' }]).effects).toEqual(['fetchModel', 'show', 'close']);
  });
});

const toggle: HudEvent = { kind: 'toggle' };

describe('stepHud: pinning', () => {
  it('pins from closed on ⌥S or the command, fetching the model first', () => {
    expect(run([toggle]).effects).toEqual(['fetchModel', 'pin']);
  });

  it('pins a hold before 400 ms with the command, clearing the timer and never showing a Peek', () => {
    const result = run([altDown(), toggle, fired]);
    expect(result.effects).toEqual(['startTimer', 'fetchModel', 'clearTimer', 'pin']);
    expect(result.shown).toBe(false);
  });

  it('turns a Peek into the pinned overlay on the command', () => {
    expect(run([...PEEK, toggle]).effects).toEqual([...PEEK_EFFECTS, 'pin']);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['⌘', { metaKey: true }],
    ['AltGr', { altGraph: true }],
  ])('closes a Peek on ⌥%s + S instead of pinning it', (_, fields) => {
    expect(run([...PEEK, withAlt('KeyS', fields)]).effects).toEqual([...PEEK_EFFECTS, 'close']);
  });

  it('pins a Peek on S and consumes it, so neither key capture nor the page sees it', () => {
    const result = run([...PEEK, withAlt('KeyS')]);
    expect(result.effects).toEqual([...PEEK_EFFECTS, 'pin']);
    expect(result.consumed).toBe(true);
  });
});

/** ⌥S pressed and released: the pinned overlay is up. */
const PINNED = [toggle, altUp()];
const PINNED_EFFECTS = ['fetchModel', 'pin'];

describe('stepHud: the pinned overlay', () => {
  it('stays open after the ⌥ release', () => {
    expect(run(PINNED).effects).toEqual(PINNED_EFFECTS);
  });

  it('closes on ⌥S or the command again', () => {
    expect(run([...PINNED, toggle]).effects).toEqual([...PINNED_EFFECTS, 'close']);
  });

  it.each([
    ['a tile or ↵ that opened', { kind: 'opened' } as HudEvent],
    ['a scrim click, the pencil or Esc on an empty search', { kind: 'close' } as HudEvent],
  ])('closes on %s', (_, event) => {
    expect(run([...PINNED, event]).effects).toEqual([...PINNED_EFFECTS, 'close']);
  });

  it.each([
    ['an assigned key', withAlt('KeyK')],
    ['⇧ + key', withAlt('KeyK', { shiftKey: true })],
    ['a free key', withAlt('KeyQ')],
    ['a key the browser keeps', withAlt('KeyD')],
  ])('leaves ⌥ + %s to key capture, and closes only once it opens a key', (_, press) => {
    const result = run([...PINNED, altDown(), press]);
    expect(result.effects).toEqual(PINNED_EFFECTS);
    expect(result.consumed).toBe(false);
  });

  it.each([
    ['a letter', down('KeyG')],
    ['↵', down('Enter')],
    ['⇧↵', down('Enter', { shiftKey: true })],
    ['Esc', down('Escape')],
    ['an arrow', down('ArrowDown')],
    ['a bare ⌥', altDown()],
    ['a sub-frame’s show', { kind: 'remote-show' } as HudEvent],
    ['a sub-frame’s close', { kind: 'remote-close' } as HudEvent],
    ['the hold timer', fired],
    ['a mousedown on the page', { kind: 'cancel', reason: 'mousedown' } as HudEvent],
    ['a wheel on the page', { kind: 'cancel', reason: 'wheel' } as HudEvent],
    ['a blur', { kind: 'cancel', reason: 'blur' } as HudEvent],
    ['a visibilitychange', { kind: 'cancel', reason: 'visibilitychange' } as HudEvent],
  ])('stays open on %s, and leaves it to the overlay', (_, event) => {
    const result = run([...PINNED, event]);
    expect(result.effects).toEqual(PINNED_EFFECTS);
    expect(result.consumed).toBe(false);
  });

  it('stays open on the ⌥ release after a pinned Peek', () => {
    expect(run([...PEEK, withAlt('KeyS'), altUp()]).effects).toEqual([...PEEK_EFFECTS, 'pin']);
  });

  it('consumes the ⌥ release after ⌥S on Windows, so the ⋮ menu never takes focus from the search', () => {
    expect(run([toggle, altUp()], TOP_WINDOWS).consumed).toBe(true);
    expect(run([toggle, altUp()]).consumed).toBe(false);
  });

  it('consumes the ⌥ release after ⌥S closed it on Windows', () => {
    expect(run([...PINNED, altDown(), toggle, altUp()], TOP_WINDOWS).consumed).toBe(true);
  });

  it('leaves a later bare ⌥ tap alone on Windows', () => {
    expect(run([...PINNED, altDown(), altUp()], TOP_WINDOWS).consumed).toBe(false);
  });

  it('arms a Peek again once closed', () => {
    expect(run([...PINNED, { kind: 'close' }, altDown(), fired]).effects).toEqual([
      ...PINNED_EFFECTS,
      'close',
      'startTimer',
      'fetchModel',
      'show',
    ]);
  });
});

describe('stepHud: pinning in a sub-frame', () => {
  const SUB_WINDOWS: HudContext = { os: 'windows', frame: 'sub' };

  it('relays the pin to the top frame and has nothing left to close', () => {
    expect(run([toggle, altUp(), altDown(), withAlt('KeyK')], SUB_WINDOWS).effects).toEqual([
      'relay:pin',
      'startTimer',
      'clearTimer',
    ]);
  });

  it('relays the pin of a Peek, and consumes the Windows ⌥ keyup itself', () => {
    const result = run([...PEEK, withAlt('KeyS'), altUp()], SUB_WINDOWS);
    expect(result.effects).toEqual(['startTimer', 'relay:show', 'relay:pin']);
    expect(result.consumed).toBe(true);
  });

  it('pins in the top frame on a sub-frame’s pin, which arrives as a toggle', () => {
    expect(run([{ kind: 'remote-show' }, toggle]).effects).toEqual(['fetchModel', 'show', 'pin']);
  });
});
