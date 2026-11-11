import type { Keymap } from './keymap-ops';
import { isAssignable, KEYBOARD_ORDER, type Key, type KeyLabel } from './keys';
import { mainLabel } from './link';
import type { Shortcut } from './shortcut';

const MAX_SUGGESTIONS = 4;
const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu;

/** The key labels in a text: accents folded (É → E), uppercased, and characters with no key dropped. */
function foldToLabels(text: string): KeyLabel[] {
  return (text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .match(/[A-Z0-9]/g) ?? []) as KeyLabel[];
}

/** The key label of a word's first character, or none when that character has no key. */
function initialLabel(word: string): KeyLabel[] {
  return foldToLabels(Array.from(word)[0] ?? '').slice(0, 1);
}

/**
 * Free keys that fit a page, best first (product spec §2.6): the first letter of the site's main label, then
 * the first letters of the title's words, then the main label's remaining letters. At most 4, never S.
 */
export function fittingKeys(keymap: Keymap, page: { link: string; title?: string }): Key[] {
  const label = foldToLabels(mainLabel(page.link));
  const titleInitials = (page.title?.match(WORD) ?? []).flatMap(initialLabel);
  const candidates = [...label.slice(0, 1), ...titleInitials, ...label.slice(1)];

  const fitting: Key[] = [];
  for (const candidate of candidates) {
    if (fitting.length === MAX_SUGGESTIONS) break;
    if (isAssignable(candidate) && keymap[candidate] === undefined && !fitting.includes(candidate)) {
      fitting.push(candidate);
    }
  }
  return fitting;
}

/** The first free key in keyboard order, or null when all 35 are in use. */
export function firstFreeKey(keymap: Keymap): Key | null {
  return KEYBOARD_ORDER.find((key) => keymap[key] === undefined) ?? null;
}

/** Where a displaced shortcut goes on a conflict-Move: a key that fits it, else the first free key. */
export function moveTarget(keymap: Keymap, old: Shortcut): Key | null {
  return fittingKeys(keymap, { link: old.link, title: old.name })[0] ?? firstFreeKey(keymap);
}
