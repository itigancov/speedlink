// Opening the welcome page after an install or an update from v1 (product spec §9).
import { shouldOpenWelcome } from '@/domain/welcome';

/**
 * Registers the `onInstalled` listener that opens the welcome page in an active tab. `onInstalled` fires once per
 * install or update, so there is no dedupe. The page is static and reads no keymap, so it doesn't wait for the v1
 * import that runs on the same event.
 */
export function registerWelcomeOnInstall(): void {
  browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    if (!shouldOpenWelcome({ reason, previousVersion })) return;
    browser.tabs
      .create({ url: browser.runtime.getURL('/welcome.html'), active: true })
      .catch((error: unknown) => console.error('SpeedLink: could not open the welcome page', error));
  });
}
