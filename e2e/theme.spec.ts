// The theme as the built extension renders it (product spec §12.1), on the Options placeholder page.
import { existsSync } from 'node:fs';
import { EXTENSION_PATH, expect, test } from './extension';

test('extension pages render in "SpeedLink Inter" from the bundled font', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The page's own text requests the face; nothing here forces a load.
  const font = () =>
    page.evaluate(() => {
      const faces = Array.from(document.fonts).filter((face) => face.family.replaceAll('"', '') === 'SpeedLink Inter');
      return { check: document.fonts.check('16px "SpeedLink Inter"'), statuses: faces.map((face) => face.status) };
    });
  await expect.poll(font).toEqual({ check: true, statuses: ['loaded'] });

  const file = await page.evaluate(async () => {
    const response = await fetch('/fonts/inter-latin-wght.woff2');
    return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
  });
  expect(file.ok).toBe(true);
  expect(file.bytes).toBeGreaterThan(10_000);
});

test('the body takes the background token and the 16 px base size', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const body = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, fontSize: style.fontSize };
  });
  // --background: #F3F4F7. Chrome's own extension-page sheet would make the body 12 px.
  expect(body).toEqual({ background: 'rgb(243, 244, 247)', fontSize: '16px' });
});

test('the Inter licence ships next to the font', () => {
  expect(existsSync(`${EXTENSION_PATH}/fonts/OFL.txt`)).toBe(true);
});

test('the dev-only gallery is left out of the build', () => {
  expect(existsSync(`${EXTENSION_PATH}/gallery.html`)).toBe(false);
});
