// Opening Options on a key, for the overlay's "edit this key" and ⌥S's fallback.
import type { Browser } from 'wxt/browser';
import type { Key } from '@/domain/keys';

const withoutHash = (url: string) => url.split('#', 1)[0];

/**
 * Focuses the most recently used Options tab, in any window, or opens one next to the sender tab. The selected key
 * travels in the hash (`#key=K`), so focusing an open tab never reloads it and an unsaved draft survives.
 * `runtime.openOptionsPage()` is not used: it can't carry the key and only looks in one window.
 */
export async function openOptions(key: Key | undefined, senderTab: Browser.tabs.Tab | undefined): Promise<void> {
  const page = browser.runtime.getURL('/options.html');
  const url = key === undefined ? page : `${page}#key=${key}`;

  const tabs = await browser.tabs.query({});
  const [existing] = tabs
    .filter((tab) => tab.id !== undefined && tab.url !== undefined && withoutHash(tab.url) === page)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true, ...(key === undefined ? {} : { url }) });
    await browser.windows.update(existing.windowId, { focused: true });
    return;
  }

  const next = senderTab?.id !== undefined && (await isNormalWindow(senderTab.windowId)) ? senderTab : undefined;
  await browser.tabs.create({
    url,
    ...(next === undefined ? {} : { windowId: next.windowId, index: next.index + 1, openerTabId: next.id }),
  });
}

async function isNormalWindow(windowId: number): Promise<boolean> {
  return (await browser.windows.get(windowId)).type === 'normal';
}
