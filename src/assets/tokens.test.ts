import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TILE_HUES } from '@/domain/shortcut';

const TOKENS = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function tileHex(hue: string): string | undefined {
  return TOKENS.match(new RegExp(`--tile-${hue}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))?.[1];
}

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const channel = (at: number) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe('tile tokens', () => {
  it.each(TILE_HUES)('defines --tile-%s', (hue) => {
    expect(tileHex(hue)).toBeDefined();
  });

  it.each(TILE_HUES)('keeps a white letter readable on --tile-%s (at least 4.5:1)', (hue) => {
    expect(contrastOnWhite(tileHex(hue) ?? '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('exposes every tile hue to Tailwind', () => {
    for (const hue of TILE_HUES) expect(TOKENS).toContain(`--color-tile-${hue}: var(--tile-${hue});`);
  });

  it('measures contrast the WCAG way', () => {
    expect(contrastOnWhite('#000000')).toBeCloseTo(21, 5);
    expect(contrastOnWhite('#767676')).toBeCloseTo(4.54, 2);
  });
});
