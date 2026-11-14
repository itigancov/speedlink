// `pnpm listing`: draws every image the Web Store listing needs from the real build (the e2e-hooks variant, which has
// the popup's `?tabId=N` entry), into `store/` and `public/icon/`. The demo keymap goes straight into storage.sync,
// every demo site is a routed stub, and the browser says it is Chrome on Windows, so the triggers read "Alt". Last,
// it refreshes the landing page's copies in `site/media/`. A second scenario records the demo loop (item 25) for the
// landing page and the README, and draws the social card. Not part of `pnpm e2e` or CI: the author reviews the images
// (item 20) and the loop before they are uploaded (item 22) or committed.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import type { KeyLabel } from '@/domain/keys';
import { expect, HOOKS_EXTENSION_PATH, serviceWorker, test } from '../e2e/extension';
import { BACKDROP_URL, DEMO_KEYMAP } from './demo';
import { flatten, inspect } from './png';
import {
  DEMO_PAGE,
  type DemoTab,
  demoFramePage,
  iconPage,
  popupCompositePage,
  promoTilePage,
  socialCardPage,
} from './templates';
import { encodeDemo } from './video';

interface Tab {
  id: number;
  url?: string;
  title?: string;
  active: boolean;
  index: number;
  windowId: number;
}

/** The part of `chrome` these service-worker evaluations use; e2e does not load the extension's types. */
declare const chrome: {
  storage: { sync: { set(items: object): Promise<void> } };
  tabs: { query(info: object): Promise<Tab[]> };
};
declare const speedlinkE2E: { toggleOverlay(tab: Tab): Promise<void> };

const ROOT = resolve(import.meta.dirname, '..');
const STORE = join(ROOT, 'store');
const ICONS = join(ROOT, 'public/icon');
/** The landing page's media: its copies of the Store images (e2e/landing.spec.ts checks they match `store/`), the
 * demo loop and the social card. */
const SITE_MEDIA = join(ROOT, 'site/media');
/** The README's copy of the demo loop. */
const README_GIF = join(ROOT, 'docs/media/demo.gif');

const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SCREENSHOT = { width: 1280, height: 800 };
const TILE = { width: 440, height: 280 };
const CARD = { width: 1200, height: 630 };
/** The trigger as the demo's Windows browser labels it. */
const ALT = 'Alt' as KeyLabel;
/** The Store takes 128 px icons as 96 px of artwork inside 16 px of transparent padding. */
const ICON_SIZES = [
  { size: 16, padding: 0 },
  { size: 32, padding: 0 },
  { size: 48, padding: 0 },
  { size: 128, padding: 16 },
];

