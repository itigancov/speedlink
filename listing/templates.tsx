// The pages the listing script draws to take pictures of: the extension icons, the promo tile, the marquee, the
// social card, the template shots (Hero, Smart switch), the browser mock around every capture and the captioned
// shots around the clean frames. They are written into an extension page (so the bundled stylesheet and font
// resolve), which means no scripts: the extension pages' CSP allows none. The mark, the keycaps, the monograms and
// the overlay tiles are the product's own components. The tokens-only rule is for the extension's UI: these one-off
// layouts for images use plain CSS values. Their "⌥ / Alt" labels are listing text for both platforms, not app
// strings, so they don't go through en.yml or the platform-labels helper.
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandMark } from '@/components/Brand';
import { KeyCap } from '@/components/KeyCap';
import { Monogram } from '@/components/Monogram';
import { OverlayTile } from '@/components/OverlayTile';
import type { KeyLabel } from '@/domain/keys';
import type { OverlayTile as TileData } from '@/domain/overlay-model';
import { parseShortcut } from '@/domain/shortcut';

/** The trigger on the templates' keycaps, for macOS and Windows readers at once. */
const TRIGGER = '⌥ / Alt' as KeyLabel;

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

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);

const mark = () => renderToStaticMarkup(<BrandMark />);

/** The mark and the name, `size` px tall. */
const brand = (size: number) => `<div class="brand" style="display: flex; align-items: center; gap: ${size * 0.3}px;
  font-size: ${size * 0.66}px; font-weight: 800; letter-spacing: -0.02em; --mark: ${size}px">${mark()}SpeedLink</div>`;

/** Shared by every page that shows `brand()`: the mark sized from `--mark`. */
const BRAND_STYLES = `
  .brand [data-slot=brand-mark] { width: var(--mark); height: var(--mark); border-radius: calc(var(--mark) / 4); }
  .brand [data-slot=brand-mark] svg { width: 50%; height: 50%; }
`;

/** Keycaps joined by "+"; the first one is the trigger and gets the `trigger` class. */
const chord = (keys: KeyLabel[], state: 'free' | 'selected' | 'plain' = 'selected') =>
  keys
    .map((key, i) => {
      const cap = renderToStaticMarkup(
        <KeyCap decorative size="xl" state={state} label={key} className={i === 0 ? 'trigger' : undefined} />,
      );
      return i === 0 ? cap : `<span class="plus">+</span>${cap}`;
    })
    .join('');

/** The real overlay tiles, as static markup: no handlers fire in a picture. */
const tiles = (data: TileData[], highlighted?: string) =>
  data
    .map((tile) =>
      renderToStaticMarkup(
        <OverlayTile tile={tile} highlighted={tile.key === highlighted} platform="other" onOpen={() => {}} />,
      ),
    )
    .join('');

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
    mark(),
  );
}

export const HEADLINE = 'Put your sites on keys.';

/** The 440×280 promo tile: the mark and the name, the chord, and the headline. */
export function promoTilePage(stylesheets: string[]): string {
  return page(
    `
      body { width: 440px; height: 280px; overflow: hidden; background: var(--background) !important; color: var(--foreground);
        display: flex; flex-direction: column; justify-content: center; gap: 24px; padding: 0 40px; box-sizing: border-box; }
      ${BRAND_STYLES}
      .tagline { margin: 0; font-size: 24px; line-height: 30px; font-weight: 700; letter-spacing: -0.025em; }
      .chord { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 700; color: var(--muted-foreground); }
      .chord [data-slot=key-cap] { height: 48px; min-width: 48px; font-size: 20px; }
      .chord .trigger { width: auto; white-space: nowrap; padding: 0 14px; font-size: 18px; }
    `,
    stylesheets,
    `${brand(44)}
     <div class="chord">${chord([TRIGGER, 'G' as KeyLabel])}</div>
     <p class="tagline">${escapeHtml(HEADLINE)}</p>`,
  );
}

/**
 * The marquee composition: the brand, the headline (and the sub, where there is room) on the left, the overlay's
 * tiles on the right with G highlighted. The 1400×560 marquee, and the 1200×630 social card in the same style.
 */
