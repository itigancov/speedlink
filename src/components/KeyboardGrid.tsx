// The staggered four-row keyboard (product spec §12.2). It owns only layout: the rows, their stagger and the gap.
// State, selection, clicks and drag belong to the screen, through `renderKey`.

import { Fragment, type ReactNode } from 'react';
import { KEYBOARD_ROWS, type KeyLabel } from '@/domain/keys';
import { cn } from '@/lib/cn';

export type KeyboardGridSize = 'lg' | 'compact' | 'sm';

export interface KeyboardGridProps {
  size: KeyboardGridSize;
  /** Renders one key, S included; usually a `KeyCap` of the matching size. */
  renderKey: (label: KeyLabel) => ReactNode;
  className?: string;
}

/**
 * Row offsets from the canvas: lg 0/28/46/74 px, compact 0/20/34/54 px, sm 0/10/16/26 px. The lg offsets are
 * mirrored by `ROW_STAGGER` in domain/key-grid for arrow-key drag: change both together.
 */
const STAGGER: Record<KeyboardGridSize, readonly string[]> = {
  lg: ['pl-0', 'pl-7', 'pl-11.5', 'pl-18.5'],
  compact: ['pl-0', 'pl-5', 'pl-8.5', 'pl-13.5'],
  sm: ['pl-0', 'pl-2.5', 'pl-4', 'pl-6.5'],
};

const GAP: Record<KeyboardGridSize, string> = { lg: 'gap-2', compact: 'gap-1.5', sm: 'gap-1' };

/**
 * The same sizes in px, for `keyboardWidth`. They must match the key widths of `KeyCap` (lg w-19, compact w-14, sm
 * w-7) and the classes above; e2e/options.spec.ts checks the rendered keys against the threshold built from them.
 */
const KEY_WIDTH_PX: Record<KeyboardGridSize, number> = { lg: 76, compact: 56, sm: 28 };
const GAP_PX: Record<KeyboardGridSize, number> = { lg: 8, compact: 6, sm: 4 };
const STAGGER_PX: Record<KeyboardGridSize, readonly number[]> = {
  lg: [0, 28, 46, 74],
  compact: [0, 20, 34, 54],
  sm: [0, 10, 16, 26],
};

/** The width in px of the keyboard drawn at a size: its widest row, stagger included. */
export function keyboardWidth(size: KeyboardGridSize): number {
  const key = KEY_WIDTH_PX[size];
  const gap = GAP_PX[size];
  return Math.max(
    ...KEYBOARD_ROWS.map((row, index) => (STAGGER_PX[size][index] ?? 0) + row.length * key + (row.length - 1) * gap),
  );
}

export function KeyboardGrid({ size, renderKey, className }: KeyboardGridProps) {
  const stagger = STAGGER[size];
  return (
    <div data-slot="keyboard-grid" className={cn('flex flex-col', GAP[size], className)}>
      {KEYBOARD_ROWS.map((row, index) => (
        <div key={row.join('')} data-slot="keyboard-row" className={cn('flex', GAP[size], stagger[index])}>
          {row.map((label) => (
            <Fragment key={label}>{renderKey(label)}</Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
