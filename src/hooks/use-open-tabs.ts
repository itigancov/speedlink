import { useEffect, useState } from 'react';
import { parseWebUrl } from '@/domain/link';
import type { PlanTab } from '@/domain/open-plan';
import { watchPlanTabs } from '@/platform/tabs';

/**
 * The live open tabs that Smart switch from a normal window could pick: normal, non-incognito windows only.
 * Null until the first read has landed.
 */
export function useOpenTabs(): PlanTab[] | null {
  const [tabs, setTabs] = useState<PlanTab[] | null>(null);
  useEffect(
    () => watchPlanTabs((all) => setTabs(all.filter((tab) => tab.windowType === 'normal' && !tab.incognito))),
    [],
  );
  return tabs;
}

/** Use current tab's page: the most recently used http(s) tab, so Options and other extension pages drop out. */
export function lastWebTab(tabs: readonly PlanTab[]): PlanTab | undefined {
  return tabs
    .filter((tab) => parseWebUrl(tab.url) !== null)
    .reduce<PlanTab | undefined>(
      (best, tab) => (best === undefined || tab.lastAccessed > best.lastAccessed ? tab : best),
      undefined,
    );
}
