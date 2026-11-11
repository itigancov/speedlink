import { describe, expect, it } from 'vitest';
import { isOpenNow, tabMatches } from './tab-match';
import { validShortcut } from './test-shortcut';

describe('tabMatches', () => {
  describe('exact', () => {
    it.each([
      ['https://a.com/x?q=1', 'https://a.com/x/?q=1', true],
      ['https://a.com/x/', 'https://a.com/x', true],
      ['https://a.com/', 'https://a.com/', true],
      ['https://a.com', 'https://a.com/', true],
      ['https://a.com/x?', 'https://a.com/x', true],
      ['https://a.com/x#', 'https://a.com/x', true],
      ['https://a.com/x?q=1#top', 'https://a.com/x?q=1#top', true],
      ['https://A.com/x', 'https://a.com/x', true],
      ['https://a.com:443/x', 'https://a.com/x', true],
      ['https://a.com/x?q=2', 'https://a.com/x?q=1', false],
      ['https://a.com/x', 'https://a.com/x?q=1', false],
      ['https://a.com/x#top', 'https://a.com/x', false],
      ['https://a.com/x?b=2&a=1', 'https://a.com/x?a=1&b=2', false],
      ['https://a.com/x//', 'https://a.com/x', false],
      ['https://a.com/X', 'https://a.com/x', false],
      ['https://a.com/%7Ex', 'https://a.com/~x', false],
      ['http://a.com/x', 'https://a.com/x', false],
      ['https://www.a.com/x', 'https://a.com/x', false],
      ['https://a.com:8443/x', 'https://a.com/x', false],
    ])('tab %s vs link %s → %s', (tab, link, expected) => {
      expect(tabMatches(tab, link, 'exact')).toBe(expected);
    });
  });

  describe('page', () => {
    it.each([
      ['https://a.com/x?q=2#top', 'https://a.com/x?q=1', true],
      ['https://a.com/x/', 'https://a.com/x#a', true],
      ['https://a.com/?ref=1', 'https://a.com/', true],
      ['https://a.com/y', 'https://a.com/x', false],
      ['https://a.com/x/y', 'https://a.com/x', false],
      ['http://a.com/x', 'https://a.com/x', false],
      ['https://a.com:8443/x', 'https://a.com/x', false],
    ])('tab %s vs link %s → %s', (tab, link, expected) => {
      expect(tabMatches(tab, link, 'page')).toBe(expected);
    });
  });

  describe('site', () => {
    it.each([
      ['https://a.com/anything?x#y', 'https://a.com/', true],
      ['http://a.com/', 'https://a.com/x', true],
      ['https://www.a.com/', 'https://a.com/', true],
      ['https://a.com/', 'https://www.a.com/', true],
      ['https://www2.a.com/', 'https://a.com/', false],
      ['https://docs.google.com/', 'https://mail.google.com/', false],
      ['https://google.com/', 'https://docs.google.com/', false],
      ['http://localhost:3000/', 'http://localhost:3001/', false],
      ['http://localhost:3000/a', 'http://localhost:3000/b', true],
      ['http://a.com:80/', 'https://a.com/', true],
    ])('tab %s vs link %s → %s', (tab, link, expected) => {
      expect(tabMatches(tab, link, 'site')).toBe(expected);
    });
  });

  it.each([
    'chrome://newtab/',
    'about:blank',
    'chrome-extension://abc/options.html',
    'file:///tmp/a.html',
    'not a url',
    '',
  ])('never matches the non-web tab %j', (tab) => {
    for (const mode of ['exact', 'page', 'site'] as const) {
      expect(tabMatches(tab, 'https://a.com/', mode)).toBe(false);
    }
  });
});

describe('isOpenNow', () => {
  const tabs = ['chrome://newtab/', 'https://github.com/foo/bar?tab=1'];

  it('is true for a Smart shortcut when a tab matches by its tab match', () => {
    expect(isOpenNow(validShortcut({ link: 'github.com', openMode: 'smart', tabMatch: 'site' }), tabs)).toBe(true);
    expect(isOpenNow(validShortcut({ link: 'github.com/foo/bar', openMode: 'smart', tabMatch: 'page' }), tabs)).toBe(
      true,
    );
  });

  it('is false for a Smart shortcut when no tab matches', () => {
    expect(isOpenNow(validShortcut({ link: 'github.com/foo/bar', openMode: 'smart', tabMatch: 'exact' }), tabs)).toBe(
      false,
    );
    expect(isOpenNow(validShortcut({ link: 'github.com' }), [])).toBe(false);
  });

  it.each(['new', 'this', 'bg'] as const)('is false for open mode %s even when a tab matches', (openMode) => {
    expect(isOpenNow(validShortcut({ link: 'github.com', openMode, tabMatch: 'site' }), tabs)).toBe(false);
  });
});