// The browser's user agent is set by the launch switch: a context option would not reach the service worker or the
// content scripts, and their labels would stay macOS's.
test.use({
  extensionPath: HOOKS_EXTENSION_PATH,
  // No host resolves: a request the routes miss fails instead of reaching the live site.
  launchArgs: [`--user-agent=${WINDOWS_CHROME}`, '--host-resolver-rules=MAP * ~NOTFOUND'],
  extraContextOptions: { viewport: SCREENSHOT, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' },
});

/** What every demo site's stub page says: its name, as the tab title and centred on a plain page with its host. */
const stub = (title: string, host: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="margin:0;height:100vh;display:grid;
place-content:center;text-align:center;font:600 32px/1.3 system-ui;color:#1a1c1e;background:#f7f8fa">${title}
<div style="font:400 16px/1.5 system-ui;color:#5b6070">${host}</div></body>`;

/** Answers every http(s) request itself: the backdrop from the repo, a stub for each demo site, nothing else. */
async function routeDemoSites(context: BrowserContext): Promise<void> {
  const backdrop = readFileSync(join(import.meta.dirname, 'fixtures/backdrop.html'), 'utf8');
  const names = new Map(DEMO_KEYMAP.map(({ link, name }) => [new URL(link).hostname, name]));
  await context.route(
    (url) => url.protocol === 'https:' || url.protocol === 'http:',
    (route) => {
      const { hostname } = new URL(route.request().url());
      const html =
        hostname === new URL(BACKDROP_URL).hostname ? backdrop : stub(names.get(hostname) ?? hostname, hostname);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    },
  );
}

/** The built extension pages' stylesheets, to write the listing's own pages with the product's tokens and font. */
function builtStylesheets(): string[] {
  const html = ['options.html', 'popup.html']
    .map((file) => readFileSync(join(HOOKS_EXTENSION_PATH, file), 'utf8'))
    .join('\n');
  return [
    ...new Set([...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map(([, href]) => href as string)),
  ];
}

/** An extension page the listing draws its own HTML into, keeping the extension origin its font and styles need. */
async function drawingPage(context: BrowserContext, extensionId: string, html: string, size: object): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800, ...size });
  await page.goto(`chrome-extension://${extensionId}/welcome.html`);
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  return page;
}

/** The demo keymap, seeded in the stored shape before any page opens. */
async function seedKeymap(worker: Worker): Promise<void> {
  await worker.evaluate(
    (items) => chrome.storage.sync.set(items),
    Object.fromEntries(
      DEMO_KEYMAP.map(({ key, name, link, openMode, tabMatch }) => [
        `key.${key}`,
        { link, name, openMode, tabMatch, closeCurrent: false },
      ]),
    ),
  );
}

function write(path: string, png: Buffer, rules: { width: number; height: number; alpha: boolean }): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, png);
  const { width, height, hasAlpha } = inspect(readFileSync(path));
  const problems = [
    width === rules.width && height === rules.height ? '' : `is ${width}×${height}, not ${rules.width}×${rules.height}`,
    hasAlpha === rules.alpha ? '' : rules.alpha ? 'has no alpha channel' : 'has an alpha channel',
  ].filter((problem) => problem !== '');
  if (problems.length > 0) throw new Error(`${path} ${problems.join(' and ')}`);
}

