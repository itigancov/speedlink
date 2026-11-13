// Reaching a tab's content script from the background (product spec §4.5, §11.4).
import type { GetDataType, GetReturnType } from '@webext-core/messaging';
import { classifySendError, isRestrictedUrl } from '@/domain/restricted';
import { type PageToastData, type ProtocolMap, sendMessage } from './messaging';

/** The built content script, run in every frame. */
const CONTENT_SCRIPT = '/content-scripts/hud.js';

/** The result of a background → tab send. `restricted`: Chrome won't run SpeedLink there (§4.6). */
export type TabSend<T> = { kind: 'sent'; reply: T } | { kind: 'restricted' } | { kind: 'failed'; error: unknown };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs the content script in every frame of a tab. A frame whose copy is already running replaces it. */
export async function injectContentScript(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT] });
}

type PingResult =
  | { kind: 'alive' }
  | { kind: 'restricted' }
  | { kind: 'no-receiver'; error: unknown }
  | { kind: 'failed'; error: unknown };

/** A failed ping or injection as a send result: restricted, or failed with its error. */
const failure = (error: unknown): { kind: 'restricted' } | { kind: 'failed'; error: unknown } =>
  classifySendError(messageOf(error)) === 'restricted' ? { kind: 'restricted' } : { kind: 'failed', error };

async function ping(tabId: number): Promise<PingResult> {
  try {
    await sendMessage('ping', undefined, { tabId, frameId: 0 });
    return { kind: 'alive' };
  } catch (error) {
    return classifySendError(messageOf(error)) === 'no-receiver' ? { kind: 'no-receiver', error } : failure(error);
  }
}

/**
 * Every background → tab message goes through here, always to frame 0: ping; when nobody answers (a tab opened
 * before install or update), inject into every frame and ping once more; then send. A restricted page is reported
 * without retrying, so the caller can fall back. Never rejects.
 */
export async function sendToTab<T extends keyof ProtocolMap>(
  tabId: number,
  type: T,
  data: GetDataType<ProtocolMap[T]>,
): Promise<TabSend<GetReturnType<ProtocolMap[T]>>> {
  let liveness = await ping(tabId);
  if (liveness.kind === 'no-receiver') {
    try {
      await injectContentScript(tabId);
    } catch (error) {
      return failure(error);
    }
    liveness = await ping(tabId);
  }
  if (liveness.kind === 'restricted') return liveness;
  if (liveness.kind !== 'alive') return { kind: 'failed', error: liveness.error };

  try {
    // `sendMessage`'s overloads can't be resolved for a generic `T`; this function's signature ties data to T.
    const send = sendMessage as (type: T, data: unknown, target: { tabId: number; frameId: number }) => Promise<never>;
    return { kind: 'sent', reply: await send(type, data, { tabId, frameId: 0 }) };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

/**
 * Sends a toast to a tab's top frame. Not awaited: the reply doesn't wait for the page. The toast is best-effort
 * (a restricted page, a tab still loading), so a failure is logged quietly and never retried beyond `sendToTab`.
 */
export function sendToast(tabId: number, toast: PageToastData): void {
  void sendToTab(tabId, 'toast', toast).then((result) => {
    if (result.kind !== 'sent') console.debug('SpeedLink: no page toast', toast, result);
  });
}

/**
 * After an install or an update, open tabs have no live copy of the content script: inject into each awake
 * http(s) tab so they work without a reload. Discarded tabs are left asleep; they get the script when they load.
 * Restricted URLs (the Web Store, the NTP) are skipped up front, since Chrome refuses them; any other tab that
 * refuses is skipped too.
 */
export async function injectIntoOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.flatMap((tab) =>
      tab.id === undefined || tab.discarded || isRestrictedUrl(tab.url ?? '')
        ? []
        : [injectContentScript(tab.id).catch(() => {})],
    ),
  );
}

/** Injects into open tabs on every install and update, alongside the storage preparation. */
export function registerInjectionOnInstall(): void {
  browser.runtime.onInstalled.addListener(() => {
    injectIntoOpenTabs().catch((error: unknown) => console.error('SpeedLink: could not inject into open tabs', error));
  });
}
