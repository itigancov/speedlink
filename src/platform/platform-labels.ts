// Every trigger label (product spec §4.7). Mac vs everything else is decided once, synchronously, from the user
// agent; the text lives in en.yml. Each label function takes the platform for tests and the gallery.
import type { KeyLabel } from '@/domain/keys';

export type Platform = 'mac' | 'other';

/** Mac = macOS user agents. Windows, Linux and ChromeOS are all `other`. */
export function platformFrom(userAgent: string): Platform {
  return /Macintosh|Mac OS X/.test(userAgent) ? 'mac' : 'other';
}

/** The platform this context runs on. `navigator` exists in pages, content scripts and the service worker. */
export const PLATFORM: Platform = platformFrom(globalThis.navigator?.userAgent ?? '');

/** The locale keys for each platform's trigger text. */
const TRIGGER_KEYS = {
  mac: { label: 'platform.mac.trigger', word: 'platform.mac.triggerWord', chord: 'platform.mac.chord' },
  other: { label: 'platform.other.trigger', word: 'platform.other.triggerWord', chord: 'platform.other.chord' },
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
