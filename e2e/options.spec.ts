import type { BrowserContext, Page, Worker } from '@playwright/test';
import { FIXTURE_PORT } from '../playwright.config';
import { expect, test } from './extension';

// The Options keymap in the built extension (product spec §8): the key editor dialog and its modality, editing,
// validation, Clear key, Test through the real `tryKey` message, the hash selection, v1-imported keys, live sync
// changes, the `/` search, the List view and drag-to-swap. Each combination is unit-tested in
// src/entrypoints/options/OptionsPage.test.tsx; this covers real storage, real tabs, real layout and the background.

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
    { link: LINK, openMode: 'smart', tabMatch: 'page', closeCurrent: false, ...fields },
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
  // With #key the dialog is open and the page behind it is hidden from assistive tech.
  await expect(page.getByRole('heading', { level: 1, name: 'Keymap', includeHidden: true })).toBeVisible();
  return { page, errors };
}

/**
 * A key on the keyboard, by its accessible name: "Option K: …" on a Mac, "Alt K: …" elsewhere. Found behind the
 * dialog's scrim too, where its name is read from `aria-label`.
 */
const keyCap = (page: Page, key: string) =>
  page.getByRole('button', { name: new RegExp(`^(Option|Alt) ${key}:`), includeHidden: true });

/** The key editor dialog. */
const editor = (page: Page) => page.getByRole('dialog', { name: 'Edit key' });
const editorTitle = (page: Page) => editor(page).getByRole('heading', { level: 2 });
const testButton = (page: Page) => editor(page).getByRole('button', { name: 'Test' });
const nameField = (page: Page) => page.getByLabel('Name — optional');

test('edits a key: the normalized shortcut is stored and Saved shows', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  const { page, errors } = await openOptions(context, extensionId, 'K');
  await expect(keyCap(page, 'K')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor(page)).toBeVisible();

  await page.getByRole('textbox', { name: 'Link', exact: true }).fill('docs.example.com');
  await nameField(page).fill('Docs');

  await expect(page.getByText('Saved')).toBeVisible();
  expect(await item(worker, 'K')).toEqual({
    link: 'https://docs.example.com/',
    name: 'Docs',
    openMode: 'smart',
    tabMatch: 'page',
    closeCurrent: false,
  });
  await editor(page).getByRole('button', { name: 'More options' }).click();
  await expect(page.getByRole('radio', { name: 'This page' })).toHaveAttribute('aria-checked', 'true');
  await expect(keyCap(page, 'K')).toHaveAttribute('aria-label', /K: Docs$/);
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

test('Clear key removes the item, the key shows as free and the editor stays on it', async ({
  context,
  extensionId,
}) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'G', { name: 'Fixture' });
  const { page, errors } = await openOptions(context, extensionId, 'G');

  await page.getByRole('button', { name: 'Clear key' }).click();

  await expect.poll(() => item(worker, 'G')).toBeUndefined();
  await expect(keyCap(page, 'G')).toHaveAttribute('aria-label', /G: free$/);
  await expect(editorTitle(page)).toHaveText('Free key');
  await expect(testButton(page)).toBeDisabled();
  expect(errors).toEqual([]);
});

test.describe('Test', () => {
  test('Smart switch activates the matching open tab and leaves Options alone', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'G', { closeCurrent: true });
    const fixture = await context.newPage();
    await fixture.goto(LINK);
    const { page, errors } = await openOptions(context, extensionId, 'G');
    await page.bringToFront();

    await testButton(page).click();

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
      await testButton(page).click();

      await expect.poll(async () => (await opened).url()).toBe(LINK);
      expect(page.isClosed()).toBe(false);
      expect(page.url()).toBe(`chrome-extension://${extensionId}/options.html#key=G`);
      expect(errors).toEqual([]);
    });
  }

  test('is disabled on a free key', async ({ context, extensionId }) => {
    const { page } = await openOptions(context, extensionId, 'J');
    await expect(testButton(page)).toBeDisabled();
    await expect(editor(page).getByRole('button', { name: 'Clear key' })).toBeDisabled();
  });
});

