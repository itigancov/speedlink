import { describe, expect, it } from 'vitest';
import { displayName, monogram, parseShortcut, type Shortcut, TILE_HUES, tileHue, validateShortcut } from './shortcut';
import { validShortcut } from './test-shortcut';

describe('validateShortcut', () => {
  it('normalizes the link and keeps the fields', () => {
    expect(
      validateShortcut({
        link: ' github.com ',
        name: 'GitHub',
        openMode: 'new',
        tabMatch: 'exact',
        closeCurrent: true,
      }),
    ).toEqual({
      ok: true,
      value: { link: 'https://github.com/', name: 'GitHub', openMode: 'new', tabMatch: 'exact', closeCurrent: true },
    });
  });

  it('trims the name, and drops a blank one', () => {
    const base = { link: 'github.com', openMode: 'smart', tabMatch: 'site', closeCurrent: false } as const;
    expect(validateShortcut({ ...base, name: '  Hub  ' })).toMatchObject({ ok: true, value: { name: 'Hub' } });
    const blank = validateShortcut({ ...base, name: '   ' });
    expect(blank.ok && 'name' in blank.value).toBe(false);
  });

  it('keeps a site tab match', () => {
    const result = validateShortcut({ link: 'github.com', openMode: 'smart', tabMatch: 'site', closeCurrent: false });
    expect(result).toMatchObject({ ok: true, value: { tabMatch: 'site' } });
  });

  it('passes the link error code through', () => {
    const base = { openMode: 'smart', tabMatch: 'site', closeCurrent: false } as const;
    expect(validateShortcut({ ...base, link: '' })).toEqual({ ok: false, error: 'empty' });
    expect(validateShortcut({ ...base, link: 'chrome://settings' })).toEqual({ ok: false, error: 'non-web-scheme' });
    expect(validateShortcut({ ...base, link: 'foo bar' })).toEqual({ ok: false, error: 'unparseable' });
  });

  it('rejects an unknown open mode or tab match', () => {
    const base = { link: 'github.com', openMode: 'smart', tabMatch: 'site', closeCurrent: false } as const;
    // @ts-expect-error: an unknown open mode is not a draft value
    expect(validateShortcut({ ...base, openMode: 'popup' })).toEqual({ ok: false, error: 'invalid-open-mode' });
    // @ts-expect-error: an unknown tab match is not a draft value
    expect(validateShortcut({ ...base, tabMatch: 'host' })).toEqual({ ok: false, error: 'invalid-tab-match' });
  });

  it('rejects a shortcut too large for one sync item', () => {
    const base = { openMode: 'smart', tabMatch: 'site', closeCurrent: false } as const;
    const long = `https://example.com/${'a'.repeat(8192)}`;
    expect(validateShortcut({ ...base, link: long })).toEqual({ ok: false, error: 'too-large' });
    expect(validateShortcut({ ...base, link: 'example.com', name: 'é'.repeat(4096) })).toEqual({
      ok: false,
      error: 'too-large',
    });
    expect(validateShortcut({ ...base, link: `https://example.com/${'a'.repeat(7000)}` }).ok).toBe(true);
  });

  it('keeps unknown fields from a parsed shortcut it is revalidating', () => {
    const parsed = parseShortcut({ link: 'https://github.com/', openMode: 'smart', future: { x: 1 } });
    if (parsed === null) throw new Error('expected a parsed shortcut');
    expect(validateShortcut({ ...parsed, name: 'Hub' })).toMatchObject({ ok: true, value: { future: { x: 1 } } });
  });
});

describe('the Shortcut brand', () => {
  it('is lost by a spread, so an edited draft must be validated again', () => {
    const shortcut = validShortcut({ link: 'github.com' });
    // @ts-expect-error: a spread draft is no longer a Shortcut
    const spread: Shortcut = { ...shortcut, name: 'Hub' };
    // @ts-expect-error: a plain object is never a Shortcut
    const forged: Shortcut = { link: 'https://a.com/', openMode: 'smart', tabMatch: 'site', closeCurrent: false };
    expect([spread.name, forged.link]).toEqual(['Hub', 'https://a.com/']);
  });
});

