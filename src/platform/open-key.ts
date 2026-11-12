// ⌥+key becomes a tab (product spec §4.1): read fresh, plan, execute, flash the badge. A free key gets the free
// signal instead (§4.3).
import type { Browser } from 'wxt/browser';
import type { Key } from '@/domain/keys';
import { planOpen } from '@/domain/open-plan';
import { createBadgeFlash } from './badge';
import { sendToTab } from './injection';
import { readKeymap } from './keymap-store';
import type { OpenKeyReply } from './messaging';
import { executeOpenPlan, readPlanTabs, watchLoads } from './tabs';

/** A slow page gets no badge: one popping up much later would be stale. */
const LOAD_TIMEOUT_MS = 10_000;

export interface OpenKeyRequest {
  key: Key;
  force: boolean;
}

export type OpenKey = (request: OpenKeyRequest, senderTab: Browser.tabs.Tab | undefined) => Promise<OpenKeyReply>;

/**
 * Tells the tab the key was pressed on that the key is free; its top frame shows the toast (item 10). Not awaited:
 * the reply doesn't wait for the page. A failure is expected until the toast exists, so it is logged quietly.
 */
function sendFreeSignal(tabId: number, key: Key): void {
  void sendToTab(tabId, 'toast', { kind: 'free', key }).then((result) => {
    if (result.kind !== 'sent') console.debug('SpeedLink: no free-key toast', key, result);
  });
}

/**
 * The function behind the `openKey` message (and the e2e hook). `senderTab` is the tab the key was pressed on,
 * also for a press in a sub-frame. The keymap and the tabs are read fresh on every call. A tab API failure replies
 * `failed` and is logged, never retried, so a flaky moment can't open a link twice.
 */
export function createOpenKey(): OpenKey {
  const flash = createBadgeFlash();

  return async ({ key, force }, senderTab) => {
    if (senderTab?.id === undefined) return { kind: 'failed' };
    try {
      const [keymap, tabs] = await Promise.all([readKeymap(), readPlanTabs()]);
      const shortcut = keymap[key];
      if (shortcut === undefined) {
        sendFreeSignal(senderTab.id, key);
        return { kind: 'free' };
      }
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
