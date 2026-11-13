// SpeedLink's keyboard commands (product spec §5.3): `toggle-overlay` (suggested Alt+S) pins the overlay on the
// tab, or falls back to Options where the page can't host it.
import type { Browser } from 'wxt/browser';
import { isRestrictedUrl } from '@/domain/restricted';
import { sendToTab } from './injection';
import { openOptions } from './options-tab';

export const TOGGLE_OVERLAY = 'toggle-overlay';

/**
 * The `toggle-overlay` command, on the tab Chrome passes (else the active tab of the last focused window). A page
 * restricted by URL gets Options on the keymap at once; any other is sent the toggle, which injects into a tab from
 * before the install. Chrome refusing to script it (the PDF viewer) also gets Options; a tab that can't be reached for
 * now (mid-navigation) gets nothing.
 */
export async function toggleOverlay(commandTab: Browser.tabs.Tab | undefined): Promise<void> {
  const tab = commandTab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (tab?.id === undefined) return;
  if (isRestrictedUrl(tab.url ?? '')) return openOptions(undefined, tab);

  const result = await sendToTab(tab.id, 'overlay', { action: 'toggle' });
  if (result.kind === 'restricted') return openOptions(undefined, tab);
  if (result.kind === 'failed') console.debug('SpeedLink: could not toggle the overlay', tab.id, result.error);
}

/** Listens for SpeedLink's commands. `_execute_action` opens the popup by itself. */
export function registerCommands(): void {
  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== TOGGLE_OVERLAY) return;
    toggleOverlay(tab).catch((error: unknown) => console.error('SpeedLink: the overlay command failed', error));
  });
}

/** Chrome's own shortcut page. A plain `href` to chrome:// doesn't navigate, so it opens through `tabs.create`. */
export const SHORTCUT_SETTINGS = 'chrome://extensions/shortcuts';

/** Whether Chrome has a key on `toggle-overlay`, any key. An update from v1 leaves it unbound (§5.3). */
export async function isOverlayCommandBound(): Promise<boolean> {
  const commands = await browser.commands.getAll();
  return (commands.find((command) => command.name === TOGGLE_OVERLAY)?.shortcut ?? '') !== '';
}

export async function openShortcutSettings(): Promise<void> {
  await browser.tabs.create({ url: SHORTCUT_SETTINGS });
}