describe('parseShortcut', () => {
  it('fills defaults for missing fields', () => {
    expect(parseShortcut({ link: 'https://github.com/' })).toEqual({
      link: 'https://github.com/',
      openMode: 'smart',
      tabMatch: 'page',
      closeCurrent: false,
    });
  });

  it('defaults fields that hold unknown or mistyped values', () => {
    expect(
      parseShortcut({ link: 'https://github.com/', name: 42, openMode: 'popup', tabMatch: 3, closeCurrent: 'yes' }),
    ).toEqual({ link: 'https://github.com/', openMode: 'smart', tabMatch: 'page', closeCurrent: false });
  });

  it('defaults an unknown tab match to page, and keeps a stored site', () => {
    expect(parseShortcut({ link: 'https://a.com/', tabMatch: 'host' })?.tabMatch).toBe('page');
    expect(parseShortcut({ link: 'https://a.com/', tabMatch: 'site' })?.tabMatch).toBe('site');
  });

  it('keeps known valid fields and drops a blank name', () => {
    expect(
      parseShortcut({ link: 'https://a.com/', name: ' A ', openMode: 'bg', tabMatch: 'page', closeCurrent: true }),
    ).toEqual({ link: 'https://a.com/', name: 'A', openMode: 'bg', tabMatch: 'page', closeCurrent: true });
    expect(parseShortcut({ link: 'https://a.com/', name: '  ' })).not.toHaveProperty('name');
  });

  it('holds the link normalized', () => {
    expect(parseShortcut({ link: 'GitHub.com' })?.link).toBe('https://github.com/');
  });

  it('copies unknown fields onto the result', () => {
    expect(parseShortcut({ link: 'https://a.com/', color: 'red', groupId: 7 })).toEqual({
      link: 'https://a.com/',
      openMode: 'smart',
      tabMatch: 'page',
      closeCurrent: false,
      color: 'red',
      groupId: 7,
    });
  });

  it.each([
    ['no link', {}],
    ['a non-string link', { link: 42 }],
    ['an unusable link', { link: 'chrome://settings' }],
    ['an empty link', { link: '' }],
    ['a non-object', 'https://a.com/'],
    ['null', null],
    ['an array', ['https://a.com/']],
  ])('gives null for %s', (_, raw) => {
    expect(parseShortcut(raw)).toBeNull();
  });
});

describe('displayName', () => {
  it('uses the name when there is one', () => {
    expect(displayName(validShortcut({ link: 'github.com', name: 'Code' }))).toBe('Code');
  });

  it('falls back to the site', () => {
    expect(displayName(validShortcut({ link: 'https://www.github.com/x' }))).toBe('github.com');
    expect(displayName(validShortcut({ link: 'localhost:3000' }))).toBe('localhost:3000');
    expect(displayName(validShortcut({ link: 'github.com', name: '   ' }))).toBe('github.com');
  });
});

describe('monogram', () => {
  it.each([
    ['Hacker News', 'H'],
    ['gmail', 'G'],
    ['Почта', 'П'],
    ['  ¡Hola!  ', 'H'],
    ['2fa codes', '2'],
    ['𝒜𝒷c', '𝒜'],
    ['ǆungla', 'Ǆ'],
    ['éclair', 'É'],
    ['\u0065\u0301clair', '\u0045\u0301'],
    ['東京', '東'],
  ])('gives %j the monogram %s', (name, expected) => {
    expect(monogram(validShortcut({ link: 'example.com', name }))).toBe(expected);
  });

  it.each([
    ['🚀🚀', 'https://github.com/', 'G'],
    ['!!!', 'https://bbc.co.uk/', 'B'],
    [undefined, 'https://docs.google.com/', 'D'],
    [undefined, 'https://www.youtube.com/', 'Y'],
    [undefined, 'http://localhost:3000/', 'L'],
    [undefined, 'http://127.0.0.1/', '1'],
    [undefined, 'https://xn--e1afmkfd.xn--p1ai/', 'X'],
  ])('falls back to the site when the name %j has no letter (%s)', (name, link, expected) => {
    expect(monogram(validShortcut({ link, ...(name === undefined ? {} : { name }) }))).toBe(expected);
  });
});

describe('tileHue', () => {
  it.each([
    ['https://github.com/', 'amber'],
    ['https://youtube.com/', 'purple'],
    ['https://mail.google.com/', 'red'],
    ['https://google.com/', 'purple'],
    ['http://localhost/', 'blue'],
    ['http://localhost:3000/', 'teal'],
    ['https://news.ycombinator.com/', 'indigo'],
    ['chrome://extensions/', 'teal'],
    ['https://xn--e1afmkfd.xn--p1ai/', 'purple'],
    ['file:///Users/a/notes.html', 'teal'],
  ])('pins %s to %s', (link, hue) => {
    expect(tileHue(link)).toBe(hue);
  });

  it('ignores one leading www. and the path', () => {
    expect(tileHue('https://www.github.com/acme/speedlink')).toBe(tileHue('https://github.com/'));
  });

  it('tells ports apart', () => {
    expect(tileHue('http://localhost:3000/')).not.toBe(tileHue('http://localhost:5173/'));
  });

  it('keeps the colour of a renamed shortcut', () => {
    const before = validShortcut({ link: 'github.com', name: 'GitHub' });
    const after = validShortcut({ link: 'github.com', name: 'Code' });
    expect(tileHue(after.link)).toBe(tileHue(before.link));
  });

  it('hashes a link that does not parse whole', () => {
    expect(tileHue('not a link')).toBe('teal');
    expect(TILE_HUES).toContain(tileHue(''));
  });

  it('always gives one of the eight hues', () => {
    expect(TILE_HUES).toEqual(['red', 'amber', 'blue', 'teal', 'slate', 'purple', 'indigo', 'green']);
    for (const link of ['https://a.com/', 'https://b.org/x', 'http://10.0.0.1:8080/', 'about:blank', '🚀']) {
      expect(TILE_HUES).toContain(tileHue(link));
    }
  });
});
