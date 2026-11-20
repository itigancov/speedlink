// A square tile with the shortcut's one-letter monogram, white on the colour of its site (product spec §12.2).
// Decoration only: whatever draws it names the shortcut.
import { cva } from 'class-variance-authority';
import { cn } from 'cn';
import { monogram, type Shortcut, type TileHue, tileHue } from '@/domain/shortcut';

const HUE_CLASS: Record<TileHue, string> = {
  red: 'bg-tile-red',
  amber: 'bg-tile-amber',
  blue: 'bg-tile-blue',
  teal: 'bg-tile-teal',
  slate: 'bg-tile-slate',
  purple: 'bg-tile-purple',
  indigo: 'bg-tile-indigo',
  green: 'bg-tile-green',
};

const monogramVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center font-bold text-inverse-foreground',
  {
    variants: {
      size: {
        /** 16 px: a compact key. */
        '2xs': 'size-4 rounded-sm text-3xs',
        /** 20 px: a large key. */
        xs: 'size-5 rounded-sm text-2xs',
        sm: 'size-6 rounded-sm text-xs',
        default: 'size-8 rounded-lg text-ui',
        /** 36 px: the popup's page card. */
        md: 'size-9 rounded-lg text-ui',
        lg: 'size-10 rounded-lg text-md',
      },
      ringed: { true: 'ring-1 ring-primary-foreground', false: '' },
    },
    defaultVariants: { size: 'lg', ringed: false },
  },
);

export type MonogramSize = '2xs' | 'xs' | 'sm' | 'default' | 'md' | 'lg';

export interface MonogramProps {
  shortcut: Shortcut;
  size?: MonogramSize;
  /** A 1 px white ring, for a tile on a selected (blue) key. */
  ringed?: boolean;
  className?: string;
}

export function Monogram({ shortcut, size = 'lg', ringed = false, className }: MonogramProps) {
  const hue = tileHue(shortcut.link);
  return (
    <span
      aria-hidden="true"
      data-slot="monogram"
      data-hue={hue}
      data-ringed={ringed || undefined}
      className={cn(monogramVariants({ size, ringed }), HUE_CLASS[hue], className)}
    >
      {monogram(shortcut)}
    </span>
  );
}
