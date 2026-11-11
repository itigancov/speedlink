/** Every key label on the grid, by physical position (`event.code`), S included. */
export type KeyLabel =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9';

/** The 35 assignable keys: S is reserved for the pinned overlay and never holds a shortcut. */
export type Key = Exclude<KeyLabel, 'S'>;

export type KeyCode = `Key${Exclude<KeyLabel, `${number}`>}` | `Digit${Extract<KeyLabel, `${number}`>}`;

export const KEYBOARD_ROWS: readonly (readonly KeyLabel[])[] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export function isAssignable(label: KeyLabel): label is Key {
  return label !== 'S';
}

export const KEYBOARD_ORDER: readonly Key[] = KEYBOARD_ROWS.flat().filter(isAssignable);

const LABELS: ReadonlySet<string> = new Set(KEYBOARD_ROWS.flat());

/** The label of a physical key, or null for numpad digits and every other code. */
export function keyLabelFromCode(code: string): KeyLabel | null {
  const match = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
  const label = match?.[1] ?? match?.[2];
  return label !== undefined && LABELS.has(label) ? (label as KeyLabel) : null;
}

export function codeOf(label: KeyLabel): KeyCode {
  return (/[0-9]/.test(label) ? `Digit${label}` : `Key${label}`) as KeyCode;
}
