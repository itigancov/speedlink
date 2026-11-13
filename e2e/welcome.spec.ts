import { expect, test, welcomeTabs } from './extension';

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

  await expect(welcome).toHaveURL(`chrome-extension://${extensionId}/options.html`);
  await expect(welcome.getByRole('heading', { level: 1, name: 'Keymap' })).toBeVisible();
  expect(context.pages()).toHaveLength(tabs);
  expect(welcomeTabs(context)).toHaveLength(0);
});

test('an update within 4.x opens no second welcome tab', async ({ context, updateExtension }) => {
  await expect.poll(() => welcomeTabs(context).length).toBe(1);
  await welcomeTabs(context)[0]?.close();

  await updateExtension();
  // Give a late tab every chance to open.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  expect(welcomeTabs(context)).toHaveLength(0);
});
