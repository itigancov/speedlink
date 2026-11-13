// One keycap for every surface (product spec §12.2). Key-state colours live here and reference theme tokens;
// the states are visual, not domain states (design inventory §3.3).
import { cva } from 'class-variance-authority';
import { cn } from 'cn';
import { LockIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { KeyLabel } from '@/domain/keys';
import { PLATFORM, type Platform, triggerWord } from '@/platform/platform-labels';

export type KeyCapSize = 'lg' | 'xl' | 'md' | 'sm';
export type KeyCapState = 'free' | 'assigned' | 'selected' | 'drop-target' | 'reserved' | 'taken' | 'picked';

const keyCapVariants = cva(
  'relative inline-flex shrink-0 select-none rounded-key border shadow-edge outline-none outline-offset-2 transition focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed',
  {
    variants: {
      size: {
        lg: 'size-14 items-start justify-start p-2 font-semibold text-ui',
        xl: 'size-11 items-center justify-center font-bold text-xl',
        md: 'size-10 items-center justify-center font-semibold text-sm',
        sm: 'size-7 items-center justify-center rounded-md font-semibold text-2xs',
      },
      state: {
        free: 'border-input bg-card text-muted-foreground shadow-border hover:border-primary/40',
        assigned: 'border-primary/20 bg-primary/7 text-foreground shadow-primary/20 hover:border-primary/40',
        selected: 'border-primary bg-primary text-primary-foreground shadow-link ring-4 ring-primary/18',
        'drop-target': 'border-2 border-warning-drag border-dashed bg-warning text-warning-foreground shadow-none',
        reserved: 'border-border bg-secondary/70 text-muted-foreground shadow-none',
        taken: 'border-secondary bg-secondary text-muted-foreground shadow-none',
        picked: 'border-primary bg-primary text-primary-foreground shadow-link',
      },
    },
    defaultVariants: { size: 'lg', state: 'free' },
  },
);

const chipVariants = cva(
  'absolute right-1.5 bottom-1.5 inline-flex h-5 w-6 items-center justify-center rounded-sm font-bold text-3xs',
  {
    variants: {
      selected: { true: 'bg-primary-foreground/20 text-primary-foreground', false: 'bg-card text-link' },
    },
  },
);

const LOCK_POSITION: Record<KeyCapSize, string> = {
  lg: 'right-2 bottom-2 size-3.5',
  xl: 'right-1 bottom-1 size-3',
  md: 'right-1 bottom-1 size-2.5',
  sm: 'right-0.5 bottom-0.5 size-2',
};

export interface KeyCapProps extends Omit<ComponentProps<'button'>, 'children'> {
  label: KeyLabel;
  size?: KeyCapSize;
  state?: KeyCapState;
  /** The key's link is open in a tab right now. Combines with assigned and selected. */
  open?: boolean;
  /** The shortcut's monogram, shown as a chip at the sizes that have room for it. */
  monogram?: string;
  /** The shortcut's name, for the accessible name. A `free` key is announced as free whatever it is given. */
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
  monogram,
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
  const showChip = size === 'lg' && monogram !== undefined && (state === 'assigned' || selected);
  const classes = cn(keyCapVariants({ size, state }), dimmed && 'opacity-40', className);
  const face = (
    <>
      <span aria-hidden="true">{label}</span>
      {state === 'reserved' && <LockIcon aria-hidden="true" className={cn('absolute', LOCK_POSITION[size])} />}
      {state === 'drop-target' && size === 'lg' && (
        <span aria-hidden="true" className="absolute right-2 bottom-1.5 text-sm">
          ↔
        </span>
      )}
      {showChip && (
        <span aria-hidden="true" className={chipVariants({ selected })}>
          {monogram}
        </span>
      )}
      {open && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute rounded-full',
            size === 'sm' ? 'top-0.5 right-0.5 size-1' : 'top-1.5 right-1.5 size-1.5',
            selected ? 'bg-primary-foreground' : 'bg-success',
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
