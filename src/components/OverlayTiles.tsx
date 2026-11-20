// The overlay's tile grid and its empty state (product spec §5.4), shared by the HUD's overlay and the popup's launcher
// (§7). Both live where a press must not move focus, so the pieces keep it where it was.

import type { Key } from '@/domain/keys';
import type { OverlayTile as TileData } from '@/domain/overlay-model';
import { cn } from '@/lib/cn';
import { PLATFORM, type Platform } from '@/platform/platform-labels';
import { keepFocus, OverlayTile } from './OverlayTile';

export interface OverlayTilesProps {
  tiles: readonly TileData[];
  /** The pinned overlay's top result, or where the arrows moved to. */
  highlighted?: TileData;
  /** A tile click; `force` on ⇧. */
  onOpen(key: Key, force: boolean): void;
  /** The tiles' pencil; without it the tiles have none. */
  onEdit?(key: Key): void;
  platform?: Platform;
  /** The columns and the height at which the grid starts to scroll. */
  className?: string;
}

/** One tile per key, scrolling inside its container. */
export function OverlayTiles({
  tiles,
  highlighted,
  onOpen,
  onEdit,
  platform = PLATFORM,
  className,
}: OverlayTilesProps) {
  return (
    <div data-testid="overlay-tiles" className={cn('grid min-h-0 gap-2 overflow-y-auto', className)}>
      {tiles.map((tile) => (
        <OverlayTile
          key={tile.key}
          tile={tile}
          highlighted={tile === highlighted}
          platform={platform}
          onOpen={(force) => onOpen(tile.key, force)}
          onEdit={onEdit === undefined ? undefined : () => onEdit(tile.key)}
        />
      ))}
    </div>
  );
}

/** "No keys yet", and the way to the keymap. */
export function OverlayEmpty({ onOpenKeymap }: { onOpenKeymap(): void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-ui">
      <span className="font-semibold">{i18n.t('overlay.empty')}</span>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={onOpenKeymap}
        className="cursor-pointer rounded-sm font-semibold text-link outline-none hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {i18n.t('overlay.openKeymap')}
      </button>
    </div>
  );
}