test.describe('⌥ + key on Options', () => {
  test('opens the key in a new tab and leaves Options alone, draft included', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'G', { openMode: 'this', closeCurrent: true });
    const { page, errors } = await openOptions(context, extensionId, 'G');
    await page.bringToFront();
    await nameField(page).fill('Draft');

    const opened = context.waitForEvent('page');
    // Focus leaves the field first: ⌥ + key typed in a field is the field's. Esc in a changed field only leaves it.
    await page.keyboard.press('Escape');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Alt+KeyG');

    await expect.poll(async () => (await opened).url()).toBe(LINK);
    expect(page.isClosed()).toBe(false);
    expect(page.url()).toBe(`chrome-extension://${extensionId}/options.html#key=G`);
    await expect(nameField(page)).toHaveValue('Draft');
    expect(errors).toEqual([]);
  });

  test('on a free key opens its editor with focus in Link', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'G', {});
    const { page, errors } = await openOptions(context, extensionId);

    await page.keyboard.press('Alt+KeyK');

    await expect(editorTitle(page)).toHaveText('Free key');
    await expect(page.getByRole('textbox', { name: 'Link', exact: true })).toBeFocused();
    expect(page.url()).toBe(`chrome-extension://${extensionId}/options.html#key=K`);
    expect(errors).toEqual([]);
  });

  test('⌥S focuses the search', async ({ context, extensionId }) => {
    const { page, errors } = await openOptions(context, extensionId);

    await page.keyboard.press('Alt+KeyS');

    await expect(page.getByRole('searchbox', { name: 'Find a link, site or key' })).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('#search focuses the search without reloading, as the toggle-overlay command sends it', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openOptions(context, extensionId);

    await page.evaluate(() => {
      window.location.hash = '#search';
    });

    await expect(page.getByRole('searchbox', { name: 'Find a link, site or key' })).toBeFocused();
    await expect.poll(() => page.url()).toBe(`chrome-extension://${extensionId}/options.html`);
    expect(errors).toEqual([]);
  });

  test('#search with the dialog open keeps it and its draft, and puts #key back', async ({ context, extensionId }) => {
    const { page, errors } = await openOptions(context, extensionId, 'G');
    await page.getByRole('textbox', { name: 'Link', exact: true }).fill('https://unsaved.example/');

    await page.evaluate(() => {
      window.location.hash = '#search';
    });

    await expect.poll(() => page.url()).toBe(`chrome-extension://${extensionId}/options.html#key=G`);
    await expect(page.getByRole('textbox', { name: 'Link', exact: true })).toHaveValue('https://unsaved.example/');
    await expect(page.getByRole('textbox', { name: 'Link', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
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
  await expect(page.getByText(/2 of 35 keys in use\./)).toBeVisible();
  // Nothing is selected without a #key: no editor until a key is clicked.
  await expect(editor(page)).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  expect(errors).toEqual([]);
});

test('a change from another device shows up without a reload', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context, extensionId);
  await store(worker, 'G', { name: 'Before' });
  const { page, errors } = await openOptions(context, extensionId, 'G');
  await expect(editorTitle(page)).toHaveText('Before');

  await store(worker, 'G', { name: 'After' });
  await store(worker, 'Y', {});

  await expect(editorTitle(page)).toHaveText('After');
  await expect(nameField(page)).toHaveValue('After');
  await expect(keyCap(page, 'Y')).toHaveAttribute('aria-label', /Y: 127\.0\.0\.1:4321$/);
  expect(errors).toEqual([]);
});

test.describe('/ search and the List view', () => {
  const search = (page: Page) => page.getByRole('searchbox', { name: 'Find a link, site or key', includeHidden: true });
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
    const { page, errors } = await openOptions(context, extensionId);

    await page.locator('body').press('/');
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('pull');

    await expect(keyCap(page, 'G')).not.toHaveAttribute('data-dimmed');
    await expect(keyCap(page, 'Y')).toHaveAttribute('data-dimmed', 'true');
    await expect(keyCap(page, 'W')).toHaveAttribute('data-dimmed', 'true');

    await page.keyboard.press('Enter');
    await expect(keyCap(page, 'G')).toHaveAttribute('aria-pressed', 'true');
    await expect(editorTitle(page)).toHaveText('Pull requests');
    await expect(linkField(page)).toBeFocused();
    await expect(search(page)).toHaveValue('pull');
    expect(new URL(page.url()).hash).toBe('#key=G');
    expect(errors).toEqual([]);
  });

  test('List view: a link fragment hides the other rows; ↵ and a row click open the key over the list', async ({
    context,
    extensionId,
  }) => {
    await seed(await serviceWorker(context, extensionId));
    const { page, errors } = await openOptions(context, extensionId);
    const list = page.getByRole('radio', { name: 'List' });
    await list.click();
    await expect(bodyRows(page)).toHaveCount(3);

    await page.locator('body').press('/');
    await page.keyboard.type('.com/');
    await expect(bodyRows(page)).toHaveCount(3);
    await search(page).fill('google');
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page)).toContainText('mail.google.com');

    await page.keyboard.press('Enter');
    await expect(editorTitle(page)).toHaveText('mail.google.com');
    await expect(linkField(page)).toBeFocused();
    await expect(bodyRows(page).filter({ hasText: 'mail.google.com' })).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).hash).toBe('#key=M');

    await editor(page).getByRole('button', { name: 'Done' }).click();
    await expect(list).toHaveAttribute('aria-checked', 'true');
    await search(page).fill('');
    await bodyRows(page).filter({ hasText: 'Pull requests' }).getByText('Pull requests').click();
    await expect(editorTitle(page)).toHaveText('Pull requests');
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
    const { page, errors } = await openOptions(context, extensionId);
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

  test('a mouse drag with the dialog closed swaps two shortcuts, every field intact, and selects nothing', async ({
    context,
    extensionId,
  }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'Y', youtube);
    await store(worker, 'K', kagi);
    const { page, errors } = await openOptions(context, extensionId);

    await drag(page, 'Y', 'K');
    await expect(keyCap(page, 'K')).toHaveAttribute('data-state', 'drop-target');
    await page.mouse.up();

    await expect.poll(() => item(worker, 'K')).toEqual(youtube);
    expect(await item(worker, 'Y')).toEqual(kagi);
    await expect(keyCap(page, 'K')).toHaveAccessibleName(/K: YouTube$/);
    await expect(editor(page)).toHaveCount(0);
    await expect(page.getByRole('button', { pressed: true })).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
    expect(errors).toEqual([]);
  });

  test('the keyboard moves a shortcut onto a free key, and neither Space opens a dialog', async ({
    context,
    extensionId,
  }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'Y', youtube);
    const { page, errors } = await openOptions(context, extensionId);

    await pickUp(page, 'Y');
    await expect(editor(page)).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(keyCap(page, 'H')).toHaveAttribute('data-state', 'drop-target');
    await page.keyboard.press('Space');

    await expect.poll(() => item(worker, 'H')).toEqual(youtube);
    expect(await item(worker, 'Y')).toBeUndefined();
    await expect(keyCap(page, 'Y')).toHaveAccessibleName(/Y: free$/);
    await page.waitForTimeout(300);
    await expect(editor(page)).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');

    // The next ↵ on the focused key still opens it.
    await expect(keyCap(page, 'H')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editorTitle(page)).toHaveText('YouTube');
    expect(errors).toEqual([]);
  });

  test('S is never a target, by mouse or by arrows', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'A', youtube);
    const { page, errors } = await openOptions(context, extensionId);

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
    await expect(editor(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a click without movement opens the dialog', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'Y', youtube);
    const { page, errors } = await openOptions(context, extensionId);

    await keyCap(page, 'Y').click();

    await expect(editorTitle(page)).toHaveText('YouTube');
    expect(new URL(page.url()).hash).toBe('#key=Y');
    expect(await item(worker, 'Y')).toEqual(youtube);
    expect(errors).toEqual([]);
  });
});

