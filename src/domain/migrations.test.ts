import { describe, expect, it } from 'vitest';
import { KEYBOARD_ORDER, type Key } from './keys';
import { planV1Import } from './migrations';
import { validShortcut } from './test-shortcut';

const NONE: ReadonlySet<Key> = new Set();

const row = (shortcut: unknown, url: unknown, title: unknown = '', extra: object = {}) => ({
  canEdit: false,
  id: crypto.randomUUID(),
  shortcut,
  title,
  url,
  ...extra,
});

const v1 = (shortcuts: unknown, settings: unknown = { smartTabs: true }) => ({ shortcuts, settings });

/** A shortcut as an import produces it: tab match site, close current false. */
const imported = (link: string, openMode: 'smart' | 'new' | 'this' | 'bg', name?: string) =>
  validShortcut({ link, openMode, tabMatch: 'site', closeCurrent: false, ...(name === undefined ? {} : { name }) });

describe('planV1Import: no v1 data', () => {
  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'speedlink'],
    ['an array', []],
  ])('returns none when speedlink is %s', (_, raw) => {
    expect(planV1Import(raw, NONE)).toEqual({ kind: 'none' });
  });
});

describe('planV1Import: the 1.6 seed', () => {
  it('imports the default Google and Facebook rows on their keys, as New tab', () => {
    const seed = {
      shortcuts: [
        { canEdit: false, id: '1', shortcut: '1', title: 'Google', url: 'https://google.com' },
        { canEdit: false, id: '2', shortcut: '2', title: 'Facebook', url: 'https://facebook.com' },
      ],
      settings: { theme: 'system', useShift: true, postAction: 'Jump to tab', smartTabs: false },
    };

    expect(planV1Import(seed, NONE)).toEqual({
      kind: 'import',
      shortcuts: {
        1: imported('https://google.com/', 'new', 'Google'),
        2: imported('https://facebook.com/', 'new', 'Facebook'),
      },
      report: { imported: ['1', '2'], skipped: [] },
    });
  });
});

describe('planV1Import: open mode from the v1 settings', () => {
  const modeOf = (settings: unknown) => {
    const result = planV1Import({ shortcuts: [row('G', 'https://github.com')], settings }, NONE);
    return result.kind === 'import' ? result.shortcuts.G?.openMode : undefined;
  };

  it.each([
    [true, 'Open in background', 'smart'],
    [true, 'Jump to tab', 'smart'],
    [true, 'Close & Jump to tab', 'smart'],
    [false, 'Open in background', 'bg'],
    [false, 'Jump to tab', 'new'],
    [false, 'Close & Jump to tab', 'this'],
  ])('smartTabs %s with "%s" imports as %s', (smartTabs, postAction, mode) => {
    expect(modeOf({ theme: 'system', useShift: false, postAction, smartTabs })).toBe(mode);
  });

  it.each([
    ['1.0 {theme}', { theme: 'system' }, 'new'],
    ['1.1 {theme, useShift}', { theme: 'system', useShift: true }, 'new'],
    ['1.3/1.4 with Post Action', { theme: 'system', useShift: true, postAction: 'Open in background' }, 'bg'],
    ['1.5+ all four', { theme: 'system', useShift: true, postAction: 'Jump to tab', smartTabs: true }, 'smart'],
    ['missing settings', undefined, 'new'],
    ['settings not an object', 'oops', 'new'],
    ['an unknown Post Action', { postAction: 'Teleport', smartTabs: false }, 'new'],
    ['a non-boolean smartTabs', { postAction: 'Open in background', smartTabs: 'yes' }, 'bg'],
  ])('reads %s with the effective 1.6 defaults', (_, settings, mode) => {
    expect(modeOf(settings)).toBe(mode);
  });
});

