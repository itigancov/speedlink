import { describe, expect, it } from 'vitest';
import { keyFromCode, pickerModel } from './assign-picker';
import type { Keymap } from './keymap-ops';
import { KEYBOARD_ORDER, type Key } from './keys';
import type { Shortcut } from './shortcut';
import { validShortcut } from './test-shortcut';

const page = { url: 'https://github.com/acme/speedlink/pulls', title: 'Pull requests · acme/speedlink' };
const github = validShortcut({ link: 'https://github.com/', name: 'GitHub' });

/** Every key but `except` holds a shortcut. */
function fullBut(...except: Key[]): Keymap {
  const keymap: Partial<Record<Key, Shortcut>> = {};
  for (const key of KEYBOARD_ORDER) {
    if (!except.includes(key)) keymap[key] = validShortcut({ link: `https://site-${key}.example/` });
  }
  return keymap;
}

const usable = (model: ReturnType<typeof pickerModel>) => {
  if (!model.usable) throw new Error('expected a usable page');
  return model;
};

describe('pickerModel: unusable pages', () => {
  it.each([
    'chrome://extensions/',
    'about:blank',
    'file:///Users/me/notes.html',
    'https://chromewebstore.google.com/detail/abc',
    '',
  ])('is unusable on %j', (url) => {
    expect(pickerModel({}, { url, title: 'Anything' }, 'K')).toEqual({ usable: false });
  });
});

describe('pickerModel: the page', () => {
  it('is the shortcut the page would become: its link and its title as the name', () => {
    expect(usable(pickerModel({}, page, null)).shortcut).toEqual(
      validShortcut({ link: page.url, name: 'Pull requests · acme/speedlink' }),
    );
  });
});

describe('pickerModel: already on', () => {
  it('is empty when no shortcut matches the tab', () => {
    expect(usable(pickerModel({ Y: validShortcut({ link: 'https://youtube.com/' }) }, page, null)).alreadyOn).toEqual(
      [],
    );
  });

  it('lists one key whose shortcut matches the tab by its own tab match', () => {
    const keymap = { G: validShortcut({ link: 'https://github.com/other', tabMatch: 'site' }) };
    expect(usable(pickerModel(keymap, page, null)).alreadyOn).toEqual(['G']);
  });

  it('lists every matching key in keyboard order, and leaves out a key whose tab match is stricter', () => {
    const keymap = {
      Y: validShortcut({ link: 'https://github.com/acme/speedlink/pulls', tabMatch: 'exact' }),
      '2': validShortcut({ link: 'https://github.com/acme/speedlink/pulls?q=open', tabMatch: 'page' }),
      P: validShortcut({ link: 'https://github.com/acme/speedlink/pulls?q=open', tabMatch: 'exact' }),
    };
    expect(usable(pickerModel(keymap, page, null)).alreadyOn).toEqual(['2', 'Y']);
  });
});

describe('pickerModel: chips and the default key', () => {
  it("offers the site's first letter, then the title's initials, then the rest of the site, at most 4", () => {
    // github → G; title words → P, R, A, S(never); then the site's I, T, H, U, B.
    const model = usable(pickerModel({}, page, null));
    expect(model.chips).toEqual(['G', 'P', 'R', 'A']);
    expect(model.defaultKey).toBe('G');
  });

  it('offers only free keys', () => {
    expect(usable(pickerModel({ G: github, P: github }, page, null)).chips).toEqual(['R', 'A', 'I', 'T']);
  });

  it('defaults to the first free key in keyboard order when no letter fits', () => {
    const keymap = { ...fullBut('3', 'Q', 'Z') };
    for (const key of ['G', 'P', 'R', 'A', 'I', 'T', 'H', 'U', 'B'] as const) expect(keymap[key]).toBeDefined();
    const model = usable(pickerModel(keymap, page, null));
    expect(model.chips).toEqual([]);
    expect(model.defaultKey).toBe('3');
    expect(model.full).toBe(false);
  });

  it('has no chips and no default key when all 35 keys are in use', () => {
    const model = usable(pickerModel(fullBut(), page, null));
    expect(model).toMatchObject({ chips: [], defaultKey: null, full: true, picked: null });
  });

  it('never offers or defaults to S, even for a site starting with S', () => {
    const model = usable(pickerModel({}, { url: 'https://stackoverflow.com/', title: 'Stack Overflow' }, null));
    expect(model.chips).toEqual(['O', 'T', 'A', 'C']);
    expect(model.defaultKey).toBe('O');
  });
});

describe('pickerModel: the picked key', () => {
  it('is none when nothing is picked', () => {
    expect(usable(pickerModel({}, page, null)).picked).toBeNull();
  });

  it('is free on a free key', () => {
    expect(usable(pickerModel({}, page, 'K')).picked).toEqual({ kind: 'free', key: 'K' });
  });

  it("is a conflict on a taken key, with the old shortcut's Move target", () => {
    expect(usable(pickerModel({ G: github }, page, 'G')).picked).toEqual({
      kind: 'conflict',
      key: 'G',
      existing: github,
      // github's own fitting keys: G is taken, then I.
      moveTarget: 'I',
    });
  });

  it('is a conflict on the key that already holds this page', () => {
    const own = validShortcut({ link: page.url, name: 'Mine' });
    expect(usable(pickerModel({ K: own }, page, 'K')).picked).toMatchObject({ kind: 'conflict', existing: own });
  });

  it('has no Move target when the conflicting key is the last one left to fill', () => {
    const keymap = fullBut();
    expect(usable(pickerModel(keymap, page, 'K')).picked).toEqual({
      kind: 'conflict',
      key: 'K',
      existing: keymap.K,
      moveTarget: null,
    });
  });

  it('moves to the only free key when one is left', () => {
    const keymap = fullBut('Z');
    expect(usable(pickerModel(keymap, page, 'K')).picked).toMatchObject({ kind: 'conflict', moveTarget: 'Z' });
  });
});

describe('keyFromCode', () => {
  it.each([
    ['KeyK', 'K'],
    ['Digit2', '2'],
  ])('maps %s to %s', (code, key) => {
    expect(keyFromCode(code)).toBe(key);
  });

  it.each(['KeyS', 'Numpad2', 'Enter', 'Space', ''])('maps %j to nothing', (code) => {
    expect(keyFromCode(code)).toBeNull();
  });
});
