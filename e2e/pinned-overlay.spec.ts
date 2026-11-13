import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, fromExtension, HOOKS_EXTENSION_PATH, test } from './extension';

// The pinned overlay in real Chrome (product spec §5.2, §5.3): ⌥S, or S during a Peek, pins it; the search takes
// focus, ↵ opens the top result, ⌥ + key still opens, Esc closes and gives focus back. CDP-dispatched keys bypass
// Chrome's command accelerators, so ⌥S reaches the content script; the `toggle-overlay` command itself is driven
// through the e2e-hooks build. The rules are pinned in src/domain/hud-state.test.ts, src/components/Overlay.test.tsx
// and src/platform/commands.test.ts; Chrome firing its own Alt+S, the omnibox and the Windows ⋮ menu are manual QA.

interface Tab {
  id: number;
  url?: string;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { set(items: object): Promise<void>; get(keys: string | null): Promise<object> } };
  tabs: {
    query(info: object): Promise<Tab[]>;
    create(props: object): Promise<Tab>;
    get(id: number): Promise<Tab & { status?: string }>;
  };
};
declare const speedlinkE2E: { toggleOverlay(tab: Tab): Promise<void> };

const ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;
const target = (name: string) => `${ORIGIN}/frame-child.html?${name}`;

/** Past the 400 ms hold. */
const PAST_HOLD_MS = 600;

async function serviceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

/** Puts a link on a key, opening in a new tab. */
const store = (worker: Worker, key: string, name: string) =>
  worker.evaluate(([item, value]) => chrome.storage.sync.set({ [item]: value }), [
    `key.${key}`,
    { link: target(key.toLowerCase()), name, openMode: 'new', tabMatch: 'exact', closeCurrent: false },
  ] as const);

const tabsOn = async (worker: Worker, url: string) =>
  (await worker.evaluate(() => chrome.tabs.query({}))).filter((tab) => tab.url === url).length;

/** Opens a fixture page once the extension is up, so our key listeners come before the page's (as page-toast). */
async function open(context: BrowserContext, path: string): Promise<Page> {
  const worker = await serviceWorker(context);
  await worker.evaluate(() => chrome.storage.sync.get(null));
  const page = await context.newPage();
  await page.goto(path, { waitUntil: 'load' });
  return page;
}

const overlay = (page: Page): Locator => page.getByRole('dialog', { name: 'Your keys' });
const search = (page: Page): Locator => overlay(page).getByRole('searchbox', { name: 'Search your keys' });

test.describe('the pinned overlay', () => {
  test('⌥S pins it with the search focused; typing filters and ↵ opens the top result', async ({
    context,
    openWithExceptionCapture,
    extensionId,
  }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    await store(worker, 'G', 'GitHub');
    const { page, exceptions } = await openWithExceptionCapture(`${ORIGIN}/keys.html`);

    await page.keyboard.press('Alt+KeyS');
    await expect(overlay(page).getByText('Pinned')).toBeVisible();
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('kan');
    await expect(overlay(page).getByTestId('overlay-tile')).toHaveText([/Kanban/]);
    await page.keyboard.press('Enter');

    await expect.poll(() => tabsOn(worker, target('k'))).toBe(1);
    await expect(overlay(page)).toHaveCount(0);
    // The page saw ⌥ go down, and nothing typed into the overlay: not S, the search or ↵.
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
    expect(seen.filter((entry) => !entry.endsWith('AltLeft'))).toEqual([]);
    expect(fromExtension(exceptions, extensionId)).toEqual([]);
  });

  test('S during a Peek pins it; it stays after the ⌥ release, and Esc gives focus back', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');
    // A text field keeps ⌥ for itself, so the Peek is held from the checkbox (as in overlay.spec.ts).
    await page.locator('#checkbox').focus();

    await page.keyboard.down('Alt');
    await page.waitForTimeout(PAST_HOLD_MS);
    // "⌥ held" on macOS, "Alt held" elsewhere.
    await expect(overlay(page).getByText(/^(⌥|Alt) held$/)).toBeVisible();
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Alt');

    await expect(overlay(page).getByText('Pinned')).toBeVisible();
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('x');
    await page.keyboard.press('Escape');
    await expect(search(page)).toHaveValue('');
    await page.keyboard.press('Escape');

    await expect(overlay(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('checkbox');
  });

  test('⌥ + key opens with focus in the search', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');

    await page.keyboard.press('Alt+KeyS');
    await expect(search(page)).toBeFocused();
    await page.keyboard.press('Alt+KeyK');

    await expect.poll(() => tabsOn(worker, target('k'))).toBe(1);
    await expect(overlay(page)).toHaveCount(0);
  });

  test('⌥S again closes it', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');

    await page.keyboard.press('Alt+KeyS');
    await expect(search(page)).toBeFocused();
    await page.keyboard.press('Alt+KeyS');

    await expect(overlay(page)).toHaveCount(0);
  });

  test('a click outside closes it', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');

    await page.keyboard.press('Alt+KeyS');
    await expect(overlay(page)).toBeVisible();
    await page.mouse.click(5, 5);

    await expect(overlay(page)).toHaveCount(0);
  });

  test('with focus in a child frame, ⌥S pins one overlay in the top document', async ({ context }) => {
    const worker = await serviceWorker(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/frames.html');
    await page.frameLocator('iframe').getByText('Child frame').click();

    await page.keyboard.press('Alt+KeyS');

    await expect(overlay(page)).toHaveCount(1);
    await expect(overlay(page).getByText('Pinned')).toBeVisible();
    await expect(page.frameLocator('iframe').getByRole('dialog')).toHaveCount(0);
    await expect(search(page)).toBeFocused();
  });
});

test.describe('the toggle-overlay command', () => {
  test.use({ extensionPath: HOOKS_EXTENSION_PATH });

  async function hooks(context: BrowserContext): Promise<Worker> {
    const worker = await serviceWorker(context);
    await expect.poll(() => worker.evaluate(() => typeof speedlinkE2E)).toBe('object');
    return worker;
  }

  test('pins the overlay on a page that can host it', async ({ context }) => {
    const worker = await hooks(context);
    await store(worker, 'K', 'Kanban');
    const page = await open(context, '/keys.html');
    const [tab] = await worker.evaluate((url) => chrome.tabs.query({ url }), `${ORIGIN}/keys.html`);
    if (tab === undefined) throw new Error('no fixture tab');

    await worker.evaluate((t) => speedlinkE2E.toggleOverlay(t), tab);

    await expect(overlay(page).getByText('Pinned')).toBeVisible();
    await expect(overlay(page).getByTestId('overlay-tile')).toHaveText([/Kanban/]);
  });

  test('opens Options on a page that can’t', async ({ context, extensionId }) => {
    const worker = await hooks(context);
    const page = await context.newPage();
    await page.goto('chrome://version/');
    const [tab] = await worker.evaluate(() => chrome.tabs.query({ url: 'chrome://version/' }));
    if (tab === undefined) throw new Error('no chrome://version tab');

    await worker.evaluate((t) => speedlinkE2E.toggleOverlay(t), tab);

    // Options puts its selected key in the hash once it loads.
    const options = `chrome-extension://${extensionId}/options.html`;
    await expect
      .poll(async () => (await worker.evaluate(() => chrome.tabs.query({}))).some((t) => t.url?.startsWith(options)))
      .toBe(true);
  });
});
