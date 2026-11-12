// Pages SpeedLink can't run on (product spec §4.6): no toasts, no keys, ⌥S falls back to Options.
import { parseWebUrl } from './link';

const WEB_STORE_HOST = 'chromewebstore.google.com';
/** The old Web Store lives under a path of chrome.google.com; the rest of that host is an ordinary site. */
const OLD_WEB_STORE = /^\/webstore(?:[/?#]|$)/;
/** The new tab page Chrome serves from the search provider (Google's is `/_/chrome/newtab`). */
const NTP_PATH = /^\/_\/chrome\/newtab(?:[/?#]|$)/;

/**
 * True for every page the content script can't run on, by URL: any scheme other than http(s) (chrome://,
 * chrome-extension://, chrome-untrusted://, chrome-search://, devtools://, edge://, about:, view-source:, file:,
 * data:, …), the Web Store and the new tab page. An unknown or unparseable URL counts as restricted.
 *
 * A file:// page is restricted by URL even when the user has allowed file access: a caller that pings the
 * content script first (item 08) still reaches it there.
 */
export function isRestrictedUrl(url: string): boolean {
  const web = parseWebUrl(url);
  if (web === null) return true;
  if (web.hostname === WEB_STORE_HOST) return true;
  if (web.hostname === 'chrome.google.com' && OLD_WEB_STORE.test(web.pathname)) return true;
  return NTP_PATH.test(web.pathname);
}

export type SendErrorKind = 'restricted' | 'no-receiver' | 'other';

const RESTRICTED_ERROR =
  /cannot access a chrome(?:-extension)?:\/\/ url|cannot access contents of|extensions gallery cannot be scripted/i;
const NO_RECEIVER_ERROR = /could not establish connection|receiving end does not exist/i;

/**
 * What a failed send or injection says about the tab: `restricted` (Chrome refuses to script it; the PDF viewer is
 * only detectable this way), `no-receiver` (no content script yet: inject and retry) or `other`.
 */
export function classifySendError(message: string): SendErrorKind {
  if (RESTRICTED_ERROR.test(message)) return 'restricted';
  if (NO_RECEIVER_ERROR.test(message)) return 'no-receiver';
  return 'other';
}
