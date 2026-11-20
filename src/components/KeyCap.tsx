// One keycap for every surface (product spec §12.2). Key-state colours live here and reference theme tokens;
// the states are visual, not domain states (design inventory §3.3).
import { cva } from 'class-variance-authority';
import { LockIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Monogram, type MonogramSize } from '@/components/Monogram';
import type { KeyLabel } from '@/domain/keys';
import type { Shortcut } from '@/domain/shortcut';
import { cn } from '@/lib/cn';
import { PLATFORM, type Platform, triggerWord } from '@/platform/platform-labels';

export type KeyCapSize = 'lg' | 'compact' | 'xl' | 'md' | 'sm';
export type KeyCapState =
  | 'free'
  | 'assigned'
  | 'selected'
  | 'drop-target'
  | 'reserved'
  | 'taken'
  | 'picked'
  | 'start'
  | 'plain';

const keyCapVariants = cva(
  'relative inline-flex shrink-0 select-none rounded-key border shadow-edge outline-none outline-offset-2 transition focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed',
  {
    variants: {
      size: {
        lg: 'h-16 w-19 flex-col items-stretch justify-between px-2 py-1.5 font-semibold text-ui',
        compact: 'h-13 w-14 flex-col items-stretch justify-start rounded-lg p-1.5 font-semibold text-ui',
        xl: 'size-11 items-center justify-center font-bold text-xl',
        md: 'size-10 items-center justify-center font-semibold text-sm',
        sm: 'h-6.5 w-7 items-center justify-center rounded-md font-semibold text-2xs',
      },
      state: {
        free: 'border-input bg-card text-muted-foreground shadow-border hover:border-primary/40',
        assigned: 'border-primary/20 bg-primary/7 text-foreground shadow-primary/20 hover:border-primary/40',
        selected: 'border-primary bg-primary text-primary-foreground shadow-edge-primary ring-4 ring-primary/18',
        'drop-target': 'border-2 border-warning-drag border-dashed bg-warning text-warning-foreground shadow-none',
        reserved: 'border-border bg-secondary/70 text-muted-foreground shadow-none',
        taken: 'border-secondary bg-secondary text-muted-foreground shadow-none',
        picked: 'border-primary bg-primary text-primary-foreground shadow-edge-primary',
        start: 'border-2 border-primary border-dashed bg-primary/4 text-link shadow-none hover:bg-primary/7',
        plain: 'border-input bg-card text-foreground shadow-input',
      },
    },
    defaultVariants: { size: 'lg', state: 'free' },
  },
);

/** The sizes with a face: the label beside the shortcut's tile, and the open dot on the outer corner. */
const FACE_TILE: Partial<Record<KeyCapSize, MonogramSize>> = { lg: 'xs', compact: '2xs' };

const LOCK_POSITION: Record<KeyCapSize, string> = {
  lg: 'right-2 bottom-2 size-3.5',
  compact: 'right-1.5 bottom-1.5 size-3',
  xl: 'right-1 bottom-1 size-3',
  md: 'right-1 bottom-1 size-2.5',
  sm: 'right-0.5 bottom-0.5 size-2',
};

const DROP_POSITION: Partial<Record<KeyCapSize, string>> = {
  lg: 'right-2 bottom-1.5 text-sm',
  compact: 'right-1.5 bottom-1 text-xs',
};

/** Large and compact keys carry the open dot on their outer corner, ringed; the others inside it. */
const OUTER_DOT = '-top-1 -right-1 size-2.5 ring-2 ring-card';
const OPEN_POSITION: Record<KeyCapSize, string> = {
  lg: OUTER_DOT,
  compact: OUTER_DOT,
  xl: 'top-1.5 right-1.5 size-1.5',
  md: 'top-1.5 right-1.5 size-1.5',
  sm: 'top-0.5 right-0.5 size-1',
};

