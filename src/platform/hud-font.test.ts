// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { injectHudFont } from './hud-font';

beforeEach(() => {
  fakeBrowser.reset();
});

const fontFaces = (doc: Document) =>
  Array.from(doc.querySelectorAll('style')).filter((style) => style.textContent?.includes('@font-face'));

describe('injectHudFont', () => {
  it('adds one @font-face for "SpeedLink Inter" at the runtime URL of the font file', () => {
    const doc = document.implementation.createHTMLDocument();

    injectHudFont(doc);

    const [style, ...rest] = fontFaces(doc);
    expect(rest).toEqual([]);
    expect(style?.parentNode).toBe(doc.head);
    expect(style?.textContent).toContain('font-family: "SpeedLink Inter"');
    expect(style?.textContent).toContain(`url("${browser.runtime.getURL('/fonts/inter-latin-wght.woff2')}")`);
  });

  it('adds nothing when called again on the same document', () => {
    const doc = document.implementation.createHTMLDocument();

    injectHudFont(doc);
    injectHudFont(doc);

    expect(fontFaces(doc)).toHaveLength(1);
  });

  it('works on a document with no <head> yet, as at document_start', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.head.remove();

    injectHudFont(doc);

    expect(fontFaces(doc)).toHaveLength(1);
    expect(fontFaces(doc)[0]?.parentNode).toBe(doc.documentElement);
  });
});
