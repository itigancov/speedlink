// The HUD's font (product spec §12.1). `@font-face` does not apply inside a shadow root, so the family is
// declared on the host document. The file is web-accessible with `use_dynamic_url`, so its URL is only known at
// run time and cannot sit in static CSS. A page whose CSP blocks the URL falls back to the system font.

const FONT_PATH = '/fonts/inter-latin-wght.woff2';
const MARKER = 'data-speedlink-font';

/** Declares "SpeedLink Inter" on `doc` once; later calls on the same document do nothing. */
export function injectHudFont(doc: Document): void {
  if (doc.querySelector(`style[${MARKER}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(MARKER, '');
  style.textContent = `@font-face {
  font-family: "SpeedLink Inter";
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url("${browser.runtime.getURL(FONT_PATH)}") format("woff2-variations");
}`;
  (doc.head ?? doc.documentElement).append(style);
}
