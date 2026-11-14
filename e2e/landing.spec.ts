// Guards the landing page in `site/` (backlog item 24): its links, the privacy promise that it loads nothing from
// anywhere else, that its media loads (the demo loop, item 25) and that its screenshots and font are the current
// copies. The page is served at its real Pages URL from disk; no extension is involved. Look and layout are the author's review, not this spec's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = join(ROOT, 'site');
const PAGES = 'https://itigancov.github.io/speedlink/';
const STORE_ITEM = 'https://chromewebstore.google.com/detail/kddkenmaadibebdpekhfibihfpealhbe';
const ISSUES = 'https://github.com/itigancov/speedlink/issues';
const REPO = 'https://github.com/itigancov/speedlink';

interface Visit {
  /** Requests for anything outside `site/`: they fail, and the test fails on them. */
  outside: string[];
  /** Requests inside `site/` for a file that isn't there. */
  missing: string[];
}

/**
 * Opens the page at its Pages URL with every request routed: `site/` is served from disk (a folder from its
 * `index.html`), a missing file 404s, anything else is aborted and recorded. Scrolls to the end so lazy images load.
 */
async function visit(page: Page): Promise<Visit> {
  const visit: Visit = { outside: [], missing: [] };
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(PAGES)) {
      visit.outside.push(url);
      return route.abort();
    }
    const path = decodeURIComponent(new URL(url).pathname.slice(new URL(PAGES).pathname.length));
    const file = join(SITE, path === '' || path.endsWith('/') ? `${path}index.html` : path);
    if (!existsSync(file)) {
      visit.missing.push(url);
      return route.fulfill({ status: 404 });
    }
    return route.fulfill({ status: 200, body: readFileSync(file), contentType: contentType(file) });
  });
  await page.goto(PAGES);
  for (const image of await page.locator('img').all()) await image.scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  return visit;
}

function contentType(file: string): string {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.png': 'image/png',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.woff2': 'font/woff2',
  };
  return types[extname(file)] ?? 'application/octet-stream';
}

test('the Add to Chrome buttons open the Store item', async ({ page }) => {
  await visit(page);
  const buttons = page.getByRole('link', { name: 'Add to Chrome' });
  expect(await buttons.count()).toBeGreaterThanOrEqual(2);
  for (const href of await hrefs(page, 'Add to Chrome')) expect(href).toBe(STORE_ITEM);
});

test('links the privacy policy, Support on GitHub Issues and the source', async ({ page }) => {
  await visit(page);
  expect(await hrefs(page, 'Privacy policy')).toContain('privacy/');
  expect(await hrefs(page, 'Support')).toEqual([ISSUES]);
  expect(await hrefs(page, 'Source on GitHub')).toEqual([REPO]);
});

test('requests nothing from outside site/', async ({ page }) => {
  const { outside } = await visit(page);
  expect(outside).toEqual([]);
});

test('every image, video, font and icon it references is in site/ and loads', async ({ page }) => {
  const { missing } = await visit(page);
  expect(missing).toEqual([]);
  const references = await page.evaluate(() => [
    ...[...document.images].map((image) => image.currentSrc),
    ...[...document.querySelectorAll('video')].map((video) => video.poster),
    ...[...document.querySelectorAll('video source')].map((source) => (source as HTMLSourceElement).src),
    ...[...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="preload"]')].map(
      (link) => link.href,
    ),
    ...[...document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')].map(
      (meta) => meta.content,
    ),
  ]);
  expect(references.length).toBeGreaterThan(0);
  for (const url of references) {
    expect(url, 'inside the Pages site').toMatch(new RegExp(`^${PAGES}`));
    expect(existsSync(join(SITE, new URL(url).pathname.slice(new URL(PAGES).pathname.length))), url).toBe(true);
  }
  const unloaded = await page.evaluate(() =>
    [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src),
  );
  expect(unloaded).toEqual([]);
  // Each video picked a source and read its header.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('video')].map((video) => video.readyState >= 1 && video.currentSrc !== ''),
      ),
    )
    .not.toContain(false);
  const fonts = await page.evaluate(() => [...document.fonts].map(({ family, status }) => `${family}: ${status}`));
  expect(fonts).toEqual(['SpeedLink Inter: loaded']);
});

test('under reduced motion the hero shows the demo poster and plays nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visit(page);
  const hero = page.locator('.hero video');
  await expect(hero).toHaveAttribute('poster', 'media/demo-poster.png');
  expect(await hero.evaluate((video: HTMLVideoElement) => ({ src: video.currentSrc, paused: video.paused }))).toEqual({
    src: '',
    paused: true,
  });
});

async function hrefs(page: Page, name: string): Promise<(string | null)[]> {
  const links = await page.getByRole('link', { name, exact: true }).all();
  expect(links.length, `a link named "${name}"`).toBeGreaterThan(0);
  return Promise.all(links.map((link) => link.getAttribute('href')));
}

/** The copies in `site/<folder>/` of files in the folder they come from; `site/media/` also has files of its own. */
const copies = (folder: string, from: string) =>
  readdirSync(join(SITE, folder))
    .filter((name) => existsSync(join(ROOT, from, name)))
    .map((name) => ({ copy: `${folder}/${name}`, original: `${from}/${name}` }));

// The screenshots (`pnpm listing` writes both), Inter and the favicon.
for (const { copy, original } of [
  ...copies('media', 'store'),
  ...copies('fonts', 'public/fonts'),
  ...copies('icon', 'public/icon'),
]) {
  test(`site/${copy} is the same file as ${original}`, () => {
    expect(readFileSync(join(SITE, copy)).equals(readFileSync(join(ROOT, original)))).toBe(true);
  });
}
