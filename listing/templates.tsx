// The pages the listing script draws to take pictures of: the extension icons, the promo tile and the popup shot's
// composite. They are written into an extension page (so the bundled stylesheet and font resolve), which means no
// scripts: the extension pages' CSP allows none. The mark and the keycaps are the product's own components. The
// tokens-only rule is for the extension's UI: these one-off layouts for images use plain CSS values.
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandMark } from '@/components/Brand';
import { KeyCap } from '@/components/KeyCap';
import type { KeyLabel } from '@/domain/keys';

const page = (styles: string, stylesheets: string[], body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    ${stylesheets.map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n    ')}
    <style>
      html, body { margin: 0; background: transparent !important; }
      ${styles}
    </style>
  </head>
  <body>${body}</body>
</html>`;

/**
 * An icon: the logo mark on a square of its own size. The mark is a rounded square with the Zap; here its corner
 * and glyph scale with it, the glyph a little larger than in the header so that it still reads at 16 px.
 * `padding` is the transparent border the Store asks of the 128 px icon.
 */
export function iconPage(stylesheets: string[], size: number, padding: number): string {
  const art = size - 2 * padding;
  return page(
    `
      body { width: ${size}px; height: ${size}px; padding: ${padding}px; box-sizing: border-box; }
      [data-slot=brand-mark] { width: ${art}px; height: ${art}px; border-radius: ${art * 0.25}px; }
      [data-slot=brand-mark] svg { width: 60%; height: 60%; }
    `,
    stylesheets,
    renderToStaticMarkup(<BrandMark />),
  );
}

/** The 440×280 promo tile: the mark and the name, a tagline, and the chord. */
export function promoTilePage(stylesheets: string[], tagline: string, key: KeyLabel): string {
  return page(
    `
      body { width: 440px; height: 280px; overflow: hidden; background: var(--background) !important; color: var(--foreground);
        display: flex; flex-direction: column; justify-content: center; gap: 28px; padding: 0 40px; box-sizing: border-box; }
      .brand { display: flex; align-items: center; gap: 14px; font-size: 32px; font-weight: 800; letter-spacing: -0.02em; }
      .brand [data-slot=brand-mark] { width: 48px; height: 48px; border-radius: 12px; }
      .brand [data-slot=brand-mark] svg { width: 24px; height: 24px; }
      .tagline { margin: 0; font-size: 20px; line-height: 28px; color: var(--muted-foreground); font-weight: 500; }
      .chord { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 700; color: var(--muted-foreground); }
      .chord [data-slot=key-cap] { height: 44px; }
      .chord .trigger { width: 72px; font-size: 18px; }
    `,
    stylesheets,
    `<div class="brand">${renderToStaticMarkup(<BrandMark />)}SpeedLink</div>
     <p class="tagline">${tagline}</p>
     <div class="chord">
       ${renderToStaticMarkup(<KeyCap decorative size="xl" state="free" label={'Alt' as KeyLabel} className="trigger" />)}
       +
       ${renderToStaticMarkup(<KeyCap decorative size="xl" state="selected" label={key} />)}
     </div>`,
  );
}

/** The popup shot: the page full frame, with the popup dropped over its top right corner. */
export function popupCompositePage(backdropPng: string, popupPng: string): string {
  return page(
    `
      body { width: 1280px; height: 800px; position: relative; overflow: hidden; background: #fff !important; }
      .backdrop { position: absolute; inset: 0; }
      .popup { position: absolute; top: 12px; right: 32px; border-radius: 12px;
        box-shadow: 0 12px 32px rgb(0 0 0 / 0.28), 0 0 0 1px rgb(0 0 0 / 0.08); }
    `,
    [],
    `<img class="backdrop" alt="" src="data:image/png;base64,${backdropPng}" />
     <img class="popup" alt="" src="data:image/png;base64,${popupPng}" />`,
  );
}
