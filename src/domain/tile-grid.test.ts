import { describe, expect, it } from 'vitest';
import { highlightIn, moveHighlight } from './tile-grid';

// The overlay's visible tiles, 4 to a row: with 10 tiles, rows 0–3, 4–7 and a short last row 8–9.
describe('moveHighlight', () => {
  it('moves by one tile left and right, across the end of a row', () => {
    expect(moveHighlight(5, 10, 'right')).toBe(6);
    expect(moveHighlight(5, 10, 'left')).toBe(4);
    expect(moveHighlight(3, 10, 'right')).toBe(4);
    expect(moveHighlight(4, 10, 'left')).toBe(3);
  });

  it('moves by a row up and down', () => {
    expect(moveHighlight(1, 10, 'down')).toBe(5);
    expect(moveHighlight(5, 10, 'up')).toBe(1);
    expect(moveHighlight(5, 10, 'down')).toBe(9);
  });

  it('stops at the edges', () => {
    expect(moveHighlight(0, 10, 'left')).toBe(0);
    expect(moveHighlight(9, 10, 'right')).toBe(9);
    expect(moveHighlight(2, 10, 'up')).toBe(2);
    expect(moveHighlight(8, 10, 'down')).toBe(8);
  });

  it('lands on the last tile going down onto a short last row', () => {
    expect(moveHighlight(6, 10, 'down')).toBe(9);
    expect(moveHighlight(7, 10, 'down')).toBe(9);
  });

  it('keeps a single tile highlighted', () => {
    for (const direction of ['left', 'right', 'up', 'down'] as const) expect(moveHighlight(0, 1, direction)).toBe(0);
  });
});

describe('highlightIn', () => {
  it('keeps the highlight on a tile that is still there', () => {
    expect(highlightIn(2, 5)).toBe(2);
  });

  it('falls back to the last tile when the tiles shrink under it', () => {
    expect(highlightIn(6, 3)).toBe(2);
  });

  it('highlights nothing with no tiles', () => {
    expect(highlightIn(0, 0)).toBeNull();
  });
});
