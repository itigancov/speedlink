import { FIXTURE_PORT } from '../playwright.config';
import { expect, serviceWorker, test, welcomeTabs } from './extension';

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: { storage: { sync: { set(items: object): Promise<void> } } };

const LINK = `http://127.0.0.1:${FIXTURE_PORT}/frame-child.html?welcome`;

// The welcome tab (product spec §9). The rule for when it opens is unit-tested in src/domain/welcome.test.ts and the
// page's content in src/entrypoints/welcome/WelcomePage.test.tsx; this covers the real install, the button and an
// update. The harness closes the tab on launch in every other spec; here it is left open.
test.use({ keepWelcomeTab: true });

test('a fresh install opens one welcome tab, with the heading and the three steps', async ({
  context,
  extensionId,
}) => {
  await expect.poll(() => welcomeTabs(context).length).toBe(1);
  const [welcome] = welcomeTabs(context);
  if (welcome === undefined) throw new Error('no welcome tab');

  expect(welcome.url()).toBe(`chrome-extension://${extensionId}/welcome.html`);
  await expect(welcome).toHaveTitle('Welcome to SpeedLink');
  await expect(welcome.getByRole('heading', { level: 1 })).toHaveText(
    /^Hold (⌥|Alt) and press a key to jump to a site$/,
  );
  await expect(welcome.getByRole('listitem')).toHaveCount(3);
  // Give a second copy every chance to open.
  await welcome.waitForTimeout(500);
  expect(welcomeTabs(context)).toHaveLength(1);
});

test('"Open keymap" turns the welcome tab into Options', async ({ context, extensionId }) => {
  await expect.poll(() => welcomeTabs(context).length).toBe(1);
  const [welcome] = welcomeTabs(context);
  if (welcome === undefined) throw new Error('no welcome tab');
  const tabs = context.pages().length;

  await welcome.getByRole('button', { name: 'Open keymap' }).click();

  // Options mirrors its selected key into the hash as soon as it has read the keymap.
  await expect(welcome).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/options\\.html(#key=[A-Z0-9])?$`));
  await expect(welcome.getByRole('heading', { level: 1, name: 'Put your first link on a key' })).toBeVisible();
  expect(context.pages()).toHaveLength(tabs);
  expect(welcomeTabs(context)).toHaveLength(0);
});

test('⌥ + key opens the key in a new tab and leaves the welcome tab where it is', async ({ context, extensionId }) => {
  await expect.poll(() => welcomeTabs(context).length).toBe(1);
  const [welcome] = welcomeTabs(context);
  if (welcome === undefined) throw new Error('no welcome tab');
  const worker = await serviceWorker(context);
  await worker.evaluate(
    (link) =>
      chrome.storage.sync.set({
        'key.G': { link, openMode: 'this', tabMatch: 'exact', closeCurrent: true },
      }),
    LINK,
  );
  await welcome.bringToFront();
  // The page reads its keymap live; give it a moment to see the new key.
  await welcome.waitForTimeout(300);

  const opened = context.waitForEvent('page');
  await welcome.keyboard.press('Alt+KeyG');

  await expect.poll(async () => (await opened).url()).toBe(LINK);
  expect(welcome.isClosed()).toBe(false);
  expect(welcome.url()).toBe(`chrome-extension://${extensionId}/welcome.html`);
});

test('⌥ + a free key takes the user to Options on that key', async ({ context, extensionId }) => {
  await expect.poll(() => welcomeTabs(context).length).toBe(1);
  const [welcome] = welcomeTabs(context);
  if (welcome === undefined) throw new Error('no welcome tab');
  await welcome.bringToFront();
  await welcome.waitForTimeout(300);

  const options = context.waitForEvent('page');
  await welcome.keyboard.press('Alt+KeyK');

  expect((await options).url()).toBe(`chrome-extension://${extensionId}/options.html#key=K`);
  expect(welcome.isClosed()).toBe(false);
});

test('an update within 4.x opens no second welcome tab', async ({ context, updateExtension }) => {
  await expect.poll(() => welcomeTabs(context).length).toBe(1);
  await welcomeTabs(context)[0]?.close();

  await updateExtension();
  // Give a late tab every chance to open.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  expect(welcomeTabs(context)).toHaveLength(0);
});
