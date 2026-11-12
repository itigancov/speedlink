// fakeBrowser leaves `tabs.onReplaced` unimplemented. This installs an in-memory event with the same `trigger` as
// fakeBrowser's own events; call it after every `fakeBrowser.reset()`.
import { fakeBrowser } from 'wxt/testing/fake-browser';

type Listener = (addedTabId: number, removedTabId: number) => void;

export function installTabsOnReplaced(): { trigger(addedTabId: number, removedTabId: number): void } {
  const listeners = new Set<Listener>();
  const event = {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    hasListener: (listener: Listener) => listeners.has(listener),
    trigger: (addedTabId: number, removedTabId: number) => {
      for (const listener of listeners) listener(addedTabId, removedTabId);
    },
  };
  Object.defineProperty(fakeBrowser.tabs, 'onReplaced', { value: event, configurable: true });
  return event;
}