test.describe('the key editor dialog', () => {
  const box = async (locator: ReturnType<Page['locator']>) => {
    const bounds = await locator.boundingBox();
    if (bounds === null) throw new Error('not laid out');
    return bounds;
  };
  const chip = (key: string) => new RegExp(`^(⌥|Alt\\+)${key}$`);
  /** The dialog's box lies wholly inside the viewport. */
  const insideViewport = async (page: Page) => {
    const dialog = await box(editor(page));
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('no viewport');
    return (
      dialog.x >= 0 &&
      dialog.y >= 0 &&
      dialog.x + dialog.width <= viewport.width &&
      dialog.y + dialog.height <= viewport.height
    );
  };

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 600, height: 500 },
  ]) {
    for (const key of ['1', 'P', 'M', 'N']) {
      test(`opens on ${key} fully inside a ${viewport.width}×${viewport.height} window, centred`, async ({
        context,
        extensionId,
      }) => {
        const { page, errors } = await openOptions(context, extensionId);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize(viewport);

        await keyCap(page, key).click();
        await expect(editor(page).getByText(chip(key))).toBeVisible();

        expect(await insideViewport(page)).toBe(true);
        const dialog = await box(editor(page));
        expect(Math.abs(dialog.x + dialog.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
        expect(dialog.width).toBeLessThanOrEqual(448);
        expect(errors).toEqual([]);
      });
    }
  }

  test('loading #key on a bottom-row key in a short window shows the whole dialog', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openOptions(context, extensionId);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 600, height: 500 });

    await page.goto(`chrome-extension://${extensionId}/options.html#key=N`);
    await page.reload();
    await expect(editor(page)).toBeVisible();
    expect(await insideViewport(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('is modal: Tab cycles inside it and the page behind does not scroll', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'G', {});
    const { page, errors } = await openOptions(context, extensionId);
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.evaluate(() => window.scrollTo(0, 120));
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(0);

    await keyCap(page, 'G').click();
    await expect(editor(page)).toBeFocused();
    for (let step = 0; step < 25; step++) {
      await page.keyboard.press('Tab');
      expect(await editor(page).evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    }

    await page.mouse.move(20, 250);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    expect(errors).toEqual([]);
  });

  test('a scrim click closes it and keeps a valid edit; focus goes back to the key', async ({
    context,
    extensionId,
  }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'G', { name: 'Before' });
    const { page, errors } = await openOptions(context, extensionId);

    await keyCap(page, 'G').click();
    await nameField(page).fill('After');
    await page.mouse.click(10, 10);

    await expect(editor(page)).toHaveCount(0);
    await expect.poll(async () => (await item(worker, 'G')) as { name?: string }).toMatchObject({ name: 'After' });
    await expect(keyCap(page, 'G')).toBeFocused();
    expect(new URL(page.url()).hash).toBe('');
    expect(errors).toEqual([]);
  });

  test('closes with Done and Esc; focus goes back to the key and the hash goes', async ({ context, extensionId }) => {
    const { page, errors } = await openOptions(context, extensionId, 'K');

    await editor(page).getByRole('button', { name: 'Done' }).click();
    await expect(editor(page)).toHaveCount(0);
    await expect(keyCap(page, 'K')).toBeFocused();
    expect(new URL(page.url()).hash).toBe('');

    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Link', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(keyCap(page, 'K')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('a List row click opens it over the list, and closing returns to the row', async ({ context, extensionId }) => {
    const worker = await serviceWorker(context, extensionId);
    await store(worker, 'G', { name: 'Pull requests' });
    const { page, errors } = await openOptions(context, extensionId);
    await page.getByRole('radio', { name: 'List' }).click();

    await page.locator('tbody tr').filter({ hasText: 'Pull requests' }).getByText('Pull requests').click();

    await expect(editorTitle(page)).toHaveText('Pull requests');
    await expect(page.locator('tbody tr')).toBeVisible();
    await editor(page).getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    await expect(keyCap(page, 'G')).toBeFocused();
    expect(errors).toEqual([]);
  });
});
