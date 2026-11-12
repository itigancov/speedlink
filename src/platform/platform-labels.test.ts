import { describe, expect, it } from 'vitest';
import { chordLabel, modifierRow, platformFrom, triggerLabel, triggerWord } from './platform-labels';

const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const CHROMEOS =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe('platformFrom', () => {
  it.each([
    ['macOS', MAC, 'mac'],
    ['Windows', WINDOWS, 'other'],
    ['Linux', LINUX, 'other'],
    ['ChromeOS', CHROMEOS, 'other'],
    ['an empty user agent', '', 'other'],
  ] as const)('%s is %s', (_, userAgent, platform) => {
    expect(platformFrom(userAgent)).toBe(platform);
  });
});

describe('trigger labels', () => {
  it('reads "⌥ Option" on a Mac and "Alt" elsewhere', () => {
    expect(triggerLabel('mac')).toBe('⌥ Option');
    expect(triggerLabel('other')).toBe('Alt');
  });

  it('gives the bare word for accessible names', () => {
    expect(triggerWord('mac')).toBe('Option');
    expect(triggerWord('other')).toBe('Alt');
  });

  it('writes a chord as "⌥K" on a Mac and "Alt+K" elsewhere', () => {
    expect(chordLabel('K', 'mac')).toBe('⌥K');
    expect(chordLabel('K', 'other')).toBe('Alt+K');
    expect(chordLabel('7', 'other')).toBe('Alt+7');
  });
});

describe('modifierRow', () => {
  it('is fn ⌃ ⌥ ⌘, space, ⌘ on a Mac, with ⌥ highlighted', () => {
    expect(modifierRow('mac')).toEqual([
      { label: 'fn', highlighted: false, wide: false },
      { label: '⌃', highlighted: false, wide: false },
      { label: '⌥ option', highlighted: true, wide: false },
      { label: '⌘', highlighted: false, wide: false },
      { label: 'space', highlighted: false, wide: true },
      { label: '⌘', highlighted: false, wide: false },
    ]);
  });

  it('is Ctrl · Alt · space · Alt · Ctrl elsewhere, with the first Alt highlighted', () => {
    expect(modifierRow('other')).toEqual([
      { label: 'Ctrl', highlighted: false, wide: false },
      { label: 'Alt', highlighted: true, wide: false },
      { label: 'space', highlighted: false, wide: true },
      { label: 'Alt', highlighted: false, wide: false },
      { label: 'Ctrl', highlighted: false, wide: false },
    ]);
  });
});
