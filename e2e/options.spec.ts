import type { BrowserContext, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, test } from './extension';

// The Options keymap in the built extension (product spec §8): editing, validation, Clear key, Try ⌥K through the
// real `tryKey` message, the hash selection, v1-imported keys, live sync changes, the `/` search, the List view and drag-to-swap. Each combination is unit-tested
// in src/entrypoints/options/OptionsPage.test.tsx; this covers real storage, real tabs and the background.

interface Tab {
  id: number;
  active: boolean;
  url?: string;
}

/** The part of `chrome` these evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: {
    sync: { get(keys: string | null): Promise<Record<string, unknown>>; set(items: object): Promise<void> };
  };
  tabs: { query(info: object): Promise<Tab[]> };
};

const LINK = `http://127.0.0.1:${FIXTURE_PORT}/frame-child.html?options`;

async function serviceWorker(context: BrowserContext, extensionId: string): Promise<Worker> {
  const worker = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  if (worker === undefined) throw new Error('no service worker');
  return worker;
}

const store = (worker: Worker, key: string, fields: object) =>
  worker.evaluate(([item, value]) => chrome.storage.sync.set({ [item]: value }), [
    `key.${key}`,
    { link: LINK, openMode: 'smart', tabMatch: 'site', closeCurrent: false, ...fields },
  ] as const);

const item = async (worker: Worker, key: string) =>
  (await worker.evaluate((name) => chrome.storage.sync.get(name), `key.${key}`))[`key.${key}`];

/** Opens Options on a key, collecting page errors and console errors; every test expects none. */
async function openOptions(context: BrowserContext, extensionId: string, key?: string) {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto(`chrome-extension://${extensionId}/options.html${key === undefined ? '' : `#key=${key}`}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Keymap' })).toBeVisible();
  return { page, errors };
}

/** A key on the keyboard, by its accessible name: "Option K: …" on a Mac, "Alt K: …" elsewhere. */
const keyCap = (page: Page, key: string) => page.getByRole('button', { name: new RegExp(`^(Option|Alt) ${key}:`) });

const tryButton = (page: Page) => page.getByRole('button', { name: /^Try / });

test('edits a key: the normalized shortcut is stored and Saved shows', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  const { page, errors } = await openOptions(context, extensionId, 'K');
  await expect(keyCap(page, 'K')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('textbox', { name: 'Link', exact: true }).fill('docs.example.com');
  await page.getByLabel('Name — shown in the overlay').fill('Docs');

  await expect(page.getByText('Saved')).toBeVisible();
  expect(await item(worker, 'K')).toEqual({
    link: 'https://docs.example.com/',
    name: 'Docs',
    openMode: 'smart',
    tabMatch: 'site',
    closeCurrent: false,
  });
  await expect(keyCap(page, 'K')).toHaveAccessibleName(/K: Docs$/);
  expect(errors).toEqual([]);
});

test('an invalid link shows an inline error and writes nothing', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'G', {});
  const { page, errors } = await openOptions(context, extensionId, 'G');
  await expect(page.getByText('Saved')).toBeVisible();

  await page.getByRole('textbox', { name: 'Link', exact: true }).fill('mailto:me@example.com');

  await expect(page.getByRole('alert')).toHaveText('Enter a web address, like github.com or https://example.com.');
  await expect(page.getByText('Saved')).toBeHidden();
  await page.waitForTimeout(800);
  expect((await item(worker, 'G')) as { link: string }).toMatchObject({ link: LINK });
  expect(errors).toEqual([]);
});

test('Clear key removes the item and the key shows as free', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'G', { name: 'Fixture' });
  const { page, errors } = await openOptions(context, extensionId, 'G');

  await page.getByRole('button', { name: 'Clear key' }).click();

  await expect.poll(() => item(worker, 'G')).toBeUndefined();
  await expect(keyCap(page, 'G')).toHaveAccessibleName(/G: free$/);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Free key');
  expect(errors).toEqual([]);
});

test.describe('Try', () => {
  test('Smart switch activates the matching open tab and leaves Options alone', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'G', { closeCurrent: true });
    const fixture = await context.newPage();
    await fixture.goto(LINK);
    const { page, errors } = await openOptions(context, extensionId, 'G');
    await page.bringToFront();

    await tryButton(page).click();

    await expect
      .poll(async () => (await worker.evaluate(() => chrome.tabs.query({ active: true })))[0]?.url)
      .toBe(LINK);
    // Switched, not opened again: the fixture tab is still the only one on the link.
    const all = await worker.evaluate(() => chrome.tabs.query({}));
    expect(all.filter((tab) => tab.url === LINK)).toHaveLength(1);
    expect(page.isClosed()).toBe(false);
    expect(page.url()).toBe(`chrome-extension://${extensionId}/options.html#key=G`);
    expect(errors).toEqual([]);
  });

  for (const openMode of ['smart', 'this'] as const) {
    test(`${openMode} with no matching tab opens a new tab and leaves Options alone`, async ({
      context,
      extensionId,
    }) => {
      const worker = await serviceWorker(context, extensionId);
      await store(worker, 'G', { openMode, closeCurrent: true });
      const { page, errors } = await openOptions(context, extensionId, 'G');

      const opened = context.waitForEvent('page');
      await tryButton(page).click();

      await expect.poll(async () => (await opened).url()).toBe(LINK);
      expect(page.isClosed()).toBe(false);
      expect(page.url()).toBe(`chrome-extension://${extensionId}/options.html#key=G`);
      expect(errors).toEqual([]);
    });
  }

  test('is disabled on a free key', async ({ context, extensionId }) => {
    const { page } = await openOptions(context, extensionId, 'J');
    await expect(tryButton(page)).toBeDisabled();
  });
});

