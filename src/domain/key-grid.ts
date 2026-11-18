// Arrow-key movement over the staggered keyboard (product spec §8.7): the keyboard drag jumps key to key.
import { isAssignable, KEYBOARD_ROWS, type Key, type KeyLabel } from './keys';

export type GridDirection = 'left' | 'right' | 'up' | 'down';

/** The arrow keys' directions, by `KeyboardEvent.code` (its `key` names them the same). */
export const ARROWS: Readonly<Record<string, GridDirection>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * Each row's offset in key widths. Mirrors KeyboardGrid's lg stagger of 0/28/46/74 px over a 76 px key: change both
 * together. The compact stagger (0/20/34/54 px over 56 px) gives nearly the same fractions, so it shares these.
 */
export const ROW_STAGGER: readonly number[] = [0, 28 / 76, 46 / 76, 74 / 76];

const centre = (row: number, column: number) => (ROW_STAGGER[row] ?? 0) + column;

function position(key: Key): { row: number; column: number } {
  const row = KEYBOARD_ROWS.findIndex((labels) => labels.includes(key));
  return { row, column: KEYBOARD_ROWS[row]?.indexOf(key) ?? -1 };
}

/**
 * The neighbouring assignable key, or null at an edge. Left and right stay in the row without wrapping, passing
 * over S. Up and down take the adjacent row's assignable key whose centre is nearest, ties going left.
 */
export function neighbourKey(key: Key, direction: GridDirection): Key | null {
  const { row, column } = position(key);
  const labels = KEYBOARD_ROWS[row] ?? [];

  if (direction === 'left' || direction === 'right') {
    const step = direction === 'left' ? -1 : 1;
    for (let at = column + step; at >= 0 && at < labels.length; at += step) {
      const label = labels[at] as KeyLabel;
      if (isAssignable(label)) return label;
    }
    return null;
  }

  const target = row + (direction === 'up' ? -1 : 1);
  const candidates = KEYBOARD_ROWS[target];
  if (candidates === undefined) return null;
  const from = centre(row, column);
  let best: Key | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  candidates.forEach((label, at) => {
    const distance = Math.abs(centre(target, at) - from);
    if (isAssignable(label) && distance < bestDistance) {
      best = label;
      bestDistance = distance;
    }
  });
  return best;
}
