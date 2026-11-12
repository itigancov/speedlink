// What pressing a key should do to the tabs (product spec §4.1): a pure plan, executed by platform/tabs.
import type { Shortcut } from './shortcut';
import { tabMatches } from './tab-match';

/** An open tab as plain data. `groupId` is -1 when the tab is in no group. */
export interface PlanTab {
  id: number;
  windowId: number;
  index: number;
  url: string;
  /** The page title, '' when Chrome gives none. */
  title: string;
  lastAccessed: number;
  pinned: boolean;
  incognito: boolean;
  groupId: number;
  /** The type of the tab's window: `normal`, `popup`, `app`, … */
  windowType: string;
}

/**
 * Which tab's badge flashes: `target` is the tab the plan opens or activates, `current` the tab the key was
 * pressed on (Background tab, which leaves the user where they are).
 */
export type BadgeTarget = 'target' | 'current';

export type OpenPlan =
  | { kind: 'noop' }
  | { kind: 'activate'; tabId: number; windowId: number; closeTabId?: number; badge: 'target' }
  | {
      kind: 'create';
      url: string;
      /** Omitted, with `index` and `openerTabId`, when the current window is not normal: Chrome picks one. */
      windowId?: number;
      index?: number;
      openerTabId?: number;
      active: boolean;
      groupId?: number;
      closeTabId?: number;
      badge: BadgeTarget;
    }
  | { kind: 'update'; tabId: number; url: string; badge: 'target' };

export interface OpenContext {
  /** The tab the key was pressed on. */
  currentTab: PlanTab;
  /** Every open tab, the current one included. */
  tabs: readonly PlanTab[];
  /** Force new tab (⌥⇧+key): a new tab this once, whatever the open mode and close current. */
  force: boolean;
}

const NO_GROUP = -1;

/** Most recently used first; a tie goes to the lower tab-strip position. */
const mostRecent = (tabs: readonly PlanTab[]): PlanTab | undefined =>
  [...tabs].sort((a, b) => b.lastAccessed - a.lastAccessed || a.index - b.index || a.windowId - b.windowId)[0];

/** Smart switch's winner: the current window first, then the others. Only normal windows, same incognito state. */
function smartTarget(shortcut: Shortcut, { currentTab, tabs }: OpenContext): PlanTab | undefined {
  const matching = tabs.filter(
    (tab) =>
      tab.windowType === 'normal' &&
      tab.incognito === currentTab.incognito &&
      tabMatches(tab.url, shortcut.link, shortcut.tabMatch),
  );
  return (
    mostRecent(matching.filter((tab) => tab.windowId === currentTab.windowId)) ??
    mostRecent(matching.filter((tab) => tab.windowId !== currentTab.windowId))
  );
}

function createNext(url: string, currentTab: PlanTab, active: boolean, closeTabId: number | undefined): OpenPlan {
  const inNormalWindow = currentTab.windowType === 'normal';
  return {
    kind: 'create',
    url,
    ...(inNormalWindow
      ? { windowId: currentTab.windowId, index: currentTab.index + 1, openerTabId: currentTab.id }
      : {}),
    active,
    ...(inNormalWindow && currentTab.groupId !== NO_GROUP ? { groupId: currentTab.groupId } : {}),
    ...(closeTabId === undefined ? {} : { closeTabId }),
    badge: active ? 'target' : 'current',
  };
}

export function planOpen(shortcut: Shortcut, context: OpenContext): OpenPlan {
  const { currentTab, force } = context;
  const { link, openMode } = shortcut;
  if (force) return createNext(link, currentTab, true, undefined);

  // Close current never applies to This tab or a pinned tab; a noop never closes anything.
  const closeTabId = shortcut.closeCurrent && !currentTab.pinned ? currentTab.id : undefined;

  switch (openMode) {
    case 'this':
      return { kind: 'update', tabId: currentTab.id, url: link, badge: 'target' };
    case 'new':
      return createNext(link, currentTab, true, closeTabId);
    case 'bg':
      // With close current the new tab must become active as the current one closes.
      return createNext(link, currentTab, closeTabId !== undefined, closeTabId);
    case 'smart': {
      if (tabMatches(currentTab.url, link, shortcut.tabMatch)) return { kind: 'noop' };
      const target = smartTarget(shortcut, context);
      if (target === undefined) return createNext(link, currentTab, true, closeTabId);
      return {
        kind: 'activate',
        tabId: target.id,
        windowId: target.windowId,
        ...(closeTabId === undefined ? {} : { closeTabId }),
        badge: 'target',
      };
    }
  }
}

/**
 * Options' Try ⌥K (product spec §8.5): the shortcut as it opens from Options, which must never be replaced or
 * closed. This tab becomes New tab and close current is dropped; every other field, unknown ones too, is kept.
 * Only enum fields change, to valid values, so the result is still a valid `Shortcut`.
 */
export function trialShortcut(shortcut: Shortcut): Shortcut {
  return {
    ...shortcut,
    openMode: shortcut.openMode === 'this' ? 'new' : shortcut.openMode,
    closeCurrent: false,
  } as unknown as Shortcut;
}
