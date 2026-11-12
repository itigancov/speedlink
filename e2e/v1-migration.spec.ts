import type { Worker } from '@playwright/test';
import { expect, test } from './extension';

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { get(keys: null): Promise<Record<string, unknown>>; set(items: object): Promise<void> } };
};

// The onChanged path: v1 data arriving through sync after the extension started (product spec §10).
// Install, update and startup are covered by src/platform/storage-preparation.test.ts.

const v1Item = (shortcuts: object[]) => ({
  speedlink: {
    shortcuts,
    settings: { theme: 'system', useShift: true, postAction: 'Jump to tab', smartTabs: true },
  },
});

const syncContents = (worker: Worker) => worker.evaluate(() => chrome.storage.sync.get(null));

test('imports v1 data that arrives after start, once', async ({ context, extensionId }) => {
  const worker = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  if (worker === undefined) throw new Error('no service worker');
  // The fresh install has stamped meta before v1 data arrives.
  await expect.poll(async () => (await syncContents(worker)).meta).toEqual({ schemaVersion: 1 });

  const first = v1Item([
    { canEdit: false, id: '1', shortcut: '1', title: 'Docs', url: 'docs.example.com' },
    { canEdit: false, id: '2', shortcut: 'S', title: '', url: 'https://github.example/' },
  ]);
  await worker.evaluate((items) => chrome.storage.sync.set(items), first);

  const imported = {
    ...first,
    meta: { schemaVersion: 1, v1Imported: true },
    'key.1': {
      link: 'https://docs.example.com/',
      name: 'Docs',
      openMode: 'smart',
      tabMatch: 'site',
      closeCurrent: false,
    },
    'key.G': { link: 'https://github.example/', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
  };
  await expect.poll(() => syncContents(worker)).toEqual(imported);

  const second = v1Item([{ canEdit: false, id: '3', shortcut: 'Y', title: '', url: 'https://video.example/' }]);
  await worker.evaluate((items) => chrome.storage.sync.set(items), second);
  // Give a would-be second import time to land.
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(await syncContents(worker)).toEqual({ ...imported, ...second });
});
