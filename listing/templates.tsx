// The pages the listing script draws to take pictures of: the extension icons, the promo tile, the popup shot's
// composite, the demo loop's frames and the social card. They are written into an extension page (so the bundled
// stylesheet and font resolve), which means no scripts: the extension pages' CSP allows none. The mark and the keycaps are the product's own components. The
// tokens-only rule is for the extension's UI: these one-off layouts for images use plain CSS values.
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandMark } from '@/components/Brand';
import { KeyCap } from '@/components/KeyCap';
import { Monogram } from '@/components/Monogram';
import type { KeyLabel } from '@/domain/keys';
import { parseShortcut } from '@/domain/shortcut';

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

/** A tab in the demo frame's strip: its title, and the site's name for the monogram. */
export interface DemoTab {
  title: string;
  link: string;
  active: boolean;
}

/** One still of the demo loop. */
export interface DemoFrame {
  tabs: DemoTab[];
  /** The active page, as a PNG at `DEMO_PAGE`'s size. */
  pagePng: string;
  /** The keys held down, shown in the corner; none hides the indicator. */
  keys: KeyLabel[];
}

/** The demo frame's two bars, above the page. */
const DEMO_BARS = 92;
/** The size the page is captured at to fill the frame below its bars. */
export const DEMO_PAGE = { width: 1280, height: 800 - DEMO_BARS };

const monogramOf = (title: string, link: string) => {
  const shortcut = parseShortcut({ link, name: title, openMode: 'smart', tabMatch: 'site', closeCurrent: false });
  if (shortcut === null) throw new Error(`no monogram for ${link}`);
  return renderToStaticMarkup(<Monogram shortcut={shortcut} size="sm" />);
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);

/**
 * A still of the demo: a neutral browser frame (a strip of tabs with the active one marked, a plain address bar),
 * the page below it, and the held keys in the bottom left corner (the landing page's hero runs off the right edge).
 * Deliberately not Chrome's look: it is a demo, and says so.
 */
export function demoFramePage(stylesheets: string[], { tabs, pagePng, keys }: DemoFrame): string {
  const active = tabs.find(({ active }) => active);
  const url = active === undefined ? new URL('about:blank') : new URL(active.link);
  const chord = keys
    .map((key, i) => {
      const cap = renderToStaticMarkup(
        <KeyCap decorative size="xl" state="selected" label={key} className={i === 0 ? 'trigger' : undefined} />,
      );
      return i === 0 ? cap : `<span class="plus">+</span>${cap}`;
    })
    .join('');
  return page(
    `
      body { width: 1280px; height: 800px; position: relative; overflow: hidden; background: var(--card) !important;
        color: var(--foreground); }
      .strip { display: flex; align-items: center; gap: 6px; height: 48px; padding: 0 12px; background: var(--background); }
      .tab { display: flex; align-items: center; gap: 8px; width: 208px; height: 34px; padding: 0 10px; border-radius: 10px;
        border: 1px solid transparent; font-size: 13px; font-weight: 600; color: var(--muted-foreground); box-sizing: border-box; }
      .tab span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .tab.on { background: var(--card); border-color: var(--primary); color: var(--foreground);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent); }
      .bar { display: flex; align-items: center; height: 44px; padding: 0 12px; border-bottom: 1px solid var(--border);
        box-sizing: border-box; }
      .address { display: flex; align-items: center; width: 100%; height: 30px; padding: 0 14px; border-radius: 15px;
        background: var(--background); font-size: 13px; color: var(--muted-foreground); }
      .address b { font-weight: 500; color: var(--foreground); }
      .page { display: block; width: ${DEMO_PAGE.width}px; height: ${DEMO_PAGE.height}px; }
      .keys { position: absolute; left: 32px; bottom: 32px; display: flex; align-items: center; gap: 10px; padding: 12px;
        border-radius: 18px; background: var(--card); border: 1px solid var(--border);
        box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.28); font-size: 20px; font-weight: 700; color: var(--muted-foreground); }
      .keys [data-slot=key-cap] { height: 44px; }
      .keys .trigger { width: 72px; font-size: 18px; }
    `,
    stylesheets,
    `<div class="strip">${tabs
      .map(
        ({ title, link, active }) =>
          `<div class="tab${active ? ' on' : ''}">${monogramOf(title, link)}<span>${escapeHtml(title)}</span></div>`,
      )
      .join('')}</div>
     <div class="bar"><div class="address"><b>${escapeHtml(url.host)}</b>${escapeHtml(url.pathname === '/' ? '' : url.pathname)}</div></div>
     <img class="page" alt="" src="data:image/png;base64,${pagePng}" />
     ${keys.length === 0 ? '' : `<div class="keys">${chord}</div>`}`,
  );
}

/** The 1200×630 social card: the mark and the name, the summary, and the page under Peek, cropped at the right. */
export function socialCardPage(stylesheets: string[], headline: string, summary: string, peekPng: string): string {
  return page(
    `
      body { width: 1200px; height: 630px; position: relative; overflow: hidden; background: var(--background) !important;
        color: var(--foreground); }
      .text { position: absolute; left: 64px; top: 0; bottom: 0; width: 460px; display: flex; flex-direction: column;
        justify-content: center; gap: 24px; }
      .brand { display: flex; align-items: center; gap: 12px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
      .brand [data-slot=brand-mark] { width: 40px; height: 40px; border-radius: 10px; }
      .brand [data-slot=brand-mark] svg { width: 20px; height: 20px; }
      h1 { margin: 0; font-size: 56px; line-height: 60px; font-weight: 700; letter-spacing: -0.035em; text-wrap: balance; }
      p { margin: 0; font-size: 22px; line-height: 32px; color: var(--muted-foreground); font-weight: 500; }
      .shot { position: absolute; left: 560px; top: 104px; width: 680px; height: 560px; overflow: hidden;
        border-radius: 18px 0 0 0; border: 1px solid var(--border); box-shadow: 0 32px 64px -24px rgb(0 0 0 / 0.28); }
      .shot img { position: absolute; left: -160px; top: 0; width: 960px; max-width: none; height: 531px; }
    `,
    stylesheets,
    `<div class="text">
       <div class="brand">${renderToStaticMarkup(<BrandMark />)}SpeedLink</div>
       <h1>${escapeHtml(headline)}</h1>
       <p>${escapeHtml(summary)}</p>
     </div>
     <div class="shot"><img alt="" src="data:image/png;base64,${peekPng}" /></div>`,
  );
}
