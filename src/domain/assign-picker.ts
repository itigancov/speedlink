// The popup's key picker (product spec §7): what it draws for a tab's page and the picked key. It only assembles
// the shared rules, so the popup can't drift from what the background's `planAssign` does.
import { pageShortcut, type TabPage } from './assign-plan';
import { firstFreeKey, fittingKeys, moveTarget } from './fitting-keys';
import type { Keymap } from './keymap-ops';
import { isAssignable, KEYBOARD_ORDER, type Key, keyLabelFromCode } from './keys';
import type { Shortcut } from './shortcut';
import { tabMatches } from './tab-match';

export type PickedKey =
  | { readonly kind: 'free'; readonly key: Key }
  /** The key holds `existing`; Move would put it on `moveTarget` (null when no key is free). */
  | { readonly kind: 'conflict'; readonly key: Key; readonly existing: Shortcut; readonly moveTarget: Key | null };

export type PickerModel =
  | { readonly usable: false }
  | {
      readonly usable: true;
      /** What the page becomes on a key, with the default open mode. */
      readonly shortcut: Shortcut;
      /** Keys whose shortcut matches the tab by its own tab match, in keyboard order. */
      readonly alreadyOn: readonly Key[];
      /** Free & fitting keys, at most 4. */
      readonly chips: readonly Key[];
      /** The first chip, else the first free key; null when all 35 are in use. */
      readonly defaultKey: Key | null;
      readonly full: boolean;
      readonly picked: PickedKey | null;
    };

/** A page that can't go on a key (§4.6) is unusable, and nothing else is worked out for it. */
export function pickerModel(keymap: Keymap, page: TabPage, picked: Key | null): PickerModel {
  const shortcut = pageShortcut(page);
  if (shortcut === null) return { usable: false };

  const alreadyOn = KEYBOARD_ORDER.filter((key) => {
    const existing = keymap[key];
    return existing !== undefined && tabMatches(page.url, existing.link, existing.tabMatch);
  });
  const chips = fittingKeys(keymap, { link: shortcut.link, title: page.title });
  const free = firstFreeKey(keymap);
  return {
    usable: true,
    shortcut,
    alreadyOn,
    chips,
    defaultKey: chips[0] ?? free,
    full: free === null,
    picked: picked === null ? null : pickedKey(keymap, picked),
  };
}

function pickedKey(keymap: Keymap, key: Key): PickedKey {
  const existing = keymap[key];
  if (existing === undefined) return { kind: 'free', key };
  return { kind: 'conflict', key, existing, moveTarget: moveTarget(keymap, existing) };
}

/** The key a physical key press picks, by `event.code`; S and every code off the grid pick nothing. */
export function keyFromCode(code: string): Key | null {
  const label = keyLabelFromCode(code);
  return label !== null && isAssignable(label) ? label : null;
}
