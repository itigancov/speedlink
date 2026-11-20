// The demo keymap and the sites around it. Real names and links, shown as monograms; every request is answered by a
// stub, so nothing reaches the live web. Also the static data the template shots (Hero, Smart switch, the marquee)
// draw: worked out by the product's own overlay model on a made-up window, so their tiles say what the Peek would.
import type { Keymap } from '@/domain/keymap-ops';
import type { Key } from '@/domain/keys';
import type { PlanTab } from '@/domain/open-plan';
import { buildOverlayModel, type OverlayTile } from '@/domain/overlay-model';
import { parseShortcut } from '@/domain/shortcut';
import type { MockTab } from './templates';

interface DemoShortcut {
  key: string;
  name: string;
  link: string;
  openMode: 'smart' | 'new' | 'this' | 'bg';
  tabMatch: 'exact' | 'page' | 'site';
  /** Left open in a background tab: a Smart key on it shows the green Open-now tile. */
  open?: true;
}

export const DEMO_KEYMAP: DemoShortcut[] = [
  { key: 'G', name: 'GitHub', link: 'https://github.com/', openMode: 'smart', tabMatch: 'site', open: true },
  { key: 'M', name: 'Gmail', link: 'https://mail.google.com/mail/u/0/', openMode: 'smart', tabMatch: 'site' },
  { key: 'Y', name: 'YouTube', link: 'https://www.youtube.com/', openMode: 'new', tabMatch: 'site', open: true },
  { key: 'N', name: 'Notion', link: 'https://www.notion.so/', openMode: 'smart', tabMatch: 'page', open: true },
  { key: 'C', name: 'Calendar', link: 'https://calendar.google.com/', openMode: 'smart', tabMatch: 'site' },
  { key: 'F', name: 'Figma', link: 'https://www.figma.com/files/', openMode: 'smart', tabMatch: 'site', open: true },
  { key: 'L', name: 'Slack', link: 'https://app.slack.com/client/', openMode: 'smart', tabMatch: 'site' },
  { key: 'D', name: 'Docs', link: 'https://docs.google.com/document/', openMode: 'smart', tabMatch: 'exact' },
  { key: 'P', name: 'Maps', link: 'https://www.google.com/maps', openMode: 'new', tabMatch: 'site' },
  { key: 'H', name: 'Hacker News', link: 'https://news.ycombinator.com/', openMode: 'this', tabMatch: 'site' },
  { key: 'W', name: 'Wikipedia', link: 'https://en.wikipedia.org/', openMode: 'bg', tabMatch: 'site' },
];

/** The neutral article page behind every overlay and toast, under a reserved `.example` domain. */
export const BACKDROP_URL = 'https://notes.example/journal/river-path';

/** The backdrop's tab title (its `<title>`). */
export const BACKDROP_TITLE = 'Field Notes';

const KEYMAP: Keymap = Object.fromEntries(
  DEMO_KEYMAP.map(({ key, name, link, openMode, tabMatch }) => {
    const shortcut = parseShortcut({ link, name, openMode, tabMatch, closeCurrent: false });
    if (shortcut === null) throw new Error(`the demo shortcut on ${key} does not parse`);
    return [key, shortcut] as const;
  }),
);

/** The template shots' window: the article in front, then every demo site that is left open, in keymap order. */
const WINDOW: MockTab[] = [
  { title: BACKDROP_TITLE, link: BACKDROP_URL, active: true },
  ...DEMO_KEYMAP.filter(({ open }) => open).map(({ name, link }) => ({ title: name, link, active: false })),
];

const planTab = ({ link, title }: MockTab, index: number): PlanTab => ({
  id: index + 1,
  windowId: 1,
  index,
  url: link,
  title,
  lastAccessed: WINDOW.length - index,
  pinned: false,
  incognito: false,
  groupId: -1,
  windowType: 'normal',
});

/** The overlay's tiles for `keys`, in that order, as the Peek over the article in `WINDOW` would show them. */
export function demoTiles(keys: Key[]): OverlayTile[] {
  const tabs = WINDOW.map(planTab);
  const [current] = tabs;
  if (current === undefined) throw new Error('no demo window');
  const { tiles } = buildOverlayModel(KEYMAP, tabs, current);
  return keys.map((key) => {
    const tile = tiles.find((tile) => tile.key === key);
    if (tile === undefined) throw new Error(`no demo tile on ${key}`);
    return tile;
  });
}

/** Shot2's two tab strips: before Alt + G (the article in front) and after (the same tabs, GitHub in front). */
export function smartSwitchStrips(): { before: MockTab[]; after: MockTab[] } {
  const github = DEMO_KEYMAP.find(({ key }) => key === 'G')?.link;
  return {
    before: WINDOW,
    after: WINDOW.map((tab) => ({ ...tab, active: tab.link === github })),
  };
}
