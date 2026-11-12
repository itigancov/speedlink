// ⌥+key becomes a tab (product spec §4.1): read fresh, plan, execute, flash the badge, and toast a Smart switch.
// A free key gets the free-key toast instead (§4.3, §6).
import type { Browser } from 'wxt/browser';
import type { Key } from '@/domain/keys';
import { planOpen, trialShortcut } from '@/domain/open-plan';
import { displayName } from '@/domain/shortcut';
import { createBadgeFlash } from './badge';
import { sendToTab } from './injection';
import { readKeymap } from './keymap-store';
import type { OpenKeyReply, PageToastData } from './messaging';
import { executeOpenPlan, readPlanTabs, watchLoads } from './tabs';

/** A slow page gets no badge: one popping up much later would be stale. */
const LOAD_TIMEOUT_MS = 10_000;

export interface OpenKeyRequest {
  key: Key;
  force: boolean;
  /** Options' Try ⌥K: opened through `trialShortcut`, so the Options tab is never replaced or closed. */
  trial?: boolean;
}

export type OpenKey = (request: OpenKeyRequest, senderTab: Browser.tabs.Tab | undefined) => Promise<OpenKeyReply>;

/**
 * Sends a toast to a tab's top frame. Not awaited: the reply doesn't wait for the page. The toast is best-effort
 * (a restricted page, a tab still loading), so a failure is logged quietly and never retried beyond `sendToTab`.
 */
function sendToast(tabId: number, toast: PageToastData): void {
  void sendToTab(tabId, 'toast', toast).then((result) => {
    if (result.kind !== 'sent') console.debug('SpeedLink: no page toast', toast, result);
  });
}

/**
 * The function behind the `openKey` and `tryKey` messages (and the e2e hook). `senderTab` is the tab the key was pressed on,
 * also for a press in a sub-frame. The keymap and the tabs are read fresh on every call. A tab API failure replies
 * `failed` and is logged, never retried, so a flaky moment can't open a link twice.
 */
export function createOpenKey(): OpenKey {
  const flash = createBadgeFlash();

  return async ({ key, force, trial = false }, senderTab) => {
    if (senderTab?.id === undefined) return { kind: 'failed' };
    try {
      const [keymap, tabs] = await Promise.all([readKeymap(), readPlanTabs()]);
      const stored = keymap[key];
      if (stored === undefined) {
        sendToast(senderTab.id, { kind: 'free', key });
        return { kind: 'free' };
      }
      const shortcut = trial ? trialShortcut(stored) : stored;
      const currentTab = tabs.find((tab) => tab.id === senderTab.id);
      if (currentTab === undefined) return { kind: 'failed' };

      const plan = planOpen(shortcut, { currentTab, tabs, force });
      if (plan.kind === 'noop') return { kind: 'noop' };

      // Chrome clears a tab's badge when it commits a new page, so a navigating target is badged once loaded.
      const loads = plan.kind !== 'activate' && plan.badge === 'target' ? watchLoads() : undefined;
      const outcome = await executeOpenPlan(plan).catch((error: unknown) => {
        loads?.stop();
        throw error;
      });

      // Smart switch landed on an existing tab, maybe in another window: say so there, with a way out (Open new).
      if (outcome.switched) {
        sendToast(outcome.targetTabId, { kind: 'switched', key, name: displayName(shortcut) });
      }

      const badgeTab = plan.badge === 'current' ? currentTab.id : outcome.targetTabId;
      void (loads?.loaded(badgeTab, LOAD_TIMEOUT_MS) ?? Promise.resolve(true)).then((ready) => {
        if (ready) return flash(badgeTab, key);
      });
      return { kind: 'opened', tabId: outcome.targetTabId, switched: outcome.switched };
    } catch (error) {
      console.error('SpeedLink: could not open', key, error);
      return { kind: 'failed' };
    }
  };
}
