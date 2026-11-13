// The on-page toast pill (product spec §6, design inventory §1.4): key chip, message, an optional right-aligned
// action, and an optional ×. Presentational only; `ToastRegion` decides what shows and for how long. It lives in the HUD's
// shadow root, so it is custom (no Sonner) and never takes focus.
import { cva } from 'class-variance-authority';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import type { ComponentProps, MouseEvent } from 'react';

export type PageToastTone = 'free' | 'saved' | 'switched' | 'error';

const chipVariants = cva('shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-2xs', {
  variants: {
    tone: {
      free: 'bg-inverse-foreground/15 text-inverse-foreground',
      saved: 'bg-primary text-primary-foreground',
      error: 'bg-inverse-foreground/15 text-inverse-foreground',
      switched: 'bg-success text-inverse-foreground',
    },
  },
});

/** Keeps a pointer press from moving focus onto the toast's buttons; the click still happens. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

export interface PageToastProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** "⌥K" or "Alt+K", from the platform-labels helper. */
  chip: string;
  tone: PageToastTone;
  message: string;
  /** Shows the action when given, with `onAction`. */
  actionLabel?: string;
  onAction?: () => void;
  /** Shows the × when given. */
  onClose?: () => void;
  closeLabel?: string;
}

export function PageToast({
  chip,
  tone,
  message,
  actionLabel,
  onAction,
  onClose,
  closeLabel,
  className,
  ...props
}: PageToastProps) {
  return (
    <div
      data-testid="page-toast"
      data-tone={tone}
      className={cn(
        'pointer-events-auto flex max-w-lg items-center gap-3 rounded-key bg-inverse px-3 py-2.5 font-sans text-ui shadow-lg',
        className,
      )}
      {...props}
    >
      <span className={chipVariants({ tone })}>{chip}</span>
      {/* Colour sits here, not on the pill: `cn` reads `text-ui` as a colour and would drop a sibling text colour. */}
      <span className="min-w-0 flex-1 truncate text-inverse-foreground">{message}</span>
      {onAction !== undefined && (
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onAction}
          className="shrink-0 cursor-pointer rounded-sm font-semibold text-inverse-link outline-none hover:underline focus-visible:outline-2 focus-visible:outline-inverse-link"
        >
          {actionLabel}
        </button>
      )}
      {onClose !== undefined && (
        <button
          type="button"
          onMouseDown={keepFocus}
          aria-label={closeLabel}
          onClick={onClose}
          className="-my-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-inverse-foreground/70 outline-none hover:text-inverse-foreground focus-visible:outline-2 focus-visible:outline-inverse-link"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
