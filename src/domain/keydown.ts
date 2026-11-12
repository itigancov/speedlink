// What a keydown on a page means (product spec §4.2, §4.3). Decided synchronously, from plain event data.
import { isAssignable, type Key, keyLabelFromCode } from './keys';

/** The OS the browser runs on: it picks the browser's own Alt keys that a free key leaves alone. */
export type BrowserOs = 'mac' | 'windows' | 'linux' | 'chromeos';

/** The parts of a keydown the decision reads. `editable` is resolved by the caller from the real target. */
export interface KeydownInput {
  /** `event.code`: the physical key, whatever the layout. */
  code: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** `getModifierState('AltGraph')`. */
  altGraph: boolean;
  repeat: boolean;
  /** `isComposing`, or `keyCode === 229`. */
  composing: boolean;
  /** The press lands in a text-like field, a rich editor or a `designMode` document. */
  editable: boolean;
}

/**
 * - `ignore`: not ours; the event is left alone.
 * - `pass`: a trigger on a free key that the browser keeps for itself; left alone.
 * - `suppress`: swallowed, nothing sent (the repeats of a held key).
 * - `reserved`: ⌥S, swallowed, nothing sent until the pinned overlay (item 17).
 * - `open`: swallowed, and the background is asked to open the key; it replies `free` for a free key.
 */
export type KeydownDecision =
  | { kind: 'ignore' }
  | { kind: 'pass' }
  | { kind: 'suppress' }
  | { kind: 'reserved' }
  | { kind: 'open'; key: Key; force: boolean };

const DIGITS_1_TO_9: readonly Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Free keys whose ⌥ + key the browser uses itself (Alt+D address bar, Alt+E / F menu, Alt+1–9 tabs). */
const BROWSER_KEYS: Record<BrowserOs, ReadonlySet<Key>> = {
  mac: new Set(),
  windows: new Set(['D', 'E', 'F']),
  linux: new Set(['D', 'E', 'F', ...DIGITS_1_TO_9]),
  chromeos: new Set(['E', 'F', ...DIGITS_1_TO_9]),
};

const IGNORE: KeydownDecision = { kind: 'ignore' };
const PASS: KeydownDecision = { kind: 'pass' };
const SUPPRESS: KeydownDecision = { kind: 'suppress' };
const RESERVED: KeydownDecision = { kind: 'reserved' };

/**
 * `isAssigned` answers from the content script's cache, which may be stale: it only decides between swallowing
 * and passing through. The background decides what the press opens from the fresh keymap.
 */
export function classifyKeydown(
  input: KeydownInput,
  os: BrowserOs,
  isAssigned: (key: Key) => boolean,
): KeydownDecision {
  const trigger = input.altKey && !input.ctrlKey && !input.metaKey && !input.altGraph;
  if (!trigger || input.editable || input.composing) return IGNORE;
  const label = keyLabelFromCode(input.code);
  if (label === null) return IGNORE;
  if (input.repeat) return SUPPRESS;
  if (!isAssignable(label)) return RESERVED;

  if (isAssigned(label)) return { kind: 'open', key: label, force: input.shiftKey };
  if (input.shiftKey || BROWSER_KEYS[os].has(label)) return PASS;
  return { kind: 'open', key: label, force: false };
}
