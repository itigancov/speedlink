import { describe, expect, it } from 'vitest';
import { neighbourKey } from './key-grid';
import { KEYBOARD_ORDER } from './keys';

describe('neighbourKey', () => {
  it('moves left and right within a row', () => {
    expect(neighbourKey('Y', 'right')).toBe('U');
    expect(neighbourKey('Y', 'left')).toBe('T');
    expect(neighbourKey('5', 'right')).toBe('6');
  });

  it('does not wrap at the ends of a row', () => {
    expect(neighbourKey('1', 'left')).toBeNull();
    expect(neighbourKey('0', 'right')).toBeNull();
    expect(neighbourKey('P', 'right')).toBeNull();
    expect(neighbourKey('Z', 'left')).toBeNull();
    expect(neighbourKey('M', 'right')).toBeNull();
  });

  it('steps over S both ways', () => {
    expect(neighbourKey('A', 'right')).toBe('D');
    expect(neighbourKey('D', 'left')).toBe('A');
  });

  it('goes up and down to the nearest key across each stagger', () => {
    // Row offsets of 0, 22, 36 and 58 px over a 64 px key pitch: each row sits a little right of the one above.
    expect(neighbourKey('Q', 'up')).toBe('1');
    expect(neighbourKey('1', 'down')).toBe('Q');
    expect(neighbourKey('T', 'up')).toBe('5');
    expect(neighbourKey('5', 'down')).toBe('T');
    expect(neighbourKey('G', 'up')).toBe('T');
    expect(neighbourKey('T', 'down')).toBe('G');
    expect(neighbourKey('B', 'up')).toBe('G');
    expect(neighbourKey('G', 'down')).toBe('B');
    expect(neighbourKey('Q', 'down')).toBe('A');
    expect(neighbourKey('Z', 'up')).toBe('A');
    expect(neighbourKey('E', 'down')).toBe('D');
  });

  it('replaces a landing on S with the nearest assignable key in that row', () => {
    expect(neighbourKey('W', 'down')).toBe('A');
    expect(neighbourKey('X', 'up')).toBe('D');
  });

  it('keeps to the end of a shorter row', () => {
    expect(neighbourKey('P', 'down')).toBe('L');
    expect(neighbourKey('L', 'down')).toBe('M');
  });

  it('returns nothing above the top row or below the bottom row', () => {
    expect(neighbourKey('5', 'up')).toBeNull();
    expect(neighbourKey('B', 'down')).toBeNull();
  });

  it('never returns S', () => {
    for (const key of KEYBOARD_ORDER) {
      for (const direction of ['left', 'right', 'up', 'down'] as const) {
        expect(neighbourKey(key, direction)).not.toBe('S');
      }
    }
  });
});
