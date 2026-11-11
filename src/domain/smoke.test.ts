// Throwaway: proves Vitest runs a plain domain test (no fakes, no setup). Replaced by item 03.
import { describe, expect, it } from 'vitest';

describe('domain smoke', () => {
  it('runs a pure assertion', () => {
    expect([1, 2, 3].map((n) => n * 2)).toEqual([2, 4, 6]);
  });
});