describe('planV1Import: rows', () => {
  it('reads the key trimmed and upper-cased', () => {
    const result = planV1Import(v1([row(' g ', 'https://github.com'), row('y', 'https://youtube.com')]), NONE);

    expect(result).toMatchObject({ kind: 'import', report: { imported: ['G', 'Y'], skipped: [] } });
  });

  it.each([
    ['empty', ''],
    ['two characters', 'AB'],
    ['punctuation', ';'],
    ['a non-Latin letter', 'Ж'],
    ['a letter that upper-cases to Latin', 'ı'],
    ['not a string', 7],
    ['a v1.0 array', ['Alt', 'Shift', '1']],
  ])('skips a key that is %s as invalid-key', (_, key) => {
    expect(planV1Import(v1([row(key, 'https://github.com')]), NONE)).toEqual({
      kind: 'import',
      shortcuts: {},
      report: {
        imported: [],
        skipped: [{ index: 0, v1Key: typeof key === 'string' ? key : null, reason: 'invalid-key' }],
      },
    });
  });

  it('trims the title into the name, and leaves an empty or missing title unnamed', () => {
    const result = planV1Import(
      v1([
        row('A', 'https://a.example', '  My  site '),
        row('B', 'https://b.example', '   '),
        row('C', 'https://c.example', 3),
      ]),
      NONE,
    );

    expect(result).toMatchObject({
      shortcuts: {
        A: imported('https://a.example/', 'smart', 'My  site'),
        B: imported('https://b.example/', 'smart'),
        C: imported('https://c.example/', 'smart'),
      },
    });
  });

  it('drops id and canEdit, and imports a row still in edit mode', () => {
    const result = planV1Import(v1([row('E', 'https://e.example', 'Edited', { canEdit: true, id: 'x' })]), NONE);

    expect(result).toMatchObject({ shortcuts: { E: imported('https://e.example/', 'smart', 'Edited') } });
    expect(Object.keys((result as { shortcuts: { E: object } }).shortcuts.E).sort()).toEqual([
      'closeCurrent',
      'link',
      'name',
      'openMode',
      'tabMatch',
    ]);
  });

  it('normalizes a link without a scheme to a web link', () => {
    const result = planV1Import(v1([row('G', 'google.com'), row('L', 'localhost:3000/app')]), NONE);

    expect(result).toMatchObject({
      shortcuts: { G: imported('https://google.com/', 'smart'), L: imported('http://localhost:3000/app', 'smart') },
    });
  });

  it.each([
    ['chrome://extensions', 'non-web-scheme'],
    ['file:///Users/me/notes.txt', 'non-web-scheme'],
    ['javascript:alert(1)', 'non-web-scheme'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['http://exa mple.com', 'unparseable'],
  ])('skips the link %j as %s', (url, reason) => {
    expect(planV1Import(v1([row('K', url)]), NONE)).toMatchObject({
      shortcuts: {},
      report: { imported: [], skipped: [{ index: 0, v1Key: 'K', reason }] },
    });
  });

  it('skips a link that is not a string as empty', () => {
    expect(planV1Import(v1([row('K', undefined), row('J', 42)]), NONE)).toMatchObject({
      report: {
        skipped: [
          { index: 0, v1Key: 'K', reason: 'empty' },
          { index: 1, v1Key: 'J', reason: 'empty' },
        ],
      },
    });
  });

  it('skips a row too large to store as too-large and imports the rest', () => {
    const huge = `https://big.example/${'a'.repeat(9000)}`;

    expect(planV1Import(v1([row('B', huge), row('G', 'https://github.com')]), NONE)).toEqual({
      kind: 'import',
      shortcuts: { G: imported('https://github.com/', 'smart') },
      report: { imported: ['G'], skipped: [{ index: 0, v1Key: 'B', reason: 'too-large' }] },
    });
  });

  it('skips a row that is not an object as invalid-key', () => {
    expect(planV1Import(v1(['oops', null]), NONE)).toMatchObject({
      report: {
        skipped: [
          { index: 0, v1Key: null, reason: 'invalid-key' },
          { index: 1, v1Key: null, reason: 'invalid-key' },
        ],
      },
    });
  });
});

describe('planV1Import: empty and malformed data', () => {
  it('imports nothing from an empty list, so the caller still marks it', () => {
    expect(planV1Import(v1([]), NONE)).toEqual({
      kind: 'import',
      shortcuts: {},
      report: { imported: [], skipped: [] },
    });
  });

  it.each([
    ['missing', { settings: {} }],
    ['an object', { shortcuts: { 0: {} }, settings: {} }],
    ['a string', { shortcuts: 'G' }],
  ])('reports shortcuts that are %s as malformed, with nothing imported', (_, raw) => {
    expect(planV1Import(raw, NONE)).toEqual({
      kind: 'import',
      shortcuts: {},
      report: { imported: [], skipped: [], malformed: 'shortcuts-not-array' },
    });
  });
});

describe('planV1Import: duplicates', () => {
  it('lets the later row on a key win, as 1.6 did, and skips the earlier as duplicate', () => {
    expect(planV1Import(v1([row('G', 'https://old.example'), row('g', 'https://github.com')]), NONE)).toEqual({
      kind: 'import',
      shortcuts: { G: imported('https://github.com/', 'smart') },
      report: { imported: ['G'], skipped: [{ index: 0, v1Key: 'G', reason: 'duplicate' }] },
    });
  });

  it('does not let a later row with an invalid link displace an earlier valid one', () => {
    expect(planV1Import(v1([row('G', 'https://github.com'), row('G', 'chrome://settings')]), NONE)).toEqual({
      kind: 'import',
      shortcuts: { G: imported('https://github.com/', 'smart') },
      report: { imported: ['G'], skipped: [{ index: 1, v1Key: 'G', reason: 'non-web-scheme' }] },
    });
  });
});

describe('planV1Import: keys already taken', () => {
  it('skips a row whose key is taken as key-taken, without moving it', () => {
    const result = planV1Import(
      v1([row('G', 'https://github.com'), row('Y', 'https://youtube.com')]),
      new Set<Key>(['G']),
    );

    expect(result).toEqual({
      kind: 'import',
      shortcuts: { Y: imported('https://youtube.com/', 'smart') },
      report: { imported: ['Y'], skipped: [{ index: 0, v1Key: 'G', reason: 'key-taken' }] },
    });
  });
});

describe('planV1Import: the reserved S', () => {
  it('moves an S row to its first fitting key', () => {
    expect(planV1Import(v1([row('S', 'https://github.com', 'Code')]), NONE)).toEqual({
      kind: 'import',
      shortcuts: { G: imported('https://github.com/', 'smart', 'Code') },
      report: { imported: ['G'], skipped: [], moved: { from: 'S', to: 'G' } },
    });
  });

  it('places the S row after the other rows, against both taken and placed keys', () => {
    const result = planV1Import(
      v1([row('s', 'https://github.com'), row('G', 'https://gmail.com')]),
      new Set<Key>(['I']),
    );

    expect(result).toEqual({
      kind: 'import',
      shortcuts: { G: imported('https://gmail.com/', 'smart'), T: imported('https://github.com/', 'smart') },
      report: { imported: ['G', 'T'], skipped: [], moved: { from: 'S', to: 'T' } },
    });
  });

  it('falls back to the first free key in keyboard order when no fitting key is free', () => {
    const result = planV1Import(v1([row('S', 'https://ab.example')]), new Set<Key>(['A', 'B', '1']));

    expect(result).toMatchObject({
      shortcuts: { 2: imported('https://ab.example/', 'smart') },
      report: { imported: ['2'], moved: { from: 'S', to: '2' } },
    });
  });

  it('skips the S row as no-free-key when every key is taken', () => {
    const all = new Set<Key>(KEYBOARD_ORDER);

    expect(planV1Import(v1([row('S', 'https://github.com'), row('G', 'https://gmail.com')]), all)).toEqual({
      kind: 'import',
      shortcuts: {},
      report: {
        imported: [],
        skipped: [
          { index: 0, v1Key: 'S', reason: 'no-free-key' },
          { index: 1, v1Key: 'G', reason: 'key-taken' },
        ],
      },
    });
  });

  it('keeps only the later of two S rows', () => {
    expect(planV1Import(v1([row('S', 'https://slack.com'), row('S', 'https://github.com')]), NONE)).toMatchObject({
      shortcuts: { G: imported('https://github.com/', 'smart') },
      report: { skipped: [{ index: 0, v1Key: 'S', reason: 'duplicate' }], moved: { from: 'S', to: 'G' } },
    });
  });
});

describe('planV1Import: a realistic 1.6 item (invented data)', () => {
  // Shaped like a real 1.6 export: smartTabs on, theme kept, no useShift, mostly empty titles. Every site is
  // made up; nothing here comes from a real user's data.
  const longLink =
    'https://reports.analytics.example/dashboards/team-overview?range=last-90-days&group=week&metrics=visits,signups,retention&filter=region%3Deu';
  const realistic = {
    shortcuts: [
      {
        canEdit: false,
        id: 'f3a1c2d4-5b6e-4f70-8a91-b2c3d4e5f601',
        shortcut: '1',
        title: '',
        url: 'https://mail.example.com/',
      },
      {
        canEdit: false,
        id: '0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c02',
        shortcut: '2',
        title: '',
        url: 'https://calendar.example.com',
      },
      {
        canEdit: false,
        id: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b03',
        shortcut: '3',
        title: 'Team docs',
        url: 'https://docs.example.com/drive/folders/team',
      },
      {
        canEdit: false,
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c04',
        shortcut: '4',
        title: '',
        url: 'http://192.168.1.20:8080/admin',
      },
      {
        canEdit: false,
        id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d05',
        shortcut: '5',
        title: '',
        url: 'http://intranet/wiki/',
      },
      {
        canEdit: false,
        id: 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e06',
        shortcut: '6',
        title: '',
        url: 'https://www.news.example/',
      },
      {
        canEdit: false,
        id: 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f07',
        shortcut: '7',
        title: '',
        url: 'https://www.shop.example/cart',
      },
      {
        canEdit: false,
        id: 'e5f6a7b8-c9d0-4e1f-8a3b-4c5d6e7f8a08',
        shortcut: '8',
        title: '',
        url: 'https://eu.west.console.cloud.example/projects',
      },
      {
        canEdit: false,
        id: 'f6a7b8c9-d0e1-4f2a-9b4c-5d6e7f8a9b09',
        shortcut: '9',
        title: '',
        url: 'https://wiki.example.org/%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82',
      },
      {
        canEdit: false,
        id: 'a7b8c9d0-e1f2-4a3b-8c5d-6e7f8a9b0c10',
        shortcut: '0',
        title: '',
        url: 'https://files.example.net/shared/Quarterly%20plan/',
      },
      {
        canEdit: false,
        id: 'b8c9d0e1-f2a3-4b4c-9d6e-7f8a9b0c1d11',
        shortcut: 'Q',
        title: '',
        url: 'https://search.example/?q=weather&lang=en',
      },
      {
        canEdit: false,
        id: 'c9d0e1f2-a3b4-4c5d-8e7f-8a9b0c1d2e12',
        shortcut: 'W',
        title: 'Weekly sync notes',
        url: 'https://notes.example.com/w/weekly/',
      },
      {
        canEdit: false,
        id: 'd0e1f2a3-b4c5-4d6e-9f8a-9b0c1d2e3f13',
        shortcut: 'E',
        title: '',
        url: 'https://tracker.example.io/board?view=sprint',
      },
      { canEdit: false, id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a14', shortcut: 'R', title: '', url: longLink },
      {
        canEdit: false,
        id: 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b15',
        shortcut: 'T',
        title: '',
        url: 'https://translate.example.com/',
      },
      {
        canEdit: false,
        id: 'a3b4c5d6-e7f8-4a9b-8c1d-2e3f4a5b6c16',
        shortcut: 'Y',
        title: '',
        url: 'https://video.example.tv/feed/subscriptions',
      },
      {
        canEdit: false,
        id: 'b4c5d6e7-f8a9-4b0c-9d2e-3f4a5b6c7d17',
        shortcut: 'A',
        title: '',
        url: 'https://app.bank.example/',
      },
      {
        canEdit: false,
        id: 'c5d6e7f8-a9b0-4c1d-8e3f-4a5b6c7d8e18',
        shortcut: 'D',
        title: '',
        url: 'https://code.example.dev/org/repo/pulls',
      },
      {
        canEdit: false,
        id: 'd6e7f8a9-b0c1-4d2e-9f4a-5b6c7d8e9f19',
        shortcut: 'M',
        title: 'Music for focus',
        url: 'https://music.example.fm/playlist/focus',
      },
      {
        canEdit: false,
        id: 'e7f8a9b0-c1d2-4e3f-8a5b-6c7d8e9f0a20',
        shortcut: 'Z',
        title: '',
        url: 'https://www.example.com/',
      },
    ],
    settings: { postAction: 'Jump to tab', smartTabs: true, theme: 'system' },
  };

  it('imports every row as Smart switch on its own key', () => {
    expect(planV1Import(realistic, NONE)).toEqual({
      kind: 'import',
      shortcuts: {
        1: imported('https://mail.example.com/', 'smart'),
        2: imported('https://calendar.example.com/', 'smart'),
        3: imported('https://docs.example.com/drive/folders/team', 'smart', 'Team docs'),
        4: imported('http://192.168.1.20:8080/admin', 'smart'),
        5: imported('http://intranet/wiki/', 'smart'),
        6: imported('https://www.news.example/', 'smart'),
        7: imported('https://www.shop.example/cart', 'smart'),
        8: imported('https://eu.west.console.cloud.example/projects', 'smart'),
        9: imported('https://wiki.example.org/%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82', 'smart'),
        0: imported('https://files.example.net/shared/Quarterly%20plan/', 'smart'),
        Q: imported('https://search.example/?q=weather&lang=en', 'smart'),
        W: imported('https://notes.example.com/w/weekly/', 'smart', 'Weekly sync notes'),
        E: imported('https://tracker.example.io/board?view=sprint', 'smart'),
        R: imported(longLink, 'smart'),
        T: imported('https://translate.example.com/', 'smart'),
        Y: imported('https://video.example.tv/feed/subscriptions', 'smart'),
        A: imported('https://app.bank.example/', 'smart'),
        D: imported('https://code.example.dev/org/repo/pulls', 'smart'),
        M: imported('https://music.example.fm/playlist/focus', 'smart', 'Music for focus'),
        Z: imported('https://www.example.com/', 'smart'),
      },
      report: {
        imported: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'E', 'R', 'T', 'Y', 'A', 'D', 'M', 'Z'],
        skipped: [],
      },
    });
  });
});
