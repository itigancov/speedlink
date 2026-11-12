import { describe, expect, it } from 'vitest';
import { type PlanTab, planOpen } from './open-plan';
import type { ShortcutDraft } from './shortcut';
import { validShortcut } from './test-shortcut';

const LINK = 'https://docs.example.com/guide';

/** A tab in the current window (1) unless told otherwise. */
const tab = (id: number, fields: Partial<PlanTab> = {}): PlanTab => ({
  id,
  windowId: 1,
  index: id,
  url: 'https://other.example/',
  lastAccessed: id,
  pinned: false,
  incognito: false,
  groupId: -1,
  windowType: 'normal',
  ...fields,
});

const shortcut = (fields: Partial<ShortcutDraft> = {}) => validShortcut({ link: LINK, ...fields });

const current = tab(1, { index: 3 });

const plan = (fields: Partial<ShortcutDraft>, tabs: PlanTab[] = [current], force = false, currentTab = current) =>
  planOpen(shortcut(fields), { currentTab, tabs, force });

const createNext = {
  kind: 'create',
  url: 'https://docs.example.com/guide',
  windowId: 1,
  index: 4,
  openerTabId: 1,
  active: true,
  badge: 'target',
};

describe('planOpen: Smart switch', () => {
  it('does nothing when the current tab already matches, even with close current', () => {
    const onIt = tab(1, { url: 'https://docs.example.com/' });
    expect(plan({ openMode: 'smart', closeCurrent: true }, [onIt], false, onIt)).toEqual({ kind: 'noop' });
  });

  it('switches to the most recently used matching tab in the current window', () => {
    const tabs = [
      current,
      tab(5, { url: 'https://docs.example.com/a', lastAccessed: 10 }),
      tab(6, { url: 'https://docs.example.com/b', lastAccessed: 20 }),
    ];
    expect(plan({ openMode: 'smart' }, tabs)).toEqual({ kind: 'activate', tabId: 6, windowId: 1, badge: 'target' });
  });

  it('breaks a lastAccessed tie by the lower tab-strip index', () => {
    const tabs = [
      current,
      tab(5, { url: LINK, index: 7, lastAccessed: 10 }),
      tab(6, { url: LINK, index: 6, lastAccessed: 10 }),
    ];
    expect(plan({ openMode: 'smart' }, tabs)).toMatchObject({ kind: 'activate', tabId: 6 });
  });

  it('prefers a match in the current window over a more recent one elsewhere', () => {
    const tabs = [
      current,
      tab(5, { url: LINK, windowId: 2, lastAccessed: 99 }),
      tab(6, { url: LINK, lastAccessed: 1 }),
    ];
    expect(plan({ openMode: 'smart' }, tabs)).toMatchObject({ kind: 'activate', tabId: 6, windowId: 1 });
  });

  it('switches to the most recent match in another window, naming that window', () => {
    const tabs = [
      current,
      tab(5, { url: LINK, windowId: 2, lastAccessed: 10 }),
      tab(6, { url: LINK, windowId: 3, lastAccessed: 30 }),
    ];
    expect(plan({ openMode: 'smart' }, tabs)).toEqual({ kind: 'activate', tabId: 6, windowId: 3, badge: 'target' });
  });

  it('closes the current tab after switching when close current is on', () => {
    const tabs = [current, tab(5, { url: LINK })];
    expect(plan({ openMode: 'smart', closeCurrent: true }, tabs)).toEqual({
      kind: 'activate',
      tabId: 5,
      windowId: 1,
      closeTabId: 1,
      badge: 'target',
    });
  });

  it('never closes a pinned current tab', () => {
    const pinned = tab(1, { pinned: true });
    const tabs = [pinned, tab(5, { url: LINK })];
    expect(plan({ openMode: 'smart', closeCurrent: true }, tabs, false, pinned)).toEqual({
      kind: 'activate',
      tabId: 5,
      windowId: 1,
      badge: 'target',
    });
  });

  it('opens a new active tab next to the current one when nothing matches', () => {
    expect(plan({ openMode: 'smart' }, [current, tab(5)])).toEqual(createNext);
  });

  it('with no match and close current, opens next to the current tab and closes it', () => {
    expect(plan({ openMode: 'smart', closeCurrent: true })).toEqual({ ...createNext, closeTabId: 1 });
  });

  it.each([
    ['exact', 'https://docs.example.com/guide?x=1', false],
    ['page', 'https://docs.example.com/guide?x=1', true],
    ['page', 'https://docs.example.com/other', false],
    ['site', 'https://docs.example.com/other', true],
    ['site', 'https://example.com/guide', false],
  ] as const)('uses the shortcut tab match (%s, tab %s → match %s)', (tabMatch, url, matches) => {
    const result = plan({ openMode: 'smart', tabMatch }, [current, tab(5, { url })]);
    expect(result.kind).toBe(matches ? 'activate' : 'create');
  });

  it('never switches from a normal tab into an incognito one', () => {
    expect(plan({ openMode: 'smart' }, [current, tab(5, { url: LINK, incognito: true, windowId: 2 })])).toEqual(
      createNext,
    );
  });

  it('from an incognito tab, looks only at incognito tabs', () => {
    const privateTab = tab(1, { index: 3, incognito: true });
    const tabs = [
      privateTab,
      tab(5, { url: LINK, windowId: 2, lastAccessed: 99 }),
      tab(6, { url: LINK, incognito: true, windowId: 3 }),
    ];
    expect(plan({ openMode: 'smart' }, tabs, false, privateTab)).toMatchObject({ kind: 'activate', tabId: 6 });
  });

  it('ignores matching tabs in popup and app windows', () => {
    const tabs = [
      current,
      tab(5, { url: LINK, windowId: 2, windowType: 'popup' }),
      tab(6, { url: LINK, windowId: 3, windowType: 'app' }),
    ];
    expect(plan({ openMode: 'smart' }, tabs)).toEqual(createNext);
  });
});

