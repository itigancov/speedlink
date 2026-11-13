import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Worker } from '@playwright/test';
import { EXTENSION_PATH, expect, serviceWorker, test, welcomeTabs } from './extension';

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { get(keys: null): Promise<Record<string, unknown>>; set(items: object): Promise<void> } };
};

// The update from the real 1.6 to 4.0 (release checklist #3 and the local part of #1). `fixture-v1/` is the 1.6
// that shipped, built from `SpeedLink_1.0@964e891` (`vite build`, `dist/` copied as is). Both versions load from
// one folder, so they share an ID and the reload is an update, as the Store would do it.

const V1_BUILD = resolve(import.meta.dirname, 'fixture-v1');
const folder = mkdtempSync(join(tmpdir(), 'speedlink-v1-update-'));
cpSync(V1_BUILD, folder, { recursive: true });

test.use({ extensionPath: folder, keepWelcomeTab: true });
test.afterAll(() => rmSync(folder, { recursive: true, force: true }));

const syncContents = (worker: Worker) => worker.evaluate(() => chrome.storage.sync.get(null));

const v1Data = {
  speedlink: {
    shortcuts: [
      { canEdit: false, id: '1', shortcut: '1', title: 'Docs', url: 'docs.example.com' },
      { canEdit: false, id: '2', shortcut: 'S', title: '', url: 'https://github.example/' },
    ],
    settings: { theme: 'system', useShift: true, postAction: 'Jump to tab', smartTabs: true },
  },
};

test('updating from 1.6 opens the welcome tab once and migrates the keymap, S moved', async ({
  context,
  updateExtension,
}) => {
  const v1 = await serviceWorker(context);
  // 1.6 writes its two default shortcuts on install; replace them once they are there.
  await expect.poll(async () => (await syncContents(v1)).speedlink).toBeDefined();
  await v1.evaluate((items) => chrome.storage.sync.set(items), v1Data);
  expect(welcomeTabs(context)).toHaveLength(0);

  // Same folder, so same ID; nothing of 1.6 is left behind.
  rmSync(folder, { recursive: true });
  cpSync(EXTENSION_PATH, folder, { recursive: true });
  const worker = await updateExtension();

  await expect.poll(() => welcomeTabs(context).length).toBe(1);
  await expect
    .poll(() => syncContents(worker))
    .toEqual({
      ...v1Data,
      meta: { schemaVersion: 1, v1Imported: true },
      'key.1': {
        link: 'https://docs.example.com/',
        name: 'Docs',
        openMode: 'smart',
        tabMatch: 'site',
        closeCurrent: false,
      },
      'key.G': { link: 'https://github.example/', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
    });
  // Give a second welcome tab every chance to open.
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(welcomeTabs(context)).toHaveLength(1);
});
