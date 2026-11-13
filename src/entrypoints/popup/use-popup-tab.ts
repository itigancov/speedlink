import { useEffect, useState } from 'react';
import { NO_TAB, type PopupTab, readPopupTab } from '@/platform/tabs';

/** The named tab, else the active tab of the popup's window; null until it has been read. */
export function usePopupTab(tabId?: number): PopupTab | null {
  const [tab, setTab] = useState<PopupTab | null>(null);
  useEffect(() => {
    let live = true;
    readPopupTab(tabId)
      .catch((error: unknown) => {
        console.error('SpeedLink: no tab for the popup', error);
        return NO_TAB;
      })
      .then((read) => {
        if (live) setTab(read);
      });
    return () => {
      live = false;
    };
  }, [tabId]);
  return tab;
}
