import { describe, expect, it } from 'vitest';
import type { Keymap } from './keymap-ops';
import { KEYBOARD_ORDER } from './keys';
import { searchKeymap } from './search';
import { validShortcut } from './test-shortcut';

const keymap: Keymap = {
  Y: validShortcut({ link: 'youtube.com', name: 'YouTube' }),
  G: validShortcut({ link: 'github.com/pulls', name: 'Pull requests' }),
  M: validShortcut({ link: 'mail.google.com' }),
  '1': validShortcut({ link: 'localhost:3000', name: 'Dev server' }),
};

describe('searchKeymap in Options', () => {
  it('lists all 35 keys in keyboard order for an empty or blank query', () => {
    expect(searchKeymap(keymap, '', 'options')).toEqual(KEYBOARD_ORDER);
    expect(searchKeymap(keymap, '   ', 'options')).toEqual(KEYBOARD_ORDER);
  });

  it('matches names and links case-insensitively, in keyboard order', () => {
    expect(searchKeymap(keymap, 'GOOGLE', 'options')).toEqual(['M']);
    expect(searchKeymap(keymap, 'pull', 'options')).toEqual(['G']);
    expect(searchKeymap(keymap, '.com', 'options')).toEqual(['Y', 'G', 'M']);
    expect(searchKeymap(keymap, 'tube', 'options')).toEqual(['Y']);
  });

  it('matches a key by its label, free keys included', () => {
    expect(searchKeymap(keymap, 'y', 'options')).toEqual(['Y']);
    expect(searchKeymap(keymap, ' w ', 'options')).toEqual(['W']);
    expect(searchKeymap(keymap, '1', 'options')).toEqual(['1']);
  });

  it('lists the key match with substring matches', () => {
    expect(searchKeymap(keymap, '3', 'options')).toEqual(['1', '3']);
    expect(searchKeymap(keymap, 'q', 'options')).toEqual(['Q', 'G']);
  });

  it('never lists S', () => {
    expect(searchKeymap(keymap, 's', 'options')).toEqual(['1', 'Y', 'G', 'M']);
  });

  it('finds nothing for a query no shortcut holds', () => {
    expect(searchKeymap(keymap, 'zzz', 'options')).toEqual([]);
  });
});

describe('searchKeymap in the overlay', () => {
  it('lists the assigned keys in keyboard order for an empty or blank query', () => {
    expect(searchKeymap(keymap, '', 'overlay')).toEqual(['1', 'Y', 'G', 'M']);
    expect(searchKeymap(keymap, ' ', 'overlay')).toEqual(['1', 'Y', 'G', 'M']);
  });

  it('matches names and links, not key letters', () => {
    expect(searchKeymap(keymap, 'q', 'overlay')).toEqual(['G']);
    expect(searchKeymap(keymap, 'Y', 'overlay')).toEqual(['Y']);
    expect(searchKeymap(keymap, 'tube', 'overlay')).toEqual(['Y']);
    expect(searchKeymap(keymap, '3000', 'overlay')).toEqual(['1']);
    expect(searchKeymap(keymap, 'x', 'overlay')).toEqual([]);
  });
});
