import { describe, expect, it } from 'vitest';
import { type BrowserOs, classifyKeydown, type KeydownInput, pageKeyDecision } from './keydown';
import type { Key } from './keys';

/** ⌥ + K, nothing else held, on a normal page target. */
const press = (fields: Partial<KeydownInput> = {}): KeydownInput => ({
  code: 'KeyK',
  altKey: true,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altGraph: false,
  repeat: false,
  composing: false,
  editable: false,
  ...fields,
});

const assigned =
  (...keys: Key[]) =>
  (key: Key) =>
    keys.includes(key);
const everything = () => true;
const nothing = () => false;

describe('classifyKeydown: the trigger', () => {
  it('opens an assigned key on ⌥ + key', () => {
    expect(classifyKeydown(press(), 'mac', assigned('K'))).toEqual({ kind: 'open', key: 'K', force: false });
  });

  it('opens a digit key by its physical position', () => {
    expect(classifyKeydown(press({ code: 'Digit7' }), 'mac', assigned('7'))).toEqual({
      kind: 'open',
      key: '7',
      force: false,
    });
  });

  it('ignores a key without ⌥', () => {
    expect(classifyKeydown(press({ altKey: false }), 'mac', everything)).toEqual({ kind: 'ignore' });
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['⌘ / Win', { metaKey: true }],
    ['AltGr', { altGraph: true }],
  ])('ignores ⌥ + key with %s', (_, fields) => {
    expect(classifyKeydown(press(fields), 'windows', everything)).toEqual({ kind: 'ignore' });
  });

  it.each(['Numpad1', 'Space', 'Comma', 'AltLeft', 'F1', ''])('ignores %s, which is not on the grid', (code) => {
    expect(classifyKeydown(press({ code }), 'mac', everything)).toEqual({ kind: 'ignore' });
  });
});

describe('classifyKeydown: guards', () => {
  it('ignores a press in an editable field', () => {
    expect(classifyKeydown(press({ editable: true }), 'mac', everything)).toEqual({ kind: 'ignore' });
  });

  it('ignores a press during IME composition', () => {
    expect(classifyKeydown(press({ composing: true }), 'mac', everything)).toEqual({ kind: 'ignore' });
  });

  it('ignores a held key in an editable field rather than swallowing it', () => {
    expect(classifyKeydown(press({ editable: true, repeat: true }), 'mac', everything)).toEqual({ kind: 'ignore' });
  });

  it.each([
    ['an assigned key', everything],
    ['a free key', nothing],
  ])('swallows the repeats of %s without opening it again', (_, isAssigned) => {
    expect(classifyKeydown(press({ repeat: true }), 'windows', isAssigned)).toEqual({ kind: 'suppress' });
  });

  it('swallows the repeats of a free browser key too', () => {
    expect(classifyKeydown(press({ code: 'KeyD', repeat: true }), 'windows', nothing)).toEqual({ kind: 'suppress' });
  });
});

describe('classifyKeydown: S, the reserved key', () => {
  it.each([
    ['⌥S', false],
    ['⌥⇧S', true],
  ])('%s is reserved', (_, shiftKey) => {
    expect(classifyKeydown(press({ code: 'KeyS', shiftKey }), 'linux', nothing)).toEqual({ kind: 'reserved' });
  });
});

describe('classifyKeydown: Force new tab', () => {
  it('⌥⇧ + an assigned key opens with force', () => {
    expect(classifyKeydown(press({ shiftKey: true }), 'mac', assigned('K'))).toEqual({
      kind: 'open',
      key: 'K',
      force: true,
    });
  });

  it.each(['mac', 'windows', 'linux', 'chromeos'] as const)('⌥⇧ + a free key passes through on %s', (os) => {
    expect(classifyKeydown(press({ shiftKey: true }), os, nothing)).toEqual({ kind: 'pass' });
  });
});

describe('classifyKeydown: free keys and the browser’s own Alt keys', () => {
  const DIGITS_1_TO_9 = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
  const PASS_THROUGH: Record<BrowserOs, readonly Key[]> = {
    mac: [],
    windows: ['D', 'E', 'F'],
    linux: ['D', 'E', 'F', ...DIGITS_1_TO_9],
    chromeos: ['E', 'F', ...DIGITS_1_TO_9],
  };
  const ALL_KEYS = [...'ABCDEFGHIJKLMNOPQRTUVWXYZ', '0', ...DIGITS_1_TO_9] as Key[];
  const code = (key: Key) => (/[0-9]/.test(key) ? `Digit${key}` : `Key${key}`);

  for (const os of ['mac', 'windows', 'linux', 'chromeos'] as const) {
    it(`on ${os}, passes exactly its free browser keys and asks the background about every other free key`, () => {
      const passed = ALL_KEYS.filter((key) => classifyKeydown(press({ code: code(key) }), os, nothing).kind === 'pass');
      expect(passed).toEqual(PASS_THROUGH[os]);
      const asked = ALL_KEYS.filter((key) => !PASS_THROUGH[os].includes(key));
      for (const key of asked) {
        expect(classifyKeydown(press({ code: code(key) }), os, nothing)).toEqual({ kind: 'open', key, force: false });
      }
    });

    it.each(PASS_THROUGH[os])(`on ${os}, an assigned %s wins over the browser`, (key) => {
      expect(classifyKeydown(press({ code: code(key) }), os, assigned(key))).toEqual({
        kind: 'open',
        key,
        force: false,
      });
    });
  }

  it('0 is never a browser key', () => {
    expect(classifyKeydown(press({ code: 'Digit0' }), 'linux', nothing)).toEqual({
      kind: 'open',
      key: '0',
      force: false,
    });
  });
});

describe('pageKeyDecision: a bare key on Options', () => {
  /** K with nothing held, on a non-editable target. */
  const bare = (fields: Partial<KeydownInput> = {}): KeydownInput => press({ altKey: false, ...fields });
  const idle = { selected: null, dragActive: false };

  it('selects a letter or a digit with the dialog closed', () => {
    expect(pageKeyDecision(bare(), idle)).toEqual({ kind: 'select', key: 'K' });
    expect(pageKeyDecision(bare({ code: 'Digit0' }), idle)).toEqual({ kind: 'select', key: '0' });
  });

  it('selects another key with the dialog open', () => {
    expect(pageKeyDecision(bare({ code: 'KeyG' }), { selected: 'K', dragActive: false })).toEqual({
      kind: 'select',
      key: 'G',
    });
  });

  it.each<[string, Partial<KeydownInput>]>([
    ['⌥', { altKey: true }],
    ['⇧', { shiftKey: true }],
    ['⌘', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['AltGr', { altGraph: true }],
    ['a repeat', { repeat: true }],
    ['composing', { composing: true }],
    ['an editable target', { editable: true }],
    ['S', { code: 'KeyS' }],
    ['a non-key code', { code: 'Slash' }],
    ['a numpad digit', { code: 'Numpad1' }],
  ])('ignores %s', (_name, fields) => {
    expect(pageKeyDecision(bare(fields), idle)).toEqual({ kind: 'ignore' });
  });

  it('ignores a key during a drag', () => {
    expect(pageKeyDecision(bare(), { selected: null, dragActive: true })).toEqual({ kind: 'ignore' });
  });

  it('ignores the key already selected', () => {
    expect(pageKeyDecision(bare(), { selected: 'K', dragActive: false })).toEqual({ kind: 'ignore' });
  });
});
