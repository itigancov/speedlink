// Every trigger label (product spec §4.7). Mac vs everything else is decided once, synchronously, from the user
// agent; the text lives in en.yml. Each label function takes the platform for tests and the gallery.
import type { BrowserOs } from '@/domain/keydown';
import type { KeyLabel } from '@/domain/keys';

export type Platform = 'mac' | 'other';

/** Mac = macOS user agents. Windows, Linux and ChromeOS are all `other`. */
export function platformFrom(userAgent: string): Platform {
  return /Macintosh|Mac OS X/.test(userAgent) ? 'mac' : 'other';
}

/** `navigator` exists in pages, content scripts and the service worker. */
const USER_AGENT = globalThis.navigator?.userAgent ?? '';

/** The platform this context runs on. */
export const PLATFORM: Platform = platformFrom(USER_AGENT);

/**
 * The OS by name, for the free browser keys a trigger leaves alone (§4.3) and nothing else: labels stay Mac vs
 * other. ChromeOS's user agent also says Linux, so it is checked first.
 */
export function browserOsFrom(userAgent: string): BrowserOs {
  if (/CrOS/.test(userAgent)) return 'chromeos';
  if (/Windows/.test(userAgent)) return 'windows';
  if (platformFrom(userAgent) === 'mac') return 'mac';
  return 'linux';
}

const BROWSER_OS = browserOsFrom(USER_AGENT);

/** The OS of this context's browser. */
export function browserOs(): BrowserOs {
  return BROWSER_OS;
}

/** The locale keys for each platform's trigger text. */
const TRIGGER_KEYS = {
  mac: {
    label: 'platform.mac.trigger',
    word: 'platform.mac.triggerWord',
    chord: 'platform.mac.chord',
    plusKey: 'platform.mac.plusKey',
  },
  other: {
    label: 'platform.other.trigger',
    word: 'platform.other.triggerWord',
    chord: 'platform.other.chord',
    plusKey: 'platform.other.plusKey',
  },
} as const;

/** "⌥ Option" or "Alt". */
export function triggerLabel(platform: Platform = PLATFORM): string {
  return i18n.t(TRIGGER_KEYS[platform].label);
}

/** "Option" or "Alt", for accessible names. */
export function triggerWord(platform: Platform = PLATFORM): string {
  return i18n.t(TRIGGER_KEYS[platform].word);
}

/** "⌥K" or "Alt+K". */
export function chordLabel(key: KeyLabel, platform: Platform = PLATFORM): string {
  return i18n.t(TRIGGER_KEYS[platform].chord, [key]);
}

/** "⌥ + key" or "Alt + key", for copy about every key at once. */
export function triggerPlusKey(platform: Platform = PLATFORM): string {
  return i18n.t(TRIGGER_KEYS[platform].plusKey);
}

export interface ModifierKey {
  label: string;
  /** The trigger the user holds. */
  highlighted: boolean;
  /** The space bar. */
  wide: boolean;
}

const modifier = (label: string, highlighted = false, wide = false): ModifierKey => ({ label, highlighted, wide });

/** The decorative bottom row of the keyboard picture, left to right. */
export function modifierRow(platform: Platform = PLATFORM): ModifierKey[] {
  const space = modifier(i18n.t('platform.space'), false, true);
  if (platform === 'mac') {
    const command = modifier(i18n.t('platform.mac.command'));
    return [
      modifier(i18n.t('platform.mac.fn')),
      modifier(i18n.t('platform.mac.control')),
      modifier(i18n.t('platform.mac.option'), true),
      command,
      space,
      command,
    ];
  }
  const control = modifier(i18n.t('platform.other.control'));
  return [
    control,
    modifier(i18n.t('platform.other.alt'), true),
    space,
    modifier(i18n.t('platform.other.alt')),
    control,
  ];
}