export interface KeyCapProps extends Omit<ComponentProps<'button'>, 'children'> {
  label: KeyLabel;
  size?: KeyCapSize;
  state?: KeyCapState;
  /** The key's link is open in a tab right now. Combines with assigned and selected; the plain look has no dot. */
  open?: boolean;
  /** The key's shortcut, drawn as its coloured tile at the sizes that have a face (lg, compact). */
  shortcut?: Shortcut;
  /** The shortcut's name: the accessible name, and the bottom line of a large key. A `free` key is announced as free. */
  name?: string;
  /** Faded, e.g. outside a search's matches. Visual only: the key keeps its state, name and click. */
  dimmed?: boolean;
  /** Forces the trigger word in the accessible name; defaults to the running platform. */
  platform?: Platform;
  /**
   * Drawn inside another control (an overlay tile): a span hidden from assistive tech, which that control names.
   * Button props are then ignored.
   */
  decorative?: boolean;
}

function accessibleName(
  label: KeyLabel,
  state: KeyCapState,
  open: boolean,
  name: string | undefined,
  platform: Platform,
) {
  const trigger = triggerWord(platform);
  const base =
    state === 'reserved'
      ? i18n.t('keyCap.reserved', [trigger, label])
      : state === 'free' || name === undefined
        ? i18n.t('keyCap.free', [trigger, label])
        : i18n.t('keyCap.assigned', [trigger, label, name]);
  return open ? i18n.t('keyCap.open', [base]) : base;
}

export function KeyCap({
  label,
  size = 'lg',
  state = 'free',
  open = false,
  shortcut,
  name,
  dimmed = false,
  platform = PLATFORM,
  decorative = false,
  className,
  type = 'button',
  disabled,
  ...props
}: KeyCapProps) {
  const selected = state === 'selected';
  const holdsShortcut = state === 'assigned' || selected;
  const tileSize = FACE_TILE[size];
  const showOpen = open && state !== 'plain';
  const classes = cn(keyCapVariants({ size, state }), dimmed && 'opacity-40', className);
  const labelSpan = (
    <span aria-hidden="true" data-slot="key-label">
      {label}
    </span>
  );
  const face = (
    <>
      {tileSize === undefined ? (
        labelSpan
      ) : (
        <span className="flex items-start justify-between gap-1">
          {labelSpan}
          {holdsShortcut && shortcut !== undefined && (
            <Monogram shortcut={shortcut} size={tileSize} ringed={selected} />
          )}
        </span>
      )}
      {size === 'lg' && holdsShortcut && name !== undefined && (
        <span
          aria-hidden="true"
          data-slot="key-name"
          className={cn(
            'truncate text-left font-medium text-2xs',
            selected ? 'text-primary-foreground' : 'text-foreground-subtle',
          )}
        >
          {name}
        </span>
      )}
      {state === 'reserved' && <LockIcon aria-hidden="true" className={cn('absolute', LOCK_POSITION[size])} />}
      {state === 'drop-target' && DROP_POSITION[size] !== undefined && (
        <span aria-hidden="true" className={cn('absolute', DROP_POSITION[size])}>
          ↔
        </span>
      )}
      {showOpen && (
        <span
          aria-hidden="true"
          data-slot="key-open"
          className={cn(
            'absolute rounded-full',
            OPEN_POSITION[size],
            selected && tileSize === undefined ? 'bg-primary-foreground' : 'bg-success',
          )}
        />
      )}
    </>
  );
  if (decorative) {
    return (
      <span data-slot="key-cap" data-state={state} aria-hidden="true" className={classes}>
        {face}
      </span>
    );
  }
  return (
    <button
      type={type}
      data-slot="key-cap"
      data-state={state}
      data-dimmed={dimmed || undefined}
      aria-label={accessibleName(label, state, open, name, platform)}
      aria-pressed={selected ? true : undefined}
      disabled={state === 'reserved' || disabled}
      className={classes}
      {...props}
    >
      {face}
    </button>
  );
}
