// The thin executor for `planOpen` (product spec §4.1, §11.2): reads tabs as plain data, runs an OpenPlan.
import type { Browser } from 'wxt/browser';
import type { OpenPlan, PlanTab } from '@/domain/open-plan';

/** Every open tab as plan data, read fresh. A tab without an id (devtools) is left out. */
export async function readPlanTabs(): Promise<PlanTab[]> {
  const [tabs, windows] = await Promise.all([browser.tabs.query({}), browser.windows.getAll()]);
  const windowTypes = new Map(windows.map((window) => [window.id, window.type]));
  return tabs.flatMap((tab) =>
    tab.id === undefined
      ? []
      : [
          {
            id: tab.id,
            windowId: tab.windowId,
            index: tab.index,
            url: tab.url ?? '',
            lastAccessed: tab.lastAccessed ?? 0,
            pinned: tab.pinned,
            incognito: tab.incognito,
            groupId: tab.groupId ?? -1,
            windowType: windowTypes.get(tab.windowId) ?? 'unknown',
          },
        ],
  );
}

export interface OpenOutcome {
  /** The tab the link is open in. */
  targetTabId: number;
  /** True only when Smart switch activated an existing tab. */
  switched: boolean;
}

/** Activates a tab and brings its window forward (best effort on macOS). */
async function focusTab(tabId: number, windowId: number): Promise<void> {
  await browser.tabs.update(tabId, { active: true });
  await browser.windows.update(windowId, { focused: true });
}

/** A plan that does something: the background answers `noop` itself. */
export type ExecutablePlan = Exclude<OpenPlan, { kind: 'noop' }>;

async function open(plan: ExecutablePlan): Promise<OpenOutcome> {
  switch (plan.kind) {
    case 'activate':
      await focusTab(plan.tabId, plan.windowId);
      return { targetTabId: plan.tabId, switched: true };
    case 'update':
      await browser.tabs.update(plan.tabId, { url: plan.url });
      return { targetTabId: plan.tabId, switched: false };
    case 'create': {
      const { url, windowId, index, openerTabId, active, groupId } = plan;
      const created = await browser.tabs.create({ url, windowId, index, openerTabId, active });
      if (created.id === undefined) throw new Error('tabs.create returned a tab without an id');
      // Chrome picked the window: bring it forward so the new tab is seen.
      // The tab is open by now, so a failure here is logged rather than reported as a failed open.
      if (windowId === undefined && active) {
        await browser.windows
          .update(created.windowId, { focused: true })
          .catch((error: unknown) => console.error('SpeedLink: could not focus the new tab window', error));
      }
      // Inserting at index + 1 joins a group only strictly inside it; this keeps a tab opened from the last one.
      if (groupId !== undefined) {
        await browser.tabs
          .group({ tabIds: [created.id], groupId })
          .catch((error: unknown) => console.error('SpeedLink: could not keep the new tab in its group', error));
      }
      return { targetTabId: created.id, switched: false };
    }
  }
}

/**
 * Runs a plan. Close current waits until the open and the focus have finished, so Chrome never shows an unrelated
 * tab in between; a failed close is logged and ignored. Any other failure rejects.
 */
export async function executeOpenPlan(plan: ExecutablePlan): Promise<OpenOutcome> {
  const outcome = await open(plan);
  if (plan.kind !== 'update' && plan.closeTabId !== undefined) {
    await browser.tabs
      .remove(plan.closeTabId)
      .catch((error: unknown) => console.error('SpeedLink: could not close the current tab', error));
  }
  return outcome;
}

/** Calls back once when a tab finishes loading (`status: 'complete'`), or with false after `timeoutMs`. */
export interface LoadWatch {
  loaded(tabId: number, timeoutMs: number): Promise<boolean>;
  stop(): void;
}

/**
 * Starts recording finished loads before a plan runs, so a page that loads before its tab id is known still
 * counts. A load counts only when its `loading` was seen too, so the old page of a tab that was still loading
 * can't pass for the new one. Stops listening once `loaded` settles or `stop` is called.
 */
export function watchLoads(): LoadWatch {
  const started = new Set<number>();
  const done = new Set<number>();
  let waiter: { tabId: number; resolve: (loaded: boolean) => void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const listener = (tabId: number, change: Browser.tabs.OnUpdatedInfo) => {
    if (change.status === 'loading') started.add(tabId);
    if (change.status !== 'complete' || !started.has(tabId)) return;
    done.add(tabId);
    if (waiter?.tabId === tabId) settle(true);
  };
  const stop = () => {
    browser.tabs.onUpdated.removeListener(listener);
    clearTimeout(timer);
  };
  const settle = (loaded: boolean) => {
    stop();
    waiter?.resolve(loaded);
    waiter = undefined;
  };
  browser.tabs.onUpdated.addListener(listener);

  return {
    loaded(tabId, timeoutMs) {
      if (done.has(tabId)) {
        stop();
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        waiter = { tabId, resolve };
        timer = setTimeout(() => settle(false), timeoutMs);
      });
    },
    stop,
  };
}
