import { describe, expect, it } from 'vitest';
import { firstFreeKey, fittingKeys, moveTarget } from './fitting-keys';
import type { Keymap } from './keymap-ops';
import { KEYBOARD_ORDER } from './keys';
import { validShortcut } from './test-shortcut';

const taken = validShortcut({ link: 'example.com' });
const keymapWith = (...keys: (typeof KEYBOARD_ORDER)[number][]): Keymap =>
  Object.fromEntries(keys.map((key) => [key, taken]));

describe('fittingKeys', () => {
  it('suggests the first letter of the main label first', () => {
    expect(fittingKeys({}, { link: 'https://github.com/' })[0]).toBe('G');
  });

  it('follows with the title words, then the rest of the main label, at most 4', () => {
    expect(fittingKeys({}, { link: 'https://github.com/', title: 'Pull requests · Octo' })).toEqual([
      'G',
      'P',
      'R',
      'O',
    ]);
    expect(fittingKeys({}, { link: 'https://github.com/' })).toEqual(['G', 'I', 'T', 'H']);
  });

  it('uses the main label, not subdomains or the country suffix', () => {
    expect(fittingKeys({}, { link: 'https://docs.google.com/' })).toEqual(['G', 'O', 'L', 'E']);
    expect(fittingKeys({}, { link: 'https://www.bbc.co.uk/' })).toEqual(['B', 'C']);
  });

  it('deduplicates candidates', () => {
    expect(fittingKeys({}, { link: 'https://aaa.com/', title: 'a A a' })).toEqual(['A']);
  });

  it('skips occupied keys', () => {
    expect(fittingKeys(keymapWith('G', 'I'), { link: 'https://github.com/' })).toEqual(['T', 'H', 'U', 'B']);
  });

  it('never suggests S', () => {
    expect(fittingKeys({}, { link: 'https://slack.com/', title: 'Slack' })).toEqual(['L', 'A', 'C', 'K']);
  });

  it('folds accents and skips letters with no key', () => {
    expect(fittingKeys({}, { link: 'https://ex.com/', title: 'Été Ölberg Ñandú' })).toEqual(['E', 'O', 'N', 'X']);
    expect(fittingKeys({}, { link: 'https://ex.com/', title: 'Почта 日本 Wiki' })).toEqual(['E', 'W', 'X']);
  });

  it('suggests digits from the site name', () => {
    expect(fittingKeys({}, { link: 'https://9gag.com/' })).toEqual(['9', 'G', 'A']);
  });

  it('gives no suggestion when nothing fits a free key', () => {
    expect(fittingKeys(keymapWith('B', 'C'), { link: 'https://bbc.co.uk/' })).toEqual([]);
  });
});

describe('firstFreeKey', () => {
  it('gives the first free key in keyboard order', () => {
    expect(firstFreeKey({})).toBe('1');
    expect(firstFreeKey(keymapWith('1', '2', '3'))).toBe('4');
    expect(firstFreeKey(keymapWith(...KEYBOARD_ORDER.slice(0, 20)))).toBe('A');
    expect(firstFreeKey(keymapWith(...KEYBOARD_ORDER.slice(0, 21)))).toBe('D');
  });

  it('gives null when all 35 keys are in use', () => {
    expect(firstFreeKey(keymapWith(...KEYBOARD_ORDER))).toBeNull();
  });
});

describe('moveTarget', () => {
  it('picks the first fitting key for the old shortcut, by its link and name', () => {
    expect(moveTarget(keymapWith('G'), validShortcut({ link: 'github.com', name: 'Work code' }))).toBe('W');
    expect(moveTarget(keymapWith('G'), validShortcut({ link: 'github.com' }))).toBe('I');
  });

  it('falls back to the first free key', () => {
    expect(moveTarget(keymapWith('B', 'C'), validShortcut({ link: 'bbc.co.uk' }))).toBe('1');
  });

  it('gives null when no key is free', () => {
    expect(moveTarget(keymapWith(...KEYBOARD_ORDER), validShortcut({ link: 'github.com' }))).toBeNull();
  });
});