describe('planOpen: New tab, Background tab, This tab', () => {
  it('New tab opens an active tab at the current index + 1 with the current tab as opener', () => {
    expect(plan({ openMode: 'new' })).toEqual(createNext);
  });

  it('New tab opens even when a tab already matches', () => {
    expect(plan({ openMode: 'new' }, [current, tab(5, { url: LINK })])).toEqual(createNext);
  });

  it('New tab with close current closes the current tab', () => {
    expect(plan({ openMode: 'new', closeCurrent: true })).toEqual({ ...createNext, closeTabId: 1 });
  });

  it('Background tab opens an inactive tab next to the current one and badges the current tab', () => {
    expect(plan({ openMode: 'bg' }, [current, tab(5, { url: LINK })])).toEqual({
      ...createNext,
      active: false,
      badge: 'current',
    });
  });

  it('Background tab with close current opens the tab active and closes the current one', () => {
    expect(plan({ openMode: 'bg', closeCurrent: true })).toEqual({ ...createNext, closeTabId: 1 });
  });

  it('Background tab with close current on a pinned tab stays in the background and keeps the tab', () => {
    const pinned = tab(1, { index: 3, pinned: true });
    expect(plan({ openMode: 'bg', closeCurrent: true }, [pinned], false, pinned)).toEqual({
      ...createNext,
      active: false,
      badge: 'current',
    });
  });

  it('a new tab joins the current tab group', () => {
    const grouped = tab(1, { index: 3, groupId: 42 });
    expect(plan({ openMode: 'new' }, [grouped], false, grouped)).toEqual({ ...createNext, groupId: 42 });
  });

  it('from a window that is not normal, creates without a window, index or opener', () => {
    const inPopup = tab(1, { index: 0, windowType: 'popup', groupId: -1 });
    expect(plan({ openMode: 'new' }, [inPopup], false, inPopup)).toEqual({
      kind: 'create',
      url: LINK,
      active: true,
      badge: 'target',
    });
  });

  it('This tab loads the link in the current tab', () => {
    expect(plan({ openMode: 'this' })).toEqual({ kind: 'update', tabId: 1, url: LINK, badge: 'target' });
  });

  it('This tab ignores close current', () => {
    expect(plan({ openMode: 'this', closeCurrent: true })).toEqual({
      kind: 'update',
      tabId: 1,
      url: LINK,
      badge: 'target',
    });
  });
});

describe('planOpen: Force new tab', () => {
  it.each(['smart', 'new', 'this', 'bg'] as const)(
    'opens a new active tab next to the current one in %s mode, ignoring close current',
    (openMode) => {
      expect(plan({ openMode, closeCurrent: true }, [current, tab(5, { url: LINK })], true)).toEqual(createNext);
    },
  );

  it('opens a new tab even when the current tab matches', () => {
    const onIt = tab(1, { index: 3, url: LINK });
    expect(plan({ openMode: 'smart' }, [onIt], true, onIt)).toEqual(createNext);
  });
});
