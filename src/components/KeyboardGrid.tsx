// The staggered four-row keyboard (product spec §12.2). It owns only layout: the rows, their stagger, the gap and
// the decorative modifier row. State, selection, clicks and drag belong to the screen, through `renderKey`.
import { cva } from 'class-variance-authority';
import { cn } from 'cn';
import { Fragment, type ReactNode } from 'react';
import { KEYBOARD_ROWS, type KeyLabel } from '@/domain/keys';
import { modifierRow, PLATFORM, type Platform } from '@/platform/platform-labels';

export type KeyboardGridSize = 'lg' | 'sm';

export interface KeyboardGridProps {
  size: KeyboardGridSize;
  /** Renders one key, S included; usually a `KeyCap` of the matching size. */
  renderKey: (label: KeyLabel) => ReactNode;
  /** Forces the modifier row's platform; defaults to the running platform. */
  platform?: Platform;
  className?: string;
}

/** Row offsets from the canvas: lg 0/22/36/58 px, sm 0/10/16/26 px. */
const STAGGER: Record<KeyboardGridSize, readonly string[]> = {
  lg: ['pl-0', 'pl-5.5', 'pl-9', 'pl-14.5'],
  sm: ['pl-0', 'pl-2.5', 'pl-4', 'pl-6.5'],
};

const GAP: Record<KeyboardGridSize, string> = { lg: 'gap-2', sm: 'gap-1' };

const modifierVariants = cva(
  'inline-flex shrink-0 items-center justify-center border border-border bg-muted font-medium text-muted-foreground',
  {
    variants: {
      size: {
        lg: 'h-10 min-w-14 rounded-key px-2 text-2xs',
        sm: 'h-5 min-w-7 rounded-sm px-1 text-3xs',
      },
      highlighted: { true: 'border-primary/30 bg-accent text-accent-foreground', false: '' },
      wide: { true: '', false: '' },
    },
    compoundVariants: [
      { size: 'lg', wide: true, className: 'w-65' },
      { size: 'sm', wide: true, className: 'w-24' },
    ],
  },
);

export function KeyboardGrid({ size, renderKey, platform = PLATFORM, className }: KeyboardGridProps) {
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
      <div aria-hidden="true" data-slot="keyboard-modifiers" className={cn('flex', GAP[size])}>
        {modifierRow(platform).map(({ label, highlighted, wide }, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed row whose labels repeat (⌘, Alt, Ctrl)
            key={index}
            data-highlighted={highlighted}
            className={modifierVariants({ size, highlighted, wide })}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