test('draws the icons, the promo tile and the five screenshots', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  const stylesheets = builtStylesheets();
  await routeDemoSites(context);

  await seedKeymap(worker);

  // Icons, from the logo mark.
  for (const { size, padding } of ICON_SIZES) {
    const page = await drawingPage(context, extensionId, iconPage(stylesheets, size, padding), {
      width: size,
      height: size,
    });
    write(join(ICONS, `${size}.png`), await page.screenshot({ omitBackground: true }), {
      width: size,
      height: size,
      alpha: true,
    });
    await page.close();
  }

  // Promo tile.
  const tile = await drawingPage(
    context,
    extensionId,
    promoTilePage(stylesheets, 'Your sites, one key away.', 'G'),
    TILE,
  );
  write(join(STORE, 'promo-tile.png'), flatten(await tile.screenshot({ animations: 'disabled' })), {
    ...TILE,
    alpha: false,
  });
  await tile.close();

  // Some demo sites stay open in background tabs: their keys show Open now.
  for (const { link } of DEMO_KEYMAP.filter(({ open }) => open)) {
    const page = await context.newPage();
    await page.goto(link);
  }

  const backdrop = await context.newPage();
  await backdrop.goto(BACKDROP_URL);
  const [tab] = await worker.evaluate((url) => chrome.tabs.query({ url }), BACKDROP_URL);
  if (tab === undefined) throw new Error('no backdrop tab');
  const shoot = async (page: Page, name: string) =>
    write(join(STORE, name), flatten(await page.screenshot({ animations: 'disabled' })), {
      ...SCREENSHOT,
      alpha: false,
    });
  const dialog = backdrop.getByRole('dialog', { name: 'Your keys' });

  // 1. Options keymap, a key selected and its inspector open.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html#key=G`);
  await expect(options.getByRole('heading', { level: 1, name: 'Keymap' })).toBeVisible();
  await expect(options.getByRole('button', { name: /^Alt G:/ })).toHaveAttribute('aria-pressed', 'true');
  await shoot(options, '01-options-keymap.png');
  await options.close();

  // 2. Popup assign: the popup for the backdrop's tab, dropped over the page it assigns.
  await backdrop.bringToFront();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 800 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tab.id}`);
  await expect(popup.getByTestId('primary')).toBeVisible();
  const popupCard = await popup.locator('main').screenshot({ animations: 'disabled' });
  const composite = await drawingPage(
    context,
    extensionId,
    popupCompositePage(
      (await backdrop.screenshot({ animations: 'disabled' })).toString('base64'),
      popupCard.toString('base64'),
    ),
    SCREENSHOT,
  );
  await shoot(composite, '02-popup-assign.png');
  await composite.close();

  // 3. Peek: ⌥ held on the page, captured while it is still down.
  await backdrop.bringToFront();
  await backdrop.keyboard.down('Alt');
  await expect(dialog.getByText(/^(⌥|Alt) held$/)).toBeVisible();
  await shoot(backdrop, '03-peek.png');
  await backdrop.keyboard.up('Alt');
  await expect(dialog).toHaveCount(0);

  // 5. Pinned overlay with a search typed, opened through the command.
  await worker.evaluate((t) => speedlinkE2E.toggleOverlay(t), tab);
  await expect(dialog.getByText('Pinned')).toBeVisible();
  await backdrop.keyboard.type('ma');
  await expect(dialog.getByTestId('overlay-tile').first()).toBeVisible();
  await shoot(backdrop, '05-pinned-overlay-search.png');
  // The first Esc clears the search, the second closes the overlay.
  await backdrop.keyboard.press('Escape');
  await backdrop.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // 4. Saved toast: assign the backdrop through the popup, and capture it with Undo showing. Last, because it
  // changes the keymap.
  await popup.keyboard.press('KeyE');
  const closed = popup.waitForEvent('close');
  await popup.keyboard.press('Enter');
  await closed;
  await expect(backdrop.getByTestId('page-toast')).toContainText('saved');
  await expect(backdrop.getByTestId('page-toast').getByRole('button', { name: 'Undo' })).toBeVisible();
  await shoot(backdrop, '04-saved-toast.png');

  // The landing page: refresh each image it holds a copy of.
  const store = new Set(readdirSync(STORE));
  for (const name of readdirSync(SITE_MEDIA).filter((name) => store.has(name))) {
    copyFileSync(join(STORE, name), join(SITE_MEDIA, name));
  }
});

test('records the demo loop and draws the social card', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  const stylesheets = builtStylesheets();
  await routeDemoSites(context);
  await seedKeymap(worker);

  const site = (key: string) => {
    const shortcut = DEMO_KEYMAP.find((shortcut) => shortcut.key === key);
    if (shortcut === undefined) throw new Error(`no demo shortcut on ${key}`);
    return shortcut;
  };
  const names = new Map(DEMO_KEYMAP.map(({ link, name }) => [new URL(link).hostname, name]));
  /** The window's web tabs as the service worker sees them, in strip order, named as the demo keymap names them. */
  const strip = async (): Promise<DemoTab[]> => {
    const tabs = (await worker.evaluate(() => chrome.tabs.query({}))).filter(({ url }) => url?.startsWith('https:'));
    const window = tabs.find(({ active }) => active)?.windowId;
    return tabs
      .filter(({ windowId }) => windowId === window)
      .sort((a, b) => a.index - b.index)
      .map(({ url = '', title = '', active }) => ({
        title: names.get(new URL(url).hostname) ?? title,
        link: url,
        active,
      }));
  };
  const activeLink = async () => (await strip()).find(({ active }) => active)?.link;

  // GitHub and Notion wait in background tabs; the article is in front.
  const pages = new Map<string, Page>();
  for (const key of ['G', 'N']) {
    const page = await context.newPage();
    await page.goto(site(key).link);
    pages.set(key, page);
  }
  const backdrop = await context.newPage();
  await backdrop.setViewportSize(DEMO_PAGE);
  await backdrop.goto(BACKDROP_URL);
  await backdrop.bringToFront();
  await expect.poll(activeLink).toBe(BACKDROP_URL);

  /** Each still, framed (`png`) and as the bare page (`pagePng`). */
  const frames: { name: string; png: Buffer; pagePng: string; seconds: number }[] = [];
  const frame = async (name: string, page: Page, keys: KeyLabel[], seconds: number) => {
    await page.setViewportSize(DEMO_PAGE);
    const pagePng = (await page.screenshot({ animations: 'disabled' })).toString('base64');
    const drawn = await drawingPage(
      context,
      extensionId,
      demoFramePage(stylesheets, { tabs: await strip(), pagePng, keys }),
      SCREENSHOT,
    );
    frames.push({ name, png: flatten(await drawn.screenshot({ animations: 'disabled' })), pagePng, seconds });
    await drawn.close();
  };

  // 1. The article.
  await frame('backdrop', backdrop, [], 1.5);

  // 2. Alt held: Peek, with Open now on G and N.
  await backdrop.keyboard.down('Alt');
  const dialog = backdrop.getByRole('dialog', { name: 'Your keys' });
  await expect(dialog.getByText(/^Alt held$/)).toBeVisible();
  await expect(dialog.getByText(/^Open · tab/)).toHaveCount(2);
  await frame('peek', backdrop, [ALT], 2);

  // 3. G: the GitHub tab that was already open comes to the front, and no tab is added.
  const before = (await strip()).length;
  await backdrop.keyboard.press('KeyG');
  await backdrop.keyboard.up('Alt');
  await expect.poll(activeLink).toBe(site('G').link);
  expect((await strip()).length).toBe(before);
  const github = pages.get('G');
  if (github === undefined) throw new Error('no GitHub page');
  await frame('switch', github, [ALT, 'G'], 1.5);

  // 4. Alt + M from there: Gmail wasn't open, so it opens in a new tab.
  const opened = context.waitForEvent('page');
  await github.keyboard.press('Alt+KeyM');
  const gmail = await opened;
  // The extension's own tab loads before the routes reach it, so it fails to resolve; load it again, routed.
  await gmail.goto(site('M').link);
  await expect.poll(activeLink).toBe(site('M').link);
  expect((await strip()).length).toBe(before + 1);
  await frame('open', gmail, [ALT, 'M'], 1.5);

  // 5. Keys up, a pause, then the loop fades back to the article.
  await frame('rest', gmail, [], 1.3);

  const work = mkdtempSync(join(tmpdir(), 'speedlink-frames-'));
  const shots = frames.map(({ name, png, seconds }) => {
    const path = join(work, `${name}.png`);
    writeFileSync(path, png);
    return { png: path, seconds };
  });
  mkdirSync(join(README_GIF, '..'), { recursive: true });
  encodeDemo(shots, SCREENSHOT, {
    mp4: join(SITE_MEDIA, 'demo.mp4'),
    webm: join(SITE_MEDIA, 'demo.webm'),
    gif: README_GIF,
  });
  rmSync(work, { recursive: true, force: true });

  // The poster: the Peek still, the frame the loop is about.
  const peek = frames.find(({ name }) => name === 'peek');
  if (peek === undefined) throw new Error('no Peek frame');
  write(join(SITE_MEDIA, 'demo-poster.png'), peek.png, { ...SCREENSHOT, alpha: false });

  // The social card, with the page under Peek.
  const card = await drawingPage(
    context,
    extensionId,
    socialCardPage(
      stylesheets,
      'Put your sites on keys.',
      'Hold Alt and press a key to open a site, or jump to the tab where it’s already open.',
      peek.pagePng,
    ),
    CARD,
  );
  write(join(SITE_MEDIA, 'social-card.png'), flatten(await card.screenshot({ animations: 'disabled' })), {
    ...CARD,
    alpha: false,
  });
  await card.close();
});
