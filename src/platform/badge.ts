// The badge flash after a key opens its shortcut (product spec §4.1, §6).

/** `--primary` in src/assets/theme.css, SpeedLink's accent blue. The badge can't read CSS tokens. */
const BADGE_COLOR = '#0066FF';
/** `--primary-foreground` in src/assets/theme.css. */
const BADGE_TEXT_COLOR = '#FFFFFF';
export const BADGE_FLASH_MS = 1500;

const ignore = () => {};

/** Flashes text on a tab's badge. A new flash on the same tab restarts its timer. A closed tab is ignored. */
export function createBadgeFlash(): (tabId: number, text: string) => Promise<void> {
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  return async (tabId, text) => {
    clearTimeout(timers.get(tabId));
    timers.set(
      tabId,
      setTimeout(() => {
        timers.delete(tabId);
        browser.action.setBadgeText({ tabId, text: '' }).catch(ignore);
      }, BADGE_FLASH_MS),
    );
    // Colours first, so the text never shows on Chrome's default grey.
    await Promise.all([
      browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR }),
      browser.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_COLOR }),
    ])
      .then(() => browser.action.setBadgeText({ tabId, text }))
      .catch(ignore);
  };
}
