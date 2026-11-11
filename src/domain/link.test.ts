import { describe, expect, it } from 'vitest';
import { mainLabel, normalizeLink, siteOf } from './link';

describe('normalizeLink', () => {
  it.each([
    ['github.com', 'https://github.com/'],
    ['  github.com/foo  ', 'https://github.com/foo'],
    ['GitHub.com/Path', 'https://github.com/Path'],
    ['intranet', 'https://intranet/'],
    ['intranet/wiki', 'https://intranet/wiki'],
    ['localhost', 'http://localhost/'],
    ['localhost:3000', 'http://localhost:3000/'],
    ['localhost:3000/app?x=1', 'http://localhost:3000/app?x=1'],
    ['127.0.0.1:8080', 'http://127.0.0.1:8080/'],
    ['192.168.1.10/admin', 'http://192.168.1.10/admin'],
    ['[::1]:5173', 'http://[::1]:5173/'],
    ['printer.local', 'http://printer.local/'],
    ['nas.local:5000/files', 'http://nas.local:5000/files'],
    ['http://example.com', 'http://example.com/'],
    ['https://example.com/a?b#c', 'https://example.com/a?b#c'],
    ['HTTPS://Example.com', 'https://example.com/'],
    ['http://localhost:3000', 'http://localhost:3000/'],
    ['https://user:pass@example.com/', 'https://user:pass@example.com/'],
  ])('normalizes %j to %s', (input, expected) => {
    expect(normalizeLink(input)).toEqual({ ok: true, value: expected });
  });

  it.each(['', '   '])('rejects empty input %j', (input) => {
    expect(normalizeLink(input)).toEqual({ ok: false, error: 'empty' });
  });

  it.each([
    'chrome://extensions',
    'file:///etc/hosts',
    'ftp://example.com',
    'chrome-extension://abc/x.html',
    'mailto:me@example.com',
    'javascript:alert(1)',
    'about:blank',
  ])('rejects the non-web scheme of %s', (input) => {
    expect(normalizeLink(input)).toEqual({ ok: false, error: 'non-web-scheme' });
  });

  it.each(['http://', 'https://exa mple.com', 'foo bar', 'https://[::1'])('rejects unparseable %j', (input) => {
    expect(normalizeLink(input)).toEqual({ ok: false, error: 'unparseable' });
  });
});

describe('siteOf', () => {
  it.each([
    ['https://github.com/foo', 'github.com'],
    ['https://www.github.com/', 'github.com'],
    ['https://www.www.example.com/', 'www.example.com'],
    ['https://www2.example.com/', 'www2.example.com'],
    ['http://localhost:3000/', 'localhost:3000'],
    ['https://example.com:443/', 'example.com'],
    ['http://example.com:8443/', 'example.com:8443'],
    ['https://münchen.de/', 'xn--mnchen-3ya.de'],
  ])('gives the site of %s as %s', (link, site) => {
    expect(siteOf(link)).toBe(site);
  });
});

describe('mainLabel', () => {
  it.each([
    ['https://github.com/', 'github'],
    ['https://www.github.com/', 'github'],
    ['https://docs.google.com/', 'google'],
    ['https://bbc.co.uk/', 'bbc'],
    ['https://www.bbc.co.uk/news', 'bbc'],
    ['https://foo.github.io/', 'github'],
    ['https://example.com.au/', 'example'],
    ['https://yahoo.co.jp/', 'yahoo'],
    ['https://ox.ac.uk/', 'ox'],
    ['https://news.ycombinator.com/', 'ycombinator'],
    ['https://co.uk/', 'co'],
    ['https://intranet/', 'intranet'],
    ['http://localhost:3000/', 'localhost'],
    ['http://127.0.0.1:8080/', '127.0.0.1'],
    ['http://[::1]/', '[::1]'],
    ['https://9gag.com/', '9gag'],
  ])('gives the main label of %s as %s', (link, label) => {
    expect(mainLabel(link)).toBe(label);
  });
});