function pitchPage(
  stylesheets: string[],
  {
    width,
    height,
    headline,
    sub,
    data,
  }: { width: number; height: number; headline: number; sub?: string; data: TileData[] },
): string {
  return page(
    `
      body { width: ${width}px; height: ${height}px; overflow: hidden; box-sizing: border-box; padding: 0 ${width * 0.06}px;
        display: grid; grid-template-columns: 1fr ${width * 0.4}px; gap: ${width * 0.05}px; align-items: center;
        background: radial-gradient(120% 140% at 100% 50%, color-mix(in srgb, var(--primary) 9%, var(--background)), var(--background) 60%) !important;
        color: var(--foreground); }
      ${BRAND_STYLES}
      .text { display: flex; flex-direction: column; gap: 28px; }
      h1 { margin: 0; font-size: ${headline}px; line-height: 1.05; font-weight: 700; letter-spacing: -0.035em; text-wrap: balance; }
      p { margin: -8px 0 0; font-size: 24px; line-height: 34px; color: var(--muted-foreground); font-weight: 500; text-wrap: pretty; }
      .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 20px; border-radius: 24px;
        background: var(--card); border: 1px solid var(--border); box-shadow: 0 32px 64px -24px rgb(0 0 0 / 0.25); }
    `,
    stylesheets,
    `<div class="text">
       ${brand(48)}
       <h1>${escapeHtml(HEADLINE)}</h1>
       ${sub === undefined ? '' : `<p>${escapeHtml(sub)}</p>`}
     </div>
     <div class="tiles">${tiles(data, 'G')}</div>`,
  );
}

export const MARQUEE = { width: 1400, height: 560 };
export const CARD = { width: 1200, height: 630 };

export function marqueePage(stylesheets: string[], data: TileData[]): string {
  return pitchPage(stylesheets, {
    ...MARQUEE,
    headline: 76,
    sub: 'Hold ⌥ (Alt), press a key, and you’re on the site — or on the tab where it’s already open.',
    data,
  });
}

export function socialCardPage(stylesheets: string[], data: TileData[]): string {
  return pitchPage(stylesheets, { ...CARD, headline: 72, data });
}

/** The 1280×800 shots' frame: a big headline and a short sub above whatever the shot shows. */
const SHOT_STYLES = `
  body { width: 1280px; height: 800px; position: relative; overflow: hidden; box-sizing: border-box;
    background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 6%, var(--background)), var(--background) 55%) !important;
    color: var(--foreground); }
  ${BRAND_STYLES}
  header { position: absolute; left: 0; right: 0; top: 40px; text-align: center; }
  h1 { margin: 0; font-size: 60px; line-height: 66px; font-weight: 700; letter-spacing: -0.035em; }
  header p { margin: 10px 0 0; font-size: 22px; line-height: 30px; font-weight: 500; color: var(--muted-foreground); }
  .chord { display: flex; align-items: center; justify-content: center; gap: 16px; font-weight: 700;
    color: var(--muted-foreground); }
`;

const header = (headline: string, sub: string) =>
  `<header><h1>${escapeHtml(headline)}</h1><p>${escapeHtml(sub)}</p></header>`;

/**
 * Shot1, the Hero: the brand, a giant ⌥ / Alt + G, the headline and the sub, and six of the overlay's tiles as the
 * Peek would draw them (open sites green, the others with what their key does).
 */
export function heroPage(stylesheets: string[], data: TileData[]): string {
  return page(
    `
      ${SHOT_STYLES}
      body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; }
      body > .brand { position: absolute; left: 48px; top: 40px; }
      .chord { font-size: 48px; }
      .chord [data-slot=key-cap] { height: 112px; min-width: 112px; border-radius: 22px; font-size: 60px; }
      .chord .trigger { width: auto; white-space: nowrap; padding: 0 32px; font-size: 44px; }
      h1 { margin-top: 40px; font-size: 76px; line-height: 82px; }
      .sub { margin: 14px 0 0; max-width: 820px; text-align: center; font-size: 24px; line-height: 34px;
        font-weight: 500; color: var(--muted-foreground); text-wrap: balance; }
      .tiles { margin-top: 44px; width: 1000px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    `,
    stylesheets,
    `${brand(40)}
     <div class="chord">${chord([TRIGGER, 'G' as KeyLabel])}</div>
     <h1>${escapeHtml(HEADLINE)}</h1>
     <p class="sub">Hold ⌥ (Alt) and press a key to open a site, or jump to the tab where it’s already open.</p>
     <div class="tiles">${tiles(data)}</div>`,
  );
}

/** A tab in the browser mock's strip: its title, and its link for the monogram. */
export interface DemoTab {
  title: string;
  link: string;
  active: boolean;
  /** An extension page: the mark instead of a monogram. */
  extension?: true;
}

