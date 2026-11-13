// What the overlay shows (product spec §5.4): one tile per assigned key, with what pressing it will do. Built by the
// background from the fresh keymap and tabs; the HUD turns the sublines into text.
import type { Keymap } from './keymap-ops';
import { KEYBOARD_ORDER, type Key } from './keys';
import { siteOf } from './link';
import { type PlanTab, smartTarget } from './open-plan';
import { displayName, type OpenMode, type Shortcut } from './shortcut';
import { tabMatches } from './tab-match';

/**
 * - `tab`: Smart switch stays in this window, on the tab at 1-based position `index` (the current tab included).
 * - `other-window`: Smart switch raises another window.
 * - `mode`: anything else; the HUD shows the site for Smart and the open mode otherwise.
 */
export type OverlaySubline =
  | { kind: 'tab'; index: number }
  | { kind: 'other-window' }
  | { kind: 'mode'; mode: OpenMode; site: string };

export interface OverlayTile {
  key: Key;
  /** The shortcut's name, else its link's site. */
  name: string;
  subline: OverlaySubline;
}

/** No tiles is the empty state. */
export interface OverlayModel {
  tiles: OverlayTile[];
}

function sublineOf(shortcut: Shortcut, tabs: readonly PlanTab[], currentTab: PlanTab): OverlaySubline {
  const mode: OverlaySubline = { kind: 'mode', mode: shortcut.openMode, site: siteOf(shortcut.link) };
  if (shortcut.openMode !== 'smart') return mode;
  // As `planOpen`: the current tab first (a press does nothing), then Smart switch's winner.
  const target = tabMatches(currentTab.url, shortcut.link, shortcut.tabMatch)
    ? currentTab
    : smartTarget(shortcut, { currentTab, tabs });
  if (target === undefined) return mode;
  return target.windowId === currentTab.windowId ? { kind: 'tab', index: target.index + 1 } : { kind: 'other-window' };
}

export function buildOverlayModel(keymap: Keymap, tabs: readonly PlanTab[], currentTab: PlanTab): OverlayModel {
  return {
    tiles: KEYBOARD_ORDER.flatMap((key) => {
      const shortcut = keymap[key];
      return shortcut === undefined
        ? []
        : [{ key, name: displayName(shortcut), subline: sublineOf(shortcut, tabs, currentTab) }];
    }),
  };
}
