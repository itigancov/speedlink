import { describe, expect, it } from 'vitest';
import { codeOf, isAssignable, KEYBOARD_ORDER, KEYBOARD_ROWS, keyLabelFromCode } from './keys';

describe('keyLabelFromCode', () => {
  it.each([
    ['KeyA', 'A'],
    ['KeyZ', 'Z'],
    ['KeyS', 'S'],
    ['Digit0', '0'],
    ['Digit9', '9'],
  ])('maps %s to %s', (code, label) => {
    expect(keyLabelFromCode(code)).toBe(label);
  });

  it.each(['Numpad1', 'Numpad0', 'Space', 'AltLeft', 'Keya', 'Digit10', 'KeyAA', ''])('gives null for %s', (code) => {
    expect(keyLabelFromCode(code)).toBeNull();
  });
});

describe('codeOf', () => {
  it('maps labels back to physical codes', () => {
    expect(codeOf('Y')).toBe('KeyY');
    expect(codeOf('S')).toBe('KeyS');
    expect(codeOf('7')).toBe('Digit7');
  });
});

describe('isAssignable', () => {
  it('rejects S, the reserved key', () => {
    expect(isAssignable('S')).toBe(false);
  });

  it('accepts every other label', () => {
    expect(isAssignable('A')).toBe(true);
    expect(isAssignable('0')).toBe(true);
  });
});

describe('keyboard layout', () => {
  it('lists the four keyboard rows, S included', () => {
    expect(KEYBOARD_ROWS.map((row) => row.join(''))).toEqual(['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']);
  });

  it('orders the 35 assignable keys by keyboard row, without S', () => {
    expect(KEYBOARD_ORDER.join('')).toBe('1234567890QWERTYUIOPADFGHJKLZXCVBNM');
    expect(KEYBOARD_ORDER).toHaveLength(35);
  });
});
