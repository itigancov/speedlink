import { useEffect, useState } from 'react';

/** The tab the popup assigns, as the tabs API reports it. */
export interface PopupTab {
  /** Undefined when there is no such tab; the page is then unusable. */
  id: number | undefined;
  url: string;
  /** The tab title, '' when Chrome gives none. */
  title: string;
  favIconUrl: string;
}

const NO_TAB: PopupTab = { id: undefined, url: '', title: '', favIconUrl: '' };

async function readTab(tabId: number | undefined): Promise<PopupTab> {
  const tab =
    tabId === undefined
      ? (await browser.tabs.query({ active: true, currentWindow: true }))[0]
      : await browser.tabs.get(tabId);
  if (tab === undefined) return NO_TAB;
  return { id: tab.id, url: tab.url ?? '', title: tab.title ?? '', favIconUrl: tab.favIconUrl ?? '' };
}

/** The named tab, else the active tab of the popup's window; null until it has been read. */
export function usePopupTab(tabId?: number): PopupTab | null {
  const [tab, setTab] = useState<PopupTab | null>(null);
  useEffect(() => {
    let live = true;
    readTab(tabId)
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
