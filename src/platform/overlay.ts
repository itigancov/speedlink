// The background's side of the overlay (product spec §5.4, §4.4): its model, and the sub-frame relay.
import type { Browser } from 'wxt/browser';
import { buildOverlayModel, type OverlayModel } from '@/domain/overlay-model';
import { sendToTab } from './injection';
import { readKeymap } from './keymap-store';
import type { FrameEvent } from './messaging';
import { readPlanTabs } from './tabs';

/**
 * The model for the sender's tab, else the named one (the popup), from the fresh keymap and tabs. Rejects without
 * either, and for a tab that is gone.
 */
export async function readOverlayModel(
  senderTab: Browser.tabs.Tab | undefined,
  named: number | undefined,
): Promise<OverlayModel> {
  const tabId = senderTab?.id ?? named;
  if (tabId === undefined) throw new Error('getOverlayModel needs a tab');
  const [keymap, tabs] = await Promise.all([readKeymap(), readPlanTabs()]);
  const currentTab = tabs.find((tab) => tab.id === tabId);
  if (currentTab === undefined) throw new Error(`no tab ${tabId}`);
  return buildOverlayModel(keymap, tabs, currentTab);
}

/**
 * Passes a sub-frame's Peek to the top frame of its tab. Best-effort, like a toast. Resolves once delivered (or
 * given up), so the sub-frame can send its `close` only after its `show`.
 */
export async function relayFrameEvent(senderTab: Browser.tabs.Tab | undefined, event: FrameEvent): Promise<void> {
  const tabId = senderTab?.id;
  if (tabId === undefined) return;
  const result = await sendToTab(tabId, 'frameEvent', { kind: event.kind });
  if (result.kind !== 'sent') console.debug('SpeedLink: frame event not relayed', event, result);
}
