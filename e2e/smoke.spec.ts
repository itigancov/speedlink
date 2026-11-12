import { expect, fromExtension, THROW_EXTENSION_PATH, test } from './extension';

test('the service worker registers and exposes the extension ID', async ({ extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});

/** Each page's top heading: Options shows the keymap (product spec §8.1), the others are still placeholders. */
const HEADINGS = { options: 'Keymap', popup: 'SpeedLink', welcome: 'SpeedLink' };

for (const [page, heading] of Object.entries(HEADINGS)) {
  test(`${page}.html opens with no page errors`, async ({ context, extensionId }) => {
    const tab = await context.newPage();
    const errors: string[] = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    tab.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await tab.goto(`chrome-extension://${extensionId}/${page}.html`);

    await expect(tab.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('the HUD content script loads in every frame without exceptions', async ({
  extensionId,
  openWithExceptionCapture,
}) => {
  const { page, exceptions } = await openWithExceptionCapture('/frames.html');

  await expect(page.frameLocator('iframe').getByText('Child frame')).toBeVisible();
  // Give document_start scripts in both frames time to report anything.
  await page.waitForTimeout(500);
  expect(fromExtension(exceptions, extensionId)).toEqual([]);
});

test.describe('negative control: a build-flagged content-script throw', () => {
  test.use({ extensionPath: THROW_EXTENSION_PATH });

  test('is caught by the exception capture in both frames', async ({ extensionId, openWithExceptionCapture }) => {
    const { exceptions } = await openWithExceptionCapture('/frames.html');

    await expect.poll(() => fromExtension(exceptions, extensionId).length, { message: 'one throw per frame' }).toBe(2);
    for (const e of fromExtension(exceptions, extensionId)) {
      expect(e.description).toContain('speedlink-e2e-negative-control');
      expect(e.url).toContain('/content-scripts/hud.js');
    }
  });
});
