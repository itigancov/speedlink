import { describe, expect, it } from 'vitest';
import type { Keymap } from './keymap-ops';
import type { PlanTab } from './open-plan';
import { buildOverlayModel } from './overlay-model';
import type { ShortcutDraft } from './shortcut';
import { validShortcut } from './test-shortcut';

/** A tab in the current window (1) unless told otherwise. */
const tab = (id: number, fields: Partial<PlanTab> = {}): PlanTab => ({
  id,
  windowId: 1,
  index: id,
  url: 'https://other.example/',
  title: 'Other',
  lastAccessed: id,
  pinned: false,
  incognito: false,
  groupId: -1,
  windowType: 'normal',
  ...fields,
});

const current = tab(1, { index: 0 });

const docs = (fields: Partial<ShortcutDraft> = {}) =>
  validShortcut({ link: 'https://docs.example.com/guide', name: 'Docs', openMode: 'smart', ...fields });

/** The one tile of a keymap holding `docs` on K. */
const tileOf = (fields: Partial<ShortcutDraft>, tabs: PlanTab[], currentTab = current) =>
  buildOverlayModel({ K: docs(fields) }, tabs, currentTab).tiles[0];

describe('buildOverlayModel: tiles', () => {
  it('gives no tiles for an empty keymap', () => {
    expect(buildOverlayModel({}, [current], current)).toEqual({ tiles: [] });
  });

  it('lists only assigned keys, in keyboard order', () => {
    const keymap: Keymap = { Z: docs(), '1': docs(), Q: docs(), A: docs() };
    expect(buildOverlayModel(keymap, [current], current).tiles.map((tile) => tile.key)).toEqual(['1', 'Q', 'A', 'Z']);
  });

  it('names a tile by its name, else by its link’s site', () => {
    const keymap: Keymap = { G: docs({ name: 'Guide' }), Y: validShortcut({ link: 'https://www.youtube.com/feed' }) };
    expect(buildOverlayModel(keymap, [current], current).tiles.map((tile) => tile.name)).toEqual([
      'youtube.com',
      'Guide',
    ]);
  });
});

describe('buildOverlayModel: sublines', () => {
  it('names the position of the tab Smart switch would switch to in this window', () => {
    const tabs = [
      current,
      tab(5, { index: 4, url: 'https://docs.example.com/a', lastAccessed: 10 }),
      tab(6, { index: 2, url: 'https://docs.example.com/b', lastAccessed: 20 }),
    ];
    expect(tileOf({}, tabs)?.subline).toEqual({ kind: 'tab', index: 3 });
  });

  it('names the current tab when it is the match', () => {
    const onIt = tab(1, { index: 6, url: 'https://docs.example.com/' });
    expect(tileOf({}, [onIt], onIt)?.subline).toEqual({ kind: 'tab', index: 7 });
  });

  it('prefers a match in this window over a more recent one elsewhere', () => {
    const tabs = [
      current,
      tab(5, { index: 1, url: 'https://docs.example.com/a', lastAccessed: 10 }),
      tab(6, { windowId: 2, index: 0, url: 'https://docs.example.com/b', lastAccessed: 50 }),
    ];
    expect(tileOf({}, tabs)?.subline).toEqual({ kind: 'tab', index: 2 });
  });

  it('says other window when the only match is in another window', () => {
    const tabs = [current, tab(6, { windowId: 2, url: 'https://docs.example.com/b' })];
    expect(tileOf({}, tabs)?.subline).toEqual({ kind: 'other-window' });
  });

  it('counts matches by the shortcut’s own tab match', () => {
    const tabs = [current, tab(5, { url: 'https://docs.example.com/other' })];
    expect(tileOf({ tabMatch: 'page' }, tabs)?.subline).toEqual({
      kind: 'mode',
      mode: 'smart',
      site: 'docs.example.com',
    });
  });

  it('shows no open tab across incognito', () => {
    const tabs = [current, tab(5, { url: 'https://docs.example.com/', incognito: true })];
    expect(tileOf({}, tabs)?.subline).toEqual({ kind: 'mode', mode: 'smart', site: 'docs.example.com' });
  });

  it('shows no open tab in a popup or app window', () => {
    const tabs = [current, tab(5, { windowId: 3, url: 'https://docs.example.com/', windowType: 'popup' })];
    expect(tileOf({}, tabs)?.subline).toEqual({ kind: 'mode', mode: 'smart', site: 'docs.example.com' });
  });

  it.each(['new', 'this', 'bg'] as const)('shows the %s open mode even when the page is open', (openMode) => {
    const tabs = [current, tab(5, { url: 'https://docs.example.com/' })];
    expect(tileOf({ openMode }, tabs)?.subline).toEqual({ kind: 'mode', mode: openMode, site: 'docs.example.com' });
  });
});