/** The browser mock's two bars, above the page. */
const BARS = 92;
/** The size a page is captured at to fill the mock below its bars. */
export const DEMO_PAGE = { width: 1280, height: 800 - BARS };

const monogramOf = (title: string, link: string) => {
  const shortcut = parseShortcut({ link, name: title, openMode: 'smart', tabMatch: 'site', closeCurrent: false });
  if (shortcut === null) throw new Error(`no monogram for ${link}`);
  return renderToStaticMarkup(<Monogram shortcut={shortcut} size="xs" />);
};

/**
 * The browser mock's look: a strip of tabs (monogram and title, the active one marked) over a toolbar with the
 * address and SpeedLink's toolbar icon. Plainly a mock, not Chrome: no window buttons, no Chrome logos or icons.
 */
const MOCK_STYLES = `
  .bars { width: 100%; background: #F1F2F5; }
  .strip { display: flex; align-items: flex-end; gap: 2px; height: 44px; padding: 0 10px; background: #DADCE2;
    box-sizing: border-box; }
  .tab { flex: 0 1 216px; min-width: 0; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px;
    border-radius: 10px 10px 0 0; font-size: 13px; font-weight: 500; color: #4A4F5A; box-sizing: border-box; }
  .tab span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .tab.on { background: #F1F2F5; color: #1A1C1E; font-weight: 600; }
  .tab [data-slot=brand-mark] { width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0; }
  .tab [data-slot=brand-mark] svg { width: 12px; height: 12px; }
  .toolbar { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 12px; background: #F1F2F5;
    border-bottom: 1px solid #DADCE2; box-sizing: border-box; }
  .address { flex: 1; display: flex; align-items: center; height: 32px; padding: 0 16px; border-radius: 16px;
    background: #fff; font-size: 13px; color: #6B7080; }
  .address b { font-weight: 500; color: #1A1C1E; }
  .icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; }
  .icon.on { background: #DADCE2; box-shadow: 0 0 0 2px var(--primary); }
  .icon [data-slot=brand-mark] { width: 20px; height: 20px; border-radius: 5px; }
  .icon [data-slot=brand-mark] svg { width: 12px; height: 12px; }
`;

/** The mock's bars for `tabs`; the address is the active tab's host and path unless `address` names the page. */
function bars(tabs: DemoTab[], { address, iconFocused = false }: { address?: string; iconFocused?: boolean } = {}) {
  const active = tabs.find(({ active }) => active);
  const url = active === undefined || active.extension ? undefined : new URL(active.link);
  const shown =
    address !== undefined
      ? `<b>${escapeHtml(address)}</b>`
      : url === undefined
        ? ''
        : `<b>${escapeHtml(url.host)}</b>${escapeHtml(url.pathname === '/' ? '' : url.pathname)}`;
  return `<div class="bars">
    <div class="strip">${tabs
      .map(
        ({ title, link, active, extension }) =>
          `<div class="tab${active ? ' on' : ''}">${extension ? mark() : monogramOf(title, link)}<span>${escapeHtml(title)}</span></div>`,
      )
      .join('')}</div>
    <div class="toolbar"><div class="address">${shown}</div><div class="icon${iconFocused ? ' on' : ''}">${mark()}</div></div>
  </div>`;
}

/** One picture in the browser mock: a clean frame, or a still of the demo loop. */
export interface MockFrame {
  tabs: DemoTab[];
  /** The page below the bars, as a PNG at `DEMO_PAGE`'s size. */
  pagePng: string;
  /** The omnibox's text for a page that has no web address (the Options page). */
  address?: string;
  /** The popup's card, dropped under the toolbar icon, which then shows as clicked. */
  popupPng?: string;
  /** The keys held down, shown in the corner (the demo loop); none hides the indicator. */
  keys?: KeyLabel[];
}

/**
 * A capture in the shared browser mock: the clean frames the captioned shots and the landing page use, and the
 * demo loop's stills (with the held keys in the bottom left corner).
 */