test('v1-imported keys appear on the keyboard', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await expect.poll(async () => (await worker.evaluate(() => chrome.storage.sync.get('meta'))).meta).toBeTruthy();
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      speedlink: {
        shortcuts: [
          { canEdit: false, id: '1', shortcut: '1', title: 'Docs', url: 'docs.example.com' },
          { canEdit: false, id: '2', shortcut: 'Y', title: '', url: 'https://video.example/' },
        ],
        settings: { theme: 'system', useShift: true, postAction: 'Jump to tab', smartTabs: true },
      },
    }),
  );
  await expect.poll(() => item(worker, 'Y')).toBeTruthy();

  const { page, errors } = await openOptions(context, extensionId);

  await expect(keyCap(page, '1')).toHaveAccessibleName(/1: Docs$/);
  await expect(keyCap(page, 'Y')).toHaveAccessibleName(/Y: video\.example$/);
  await expect(keyCap(page, '1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/2 of 35 keys in use\./)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a change from another device shows up without a reload', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'G', { name: 'Before' });
  const { page, errors } = await openOptions(context, extensionId, 'G');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Before');

  await store(worker, 'G', { name: 'After' });
  await store(worker, 'Y', {});

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('After');
  await expect(page.getByLabel('Name — shown in the overlay')).toHaveValue('After');
  await expect(keyCap(page, 'Y')).toHaveAccessibleName(/Y: 127\.0\.0\.1:4321$/);
  expect(errors).toEqual([]);
});

test.describe('/ search and the List view', () => {
  const search = (page: Page) => page.getByRole('searchbox', { name: 'Find a link, site or key' });
  const linkField = (page: Page) => page.getByRole('textbox', { name: 'Link', exact: true });
  const bodyRows = (page: Page) => page.locator('tbody tr');

  async function seed(worker: Worker) {
    await store(worker, 'Y', { link: 'https://youtube.com/watch', name: 'Videos' });
    await store(worker, 'G', { link: 'https://github.com/pulls', name: 'Pull requests' });
    await store(worker, 'M', { link: 'https://mail.google.com/' });
  }

  test('Keyboard view: / then a name fragment dims the rest, ↵ selects and focuses Link', async ({
    context,
    extensionId,
  }) => {
    await seed(await serviceWorker(context, extensionId));
    const { page, errors } = await openOptions(context, extensionId, 'Y');

    await page.locator('body').press('/');
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('pull');

    await expect(keyCap(page, 'G')).not.toHaveAttribute('data-dimmed');
    await expect(keyCap(page, 'Y')).toHaveAttribute('data-dimmed', 'true');
    await expect(keyCap(page, 'W')).toHaveAttribute('data-dimmed', 'true');

    await page.keyboard.press('Enter');
    await expect(keyCap(page, 'G')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Pull requests');
    await expect(linkField(page)).toBeFocused();
    await expect(search(page)).toHaveValue('pull');
    expect(new URL(page.url()).hash).toBe('#key=G');
    expect(errors).toEqual([]);
  });

  test('List view: a link fragment hides the other rows; ↵ and a row click select', async ({
    context,
    extensionId,
  }) => {
    await seed(await serviceWorker(context, extensionId));
    const { page, errors } = await openOptions(context, extensionId, 'Y');
    await page.getByRole('radio', { name: 'List' }).click();
    await expect(bodyRows(page)).toHaveCount(3);

    await page.locator('body').press('/');
    await page.keyboard.type('.com/');
    await expect(bodyRows(page)).toHaveCount(3);
    await search(page).fill('google');
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page)).toContainText('mail.google.com');

    await page.keyboard.press('Enter');
    await expect(bodyRows(page)).toHaveAttribute('aria-selected', 'true');
    await expect(linkField(page)).toBeFocused();
    expect(new URL(page.url()).hash).toBe('#key=M');

    await search(page).fill('');
    await bodyRows(page).filter({ hasText: 'Pull requests' }).getByText('Pull requests').click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Pull requests');
    expect(new URL(page.url()).hash).toBe('#key=G');
    expect(errors).toEqual([]);
  });

  test('/ typed in Link stays in the field and leaves the search empty', async ({ context, extensionId }) => {
    const { page, errors } = await openOptions(context, extensionId, 'K');
    await linkField(page).click();
    await page.keyboard.type('github.com/pulls');
    await expect(linkField(page)).toHaveValue('github.com/pulls');
    await expect(linkField(page)).toBeFocused();
    await expect(search(page)).toHaveValue('');
    expect(errors).toEqual([]);
  });

  test('Esc clears the query; a no-match query says "No keys match" in List view', async ({ context, extensionId }) => {
    await seed(await serviceWorker(context, extensionId));
    const { page, errors } = await openOptions(context, extensionId, 'Y');
    await page.getByRole('radio', { name: 'List' }).click();

    await page.locator('body').press('/');
    await page.keyboard.type('zzz');
    await expect(page.getByText('No keys match')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
    await expect(bodyRows(page)).toHaveCount(3);

    await page.keyboard.press('Escape');
    await expect(search(page)).not.toBeFocused();
    expect(errors).toEqual([]);
  });
});

