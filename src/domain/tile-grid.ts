// The overlay's highlight (product spec §5.2): a position over the visible tiles, laid out 4 to a row.
import type { GridDirection } from './key-grid';

/** The overlay's tile columns. */
export const TILE_COLUMNS = 4;

/** ←→ step one tile, across row ends; ↑↓ step one row. Clamped to the tiles; down onto a short row lands on the last. */
export function moveHighlight(index: number, count: number, direction: GridDirection): number {
  const last = count - 1;
  switch (direction) {
    case 'left':
      return Math.max(index - 1, 0);
    case 'right':
      return Math.min(index + 1, last);
    case 'up':
      return index >= TILE_COLUMNS ? index - TILE_COLUMNS : index;
    case 'down':
      return Math.floor(index / TILE_COLUMNS) < Math.floor(last / TILE_COLUMNS)
        ? Math.min(index + TILE_COLUMNS, last)
        : index;
  }
}

/** The highlighted tile among `count`: `index`, or the last tile once fewer remain; none with no tiles. */
export function highlightIn(index: number, count: number): number | null {
  return count === 0 ? null : Math.min(index, count - 1);
}