export function browserFramePage(stylesheets: string[], { tabs, pagePng, address, popupPng, keys = [] }: MockFrame) {
  return page(
    `
      body { width: 1280px; height: 800px; position: relative; overflow: hidden; background: #fff !important;
        color: var(--foreground); }
      ${MOCK_STYLES}
      .page { display: block; width: ${DEMO_PAGE.width}px; height: ${DEMO_PAGE.height}px; }
      .popup { position: absolute; top: ${BARS - 6}px; right: 8px; border-radius: 12px;
        box-shadow: 0 12px 32px rgb(0 0 0 / 0.28), 0 0 0 1px rgb(0 0 0 / 0.08); }
      .keys { position: absolute; left: 32px; bottom: 32px; display: flex; align-items: center; gap: 10px; padding: 12px;
        border-radius: 18px; background: var(--card); border: 1px solid var(--border);
        box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.28); font-size: 20px; font-weight: 700; color: var(--muted-foreground); }
      .keys [data-slot=key-cap] { height: 44px; }
      .keys .trigger { width: 72px; font-size: 18px; }
    `,
    stylesheets,
    `${bars(tabs, { address, iconFocused: popupPng !== undefined })}
     <img class="page" alt="" src="data:image/png;base64,${pagePng}" />
     ${popupPng === undefined ? '' : `<img class="popup" alt="" src="data:image/png;base64,${popupPng}" />`}
     ${keys.length === 0 ? '' : `<div class="keys">${chord(keys)}</div>`}`,
  );
}

/**
 * Shot2, Smart switch: the headline and the sub, the window's tab strip before ⌥ / Alt + G, the chord, and the
 * same strip after it, with GitHub in front and no tab added.
 */
export function smartSwitchPage(stylesheets: string[], { before, after }: { before: DemoTab[]; after: DemoTab[] }) {
  const panel = (label: string, tabs: DemoTab[]) =>
    `<section><div class="label">${label}</div><div class="window">${bars(tabs)}<div class="page"></div></div></section>`;
  return page(
    `
      ${SHOT_STYLES}
      ${MOCK_STYLES}
      main { position: absolute; left: 80px; right: 80px; top: 214px; display: flex; flex-direction: column; gap: 20px; }
      .label { margin: 0 0 8px 4px; font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: var(--muted-foreground); }
      .window { border-radius: 14px; overflow: hidden; border: 1px solid #D3D6DD;
        box-shadow: 0 24px 48px -24px rgb(0 0 0 / 0.25); background: #fff; }
      .window .page { height: 36px; background: #fff; }
      .chord { font-size: 28px; }
      .chord [data-slot=key-cap] { height: 64px; min-width: 64px; border-radius: 14px; font-size: 32px; }
      .chord .trigger { width: auto; white-space: nowrap; padding: 0 20px; font-size: 26px; }
    `,
    stylesheets,
    `${header('Already open? You jump to it.', 'No duplicate tabs. If the site isn’t open yet, SpeedLink opens it.')}
     <main>
       ${panel('BEFORE', before)}
       <div class="chord">${chord([TRIGGER, 'G' as KeyLabel])}</div>
       ${panel('AFTER', after)}
     </main>`,
  );
}

/** A captioned shot (Shot3–5): what a clean frame shows. */
export interface Caption {
  headline: string;
  sub: string;
  /** Shot4's line: "[icon] then ‹key› and it's saved". */
  thenKey?: KeyLabel;
}

/** Shot3–5: the headline and the sub, over a clean frame scaled into a window that runs off the bottom edge. */
export function captionedShotPage(stylesheets: string[], { headline, sub, thenKey }: Caption, framePng: string) {
  const scale = 0.8125;
  return page(
    `
      ${SHOT_STYLES}
      ${BRAND_STYLES}
      .window { position: absolute; left: ${(1280 - 1280 * scale) / 2}px; top: 180px; width: ${1280 * scale}px;
        height: ${800 * scale}px; border-radius: 16px 16px 0 0; overflow: hidden; border: 1px solid #D3D6DD;
        box-shadow: 0 32px 64px -24px rgb(0 0 0 / 0.3); background: #fff; }
      .window img { display: block; width: 100%; height: 100%; }
      .then { position: absolute; left: 152px; bottom: 40px; display: flex; align-items: center; gap: 12px;
        padding: 12px 18px; border-radius: 18px; background: var(--card); border: 1px solid var(--border);
        box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.28); font-size: 20px; font-weight: 600; color: var(--muted-foreground); }
      .then [data-slot=key-cap] { height: 44px; }
    `,
    stylesheets,
    `${header(headline, sub)}
     <div class="window"><img alt="" src="data:image/png;base64,${framePng}" /></div>
     ${
       thenKey === undefined
         ? ''
         : `<div class="then"><span class="brand" style="--mark: 32px">${mark()}</span>then
            ${renderToStaticMarkup(<KeyCap decorative size="xl" state="selected" label={thenKey} />)} and it’s saved</div>`
     }`,
  );
}