test.describe('drag-to-swap', () => {
  const youtube = { link: LINK, name: 'YouTube', openMode: 'new', tabMatch: 'page', closeCurrent: true };
  const kagi = { link: `${LINK}&kagi`, name: 'Kagi', openMode: 'bg', tabMatch: 'exact', closeCurrent: false };

  /** Drags one key onto another with the mouse, in steps, as a hand would. */
  async function drag(page: Page, from: string, to: string) {
    const start = await keyCap(page, from).boundingBox();
    const end = await keyCap(page, to).boundingBox();
    if (start === null || end === null) throw new Error('key not laid out');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  }

  /** Picks up a key with Space. dnd-kit listens for the next keys from a `setTimeout(0)`: wait for it to run. */
  async function pickUp(page: Page, key: string) {
    await keyCap(page, key).focus();
    await page.keyboard.press('Space');
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  test('a mouse drag swaps two shortcuts, every field intact; the selection follows', async ({
    context,
    extensionId,
  }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'Y', youtube);
    await store(worker, 'K', kagi);
    await store(worker, 'G', {});
    const { page, errors } = await openOptions(context, extensionId, 'G');

    await drag(page, 'Y', 'K');
    await expect(keyCap(page, 'K')).toHaveAttribute('data-state', 'drop-target');
    await page.mouse.up();

    await expect.poll(() => item(worker, 'K')).toEqual(youtube);
    expect(await item(worker, 'Y')).toEqual(kagi);
    await expect(keyCap(page, 'K')).toHaveAttribute('aria-pressed', 'true');
    await expect(keyCap(page, 'K')).toHaveAccessibleName(/K: YouTube$/);
    expect(new URL(page.url()).hash).toBe('#key=K');
    await expect(page.getByText('Saved')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the keyboard moves a shortcut onto a free key and the selection follows', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'Y', youtube);
    const { page, errors } = await openOptions(context, extensionId, 'Y');

    await pickUp(page, 'Y');
    await page.keyboard.press('ArrowDown');
    await expect(keyCap(page, 'H')).toHaveAttribute('data-state', 'drop-target');
    await page.keyboard.press('Space');

    await expect.poll(() => item(worker, 'H')).toEqual(youtube);
    expect(await item(worker, 'Y')).toBeUndefined();
    await expect(keyCap(page, 'H')).toHaveAttribute('aria-pressed', 'true');
    await expect(keyCap(page, 'Y')).toHaveAccessibleName(/Y: free$/);
    await page.waitForTimeout(300);
    expect(new URL(page.url()).hash).toBe('#key=H');
    expect(errors).toEqual([]);
  });

  test('S is never a target, by mouse or by arrows', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'A', youtube);
    const { page, errors } = await openOptions(context, extensionId, 'A');

    await drag(page, 'A', 'S');
    await expect(keyCap(page, 'S')).toHaveAttribute('data-state', 'reserved');
    await page.mouse.up();
    await expect(keyCap(page, 'A')).not.toHaveAttribute('data-dimmed', 'true');

    await pickUp(page, 'A');
    await page.keyboard.press('ArrowRight');
    await expect(keyCap(page, 'D')).toHaveAttribute('data-state', 'drop-target');
    await expect(keyCap(page, 'S')).toHaveAttribute('data-state', 'reserved');
    await page.keyboard.press('Escape');

    await page.waitForTimeout(800);
    expect(await item(worker, 'A')).toEqual(youtube);
    expect(await item(worker, 'D')).toBeUndefined();
    await expect(keyCap(page, 'A')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('a click without movement still just selects', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'Y', youtube);
    const { page, errors } = await openOptions(context, extensionId, 'K');

    await keyCap(page, 'Y').click();

    await expect(keyCap(page, 'Y')).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).hash).toBe('#key=Y');
    expect(await item(worker, 'Y')).toEqual(youtube);
    expect(errors).toEqual([]);
  });
});
