import { parseWebUrl, stripWww } from './link';
import type { Shortcut, TabMatch } from './shortcut';

/** The path with one trailing `/` removed, so the root path is empty. A double slash is left alone. */
const trimmedPath = (url: URL): string => (url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname);

/** Hostname without one leading `www.`, plus port. The URL parser already blanks a scheme-default port. */
const siteKey = (url: URL): string => `${stripWww(url.hostname)}:${url.port}`;

const pageKey = (url: URL): string => `${url.protocol}//${url.host}${trimmedPath(url)}`;

/** `search` and `hash` are already '' for an empty `?` or `#`. Query order and percent-encoding are kept. */
const exactKey = (url: URL): string => `${pageKey(url)}${url.search}${url.hash}`;

const KEY_OF: Record<TabMatch, (url: URL) => string> = { exact: exactKey, page: pageKey, site: siteKey };

/** Whether an open tab counts as the link's tab under a tab match. A non-web or unparseable tab never matches. */
export function tabMatches(tabUrl: string, link: string, mode: TabMatch): boolean {
  const tab = parseWebUrl(tabUrl);
  const target = parseWebUrl(link);
  if (tab === null || target === null) return false;
  const keyOf = KEY_OF[mode];
  return keyOf(tab) === keyOf(target);
}

/** "Open now": only Smart shortcuts, when any open tab matches by the shortcut's own tab match. */
export function isOpenNow(shortcut: Shortcut, tabUrls: readonly string[]): boolean {
  if (shortcut.openMode !== 'smart') return false;
  return tabUrls.some((tabUrl) => tabMatches(tabUrl, shortcut.link, shortcut.tabMatch));
}

/** The parts of an open tab the title pick reads. */
export interface TitledTab {
  url: string;
  title: string;
  lastAccessed: number;
}

/**
 * The name Options fills in for a link (product spec §8.3): the title of the most recently used tab on the link's page
 * by the "This page" rule. Undefined with no such tab, or when it has no title. The caller passes only the tabs it may
 * read titles from (normal, non-incognito windows).
 */
export function pageTitleFor(tabs: readonly TitledTab[], link: string): string | undefined {
  const best = tabs
    .filter((tab) => tabMatches(tab.url, link, 'page'))
    .reduce<TitledTab | undefined>(
      (most, tab) => (most === undefined || tab.lastAccessed > most.lastAccessed ? tab : most),
      undefined,
    );
  return best?.title === '' ? undefined : best?.title;
}
