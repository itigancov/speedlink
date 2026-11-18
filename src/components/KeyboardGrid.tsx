// The staggered four-row keyboard (product spec §12.2). It owns only layout: the rows, their stagger and the gap.
// State, selection, clicks and drag belong to the screen, through `renderKey`.
import { cn } from 'cn';
import { Fragment, type ReactNode } from 'react';
import { KEYBOARD_ROWS, type KeyLabel } from '@/domain/keys';

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
