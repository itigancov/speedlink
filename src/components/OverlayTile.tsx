// One overlay tile (product spec §5.4): a plain keycap (md), the name and what pressing the key will do, and the
// shortcut's monogram tile. A click opens the key, ⇧ + click in a new tab; the pencil edits it in Options and takes
// the monogram's place on hover (left out where a tile can't: the popup's launcher). It lives in the HUD's shadow
// root and never takes focus, so the page keeps its own.

import { PencilIcon } from 'lucide-react';
import { type MouseEvent, useEffect, useRef } from 'react';
import type { OverlaySubline, OverlayTile as TileData } from '@/domain/overlay-model';
import { cn } from '@/lib/cn';
import { chordLabel, PLATFORM, type Platform, triggerWord } from '@/platform/platform-labels';
import { KeyCap } from './KeyCap';
import { Monogram } from './Monogram';

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
  /** The pinned overlay's top result, or where the arrows moved to: what ↵ opens. */
  highlighted?: boolean;
  /** `force`: ⇧ was held (Force new tab). */
  onOpen(force: boolean): void;
  /** The pencil's action; without one the tile has no pencil. */
  onEdit?(): void;
  platform?: Platform;
}

export function OverlayTile({
  tile: { key, name, link, subline },
  highlighted = false,
  onOpen,
  onEdit,
  platform = PLATFORM,
}: OverlayTileProps) {
  const open = subline.kind !== 'mode';
  const text = sublineText(subline);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (highlighted) button.current?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted]);
  return (
    <div data-testid="overlay-tile" data-highlighted={highlighted} className="group relative">
      <button
        ref={button}
        type="button"
        onMouseDown={keepFocus}
        onClick={(event) => onOpen(event.shiftKey)}
        aria-label={i18n.t('overlay.tile', [i18n.t('keyCap.assigned', [triggerWord(platform), key, name]), text])}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-left outline-none transition focus-visible:outline-2 focus-visible:outline-ring',
          open ? 'bg-success-tile' : 'bg-muted',
          highlighted
            ? 'border-primary ring-1 ring-primary'
            : cn('hover:border-primary/40', open ? 'border-success-border' : 'border-border-subtle'),
        )}
      >
        <KeyCap decorative label={key} size="md" state="plain" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-ui">{name}</span>
          <span className={cn('truncate text-2xs', open ? 'text-success-foreground' : 'text-muted-foreground')}>
            {text}
          </span>
        </span>
        <Monogram
          shortcut={{ name, link }}
          size="xs"
          className={cn(onEdit !== undefined && 'group-focus-within:invisible group-hover:invisible')}
        />
      </button>
      {onEdit !== undefined && (
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onEdit}
          aria-label={i18n.t('overlay.edit', [chordLabel(key, platform)])}
          className="absolute top-1/2 right-3 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none transition hover:text-foreground focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <PencilIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}
