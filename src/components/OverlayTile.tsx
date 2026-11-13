// One overlay tile (product spec §5.4): keycap (md), name and what pressing the key will do. A click opens the key,
// ⇧ + click in a new tab; the pencil on hover edits it in Options. It lives in the HUD's shadow root and never takes
// focus, so the page keeps its own.
import { cn } from 'cn';
import { PencilIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { OverlaySubline, OverlayTile as TileData } from '@/domain/overlay-model';
import { chordLabel, PLATFORM, type Platform, triggerWord } from '@/platform/platform-labels';
import { KeyCap } from './KeyCap';

/** Keeps a pointer press from moving focus onto the overlay; the click still happens. */
export const keepFocus = (event: MouseEvent) => event.preventDefault();

const MODE_TEXT = {
  new: 'overlay.subline.new',
  this: 'overlay.subline.this',
  bg: 'overlay.subline.bg',
} as const;

export function sublineText(subline: OverlaySubline): string {
  switch (subline.kind) {
    case 'tab':
      return i18n.t('overlay.subline.tab', [String(subline.index)]);
    case 'other-window':
      return i18n.t('overlay.subline.otherWindow');
    case 'mode':
      return subline.mode === 'smart' ? subline.site : i18n.t(MODE_TEXT[subline.mode]);
  }
}

export interface OverlayTileProps {
  tile: TileData;
  /** `force`: ⇧ was held (Force new tab). */
  onOpen(force: boolean): void;
  onEdit(): void;
  platform?: Platform;
}

export function OverlayTile({ tile: { key, name, subline }, onOpen, onEdit, platform = PLATFORM }: OverlayTileProps) {
  const open = subline.kind !== 'mode';
  const text = sublineText(subline);
  return (
    <div data-testid="overlay-tile" className="group relative">
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={(event) => onOpen(event.shiftKey)}
        aria-label={i18n.t('overlay.tile', [i18n.t('keyCap.assigned', [triggerWord(platform), key, name]), text])}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 rounded-xl border p-2 pr-8 text-left outline-none transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring',
          open ? 'border-success-border bg-success-tile' : 'border-border bg-card',
        )}
      >
        <KeyCap decorative label={key} size="md" state="assigned" open={open} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-ui">{name}</span>
          <span
            className={cn(
              'truncate text-2xs',
              subline.kind === 'other-window' ? 'text-success-foreground' : 'text-muted-foreground',
            )}
          >
            {text}
          </span>
        </span>
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={onEdit}
        aria-label={i18n.t('overlay.edit', [chordLabel(key, platform)])}
        className="absolute top-1 right-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none transition hover:text-foreground group-hover:opacity-100"
      >
        <PencilIcon aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
