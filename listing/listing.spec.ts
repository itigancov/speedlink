// `pnpm listing`: draws every image the Web Store listing needs from the real build (the e2e-hooks variant, which has
// the popup's `?tabId=N` entry), into `store/` and `public/icon/`: the five captioned shots (Hero, Smart switch, Peek,
// Assign, Keymap), the promo tile and the marquee. Hero and Smart switch are templates drawn from the product's
// components; Peek, Assign and Keymap are captions over clean frames, real captures in a browser mock, which the
// landing page reuses from `site/media/` along with the social card. The demo keymap goes straight into storage.sync,
// every demo site is a routed stub, and the browser says it is Chrome on Windows, so the captures read "Alt" (the
// templates' own text says "⌥ / Alt"). A second scenario records the demo loop for the README's GIF. Not part of
// `pnpm e2e` or CI: the author reviews the images in the PR before they are uploaded.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import type { KeyLabel } from '@/domain/keys';
import { expect, HOOKS_EXTENSION_PATH, serviceWorker, test } from '../e2e/extension';
import { BACKDROP_TITLE, BACKDROP_URL, DEMO_KEYMAP, demoTiles, smartSwitchStrips } from './demo';
import { installI18n } from './i18n';
import { flatten, inspect } from './png';
import {
  browserFramePage,
  CARD,
  type Caption,
  captionedShotPage,
  heroPage,
  iconPage,
  MARQUEE,
  MOCK_PAGE,
  type MockFrame,
  type MockTab,
  marqueePage,
  promoTilePage,
  smartSwitchPage,
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
/** The landing page's media: the clean frames and the social card. */
const SITE_MEDIA = join(ROOT, 'site/media');
/** The README's copy of the demo loop. */
const README_GIF = join(ROOT, 'docs/media/demo.gif');

const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SCREENSHOT = { width: 1280, height: 800 };
const TILE = { width: 440, height: 280 };
/** What `store/` holds after a run: the listing texts and the seven images, nothing older. */
const STORE_FILES = [
  '01-hero.png',
  '02-smart-switch.png',
  '03-peek.png',
  '04-assign.png',
  '05-keymap.png',
  'listing.md',
  'marquee.png',
  'promo-tile.png',
];
/** The 4.0 shots the 4.2 set replaces. */
const DROPPED = ['01-options-keymap.png', '02-popup-assign.png', '04-saved-toast.png', '05-pinned-overlay-search.png'];
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

const names = new Map(DEMO_KEYMAP.map(({ link, name }) => [new URL(link).hostname, name]));

/** The window's web tabs as the service worker sees them, in strip order, named as the demo keymap names them. */
async function strip(worker: Worker): Promise<MockTab[]> {
  const tabs = (await worker.evaluate(() => chrome.tabs.query({}))).filter(({ url }) => url?.startsWith('https:'));
  const window = tabs.find(({ active }) => active)?.windowId ?? tabs[0]?.windowId;
  return tabs
    .filter(({ windowId }) => windowId === window)
    .sort((a, b) => a.index - b.index)
    .map(({ url = '', title = '', active }) => ({
      title: names.get(new URL(url).hostname) ?? title,
      link: url,
      active,
    }));
}

/** Draws `html` at `size` and writes it flattened, checked against the Store's rules. */
async function draw(
  context: BrowserContext,
  extensionId: string,
  html: string,
  size: { width: number; height: number },
  path: string,
): Promise<Buffer> {
  const page = await drawingPage(context, extensionId, html, size);
  const png = flatten(await page.screenshot({ animations: 'disabled' }));
  write(path, png, { ...size, alpha: false });
  await page.close();
  return png;
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

test('draws the icons, the promo tile, the marquee, the five shots, the clean frames and the social card', async ({
  context,
  extensionId,
}) => {
  await installI18n();
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

  const drawn = (html: string, size: { width: number; height: number }, path: string) =>
    draw(context, extensionId, html, size, path);
  const pitchTiles = demoTiles(['G', 'Y', 'N', 'F', 'C', 'D']);

  // The promo tile, the marquee and the social card in its style.
  await drawn(promoTilePage(stylesheets), TILE, join(STORE, 'promo-tile.png'));
  await drawn(marqueePage(stylesheets, pitchTiles), MARQUEE, join(STORE, 'marquee.png'));
  await drawn(socialCardPage(stylesheets, pitchTiles), CARD, join(SITE_MEDIA, 'social-card.png'));

  // Shot1, Hero.
  await drawn(heroPage(stylesheets, demoTiles(['Y', 'G', 'C', 'F', 'N', 'D'])), SCREENSHOT, join(STORE, '01-hero.png'));

  // Shot2, Smart switch: GitHub comes to the front, and the strip keeps its tabs.
  const strips = smartSwitchStrips();
  expect(strips.before.find(({ active }) => active)?.title).toBe(BACKDROP_TITLE);
  expect(strips.after.find(({ active }) => active)?.title).toBe('GitHub');
  expect(strips.after.map(({ title }) => title)).toEqual(strips.before.map(({ title }) => title));
  await drawn(smartSwitchPage(stylesheets, strips), SCREENSHOT, join(STORE, '02-smart-switch.png'));

  // Some demo sites stay open in background tabs: their Smart keys show Open now.
  for (const { link } of DEMO_KEYMAP.filter(({ open }) => open)) {
    const page = await context.newPage();
    await page.goto(link);
  }
  const backdrop = await context.newPage();
  await backdrop.setViewportSize(MOCK_PAGE);
  await backdrop.goto(BACKDROP_URL);
  await backdrop.bringToFront();
  const [tab] = await worker.evaluate((url) => chrome.tabs.query({ url }), BACKDROP_URL);
  if (tab === undefined) throw new Error('no backdrop tab');
  await expect.poll(async () => (await strip(worker)).find(({ active }) => active)?.link).toBe(BACKDROP_URL);
  const tabs = await strip(worker);
  const capture = async (page: Page) => (await page.screenshot({ animations: 'disabled' })).toString('base64');
  /** A clean frame: a capture in the browser mock, into the landing page's media. */
  const cleanFrame = (name: string, frame: MockFrame) =>
    drawn(browserFramePage(stylesheets, frame), SCREENSHOT, join(SITE_MEDIA, `frame-${name}.png`));

  // The Peek frame: Alt held on the article, captured while it is still down, Open now on the Smart keys left open.
  await backdrop.keyboard.down('Alt');
  const dialog = backdrop.getByRole('dialog', { name: 'Your keys' });
  await expect(dialog.getByText(/^Alt held$/)).toBeVisible();
  const openTiles = dialog.getByTestId('overlay-tile').filter({ hasText: /Open · tab/ });
  await expect(openTiles).toHaveCount(3);
  for (const name of ['GitHub', 'Notion', 'Figma']) await expect(openTiles.filter({ hasText: name })).toHaveCount(1);
  const peek = await cleanFrame('peek', { tabs, pagePng: await capture(backdrop) });
  await backdrop.keyboard.up('Alt');
  await expect(dialog).toHaveCount(0);

  // The Popup frame: the popup for the article's tab (not on a key, so the picker suggests keys), under the
  // toolbar icon. Shot4's caption names the first key it suggests.
  const page = await capture(backdrop);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 800 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tab.id}`);
  await expect(popup.getByTestId('primary')).toBeVisible();
  const chips = popup.getByRole('group', { name: 'Free & fitting' }).getByRole('button');
  await expect(chips.first()).toBeVisible();
  const suggested = ((await chips.first().textContent()) ?? '').trim() as KeyLabel;
  expect(suggested).toMatch(/^[A-Z0-9]$/);
  const popupCard = (await popup.locator('main').screenshot({ animations: 'disabled' })).toString('base64');
  await popup.close();
  const assign = await cleanFrame('popup', { tabs, pagePng: page, popupPng: popupCard });

  // The Keymap frame: Options on Y with its key editor open, in the mock as the active tab.
  const options = await context.newPage();
  await options.setViewportSize(MOCK_PAGE);
  await options.goto(`chrome-extension://${extensionId}/options.html#key=Y`);
  const editor = options.getByRole('dialog', { name: 'Edit key' });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('heading', { level: 2 })).toHaveText('YouTube');
  await expect(editor.locator('[data-slot=editor-chip]')).toHaveText('Alt+Y');
  await options.evaluate(() => document.fonts.ready);
  const keymap = await cleanFrame('keymap', {
    tabs: [
      ...tabs.map((tab) => ({ ...tab, active: false })),
      { title: 'SpeedLink Options', link: 'about:blank', active: true, extension: true },
    ],
    address: 'SpeedLink · Options',
    pagePng: await capture(options),
  });
  await options.close();

  // Shot3–5: the captions over the clean frames.
  const shots: [string, Caption, Buffer][] = [
    [
      '03-peek.png',
      {
        headline: 'Forgot a key? Hold ⌥ (Alt) to peek.',
        sub: 'Your keys appear over any page. Sites open right now show in green.',
      },
      peek,
    ],
    [
      '04-assign.png',
      {
        headline: 'Put any page on a key in one click.',
        sub: 'Click the toolbar icon and press a key. SpeedLink suggests free keys that fit the site.',
        thenKey: suggested,
      },
      assign,
    ],
    [
      '05-keymap.png',
      {
        headline: 'Your keymap is a keyboard.',
        sub: 'Click a key to edit it right there. Choose how each link opens.',
      },
      keymap,
    ],
  ];
  for (const [name, caption, frame] of shots) {
    await drawn(captionedShotPage(stylesheets, caption, frame.toString('base64')), SCREENSHOT, join(STORE, name));
  }

  // `store/` holds the 4.2 set and nothing older.
  for (const name of DROPPED) rmSync(join(STORE, name), { force: true });
  expect(readdirSync(STORE).sort()).toEqual(STORE_FILES);
});

test('records the demo loop for the README', async ({ context, extensionId }) => {
  const worker = await serviceWorker(context);
  const stylesheets = builtStylesheets();
  await routeDemoSites(context);
  await seedKeymap(worker);

  const site = (key: string) => {
    const shortcut = DEMO_KEYMAP.find((shortcut) => shortcut.key === key);
    if (shortcut === undefined) throw new Error(`no demo shortcut on ${key}`);
    return shortcut;
  };
  const activeLink = async () => (await strip(worker)).find(({ active }) => active)?.link;

  // GitHub and Notion wait in background tabs; the article is in front.
  const pages = new Map<string, Page>();
  for (const key of ['G', 'N']) {
    const page = await context.newPage();
    await page.goto(site(key).link);
    pages.set(key, page);
  }
  const backdrop = await context.newPage();
  await backdrop.setViewportSize(MOCK_PAGE);
  await backdrop.goto(BACKDROP_URL);
  await backdrop.bringToFront();
  await expect.poll(activeLink).toBe(BACKDROP_URL);

  /** Each still, in the browser mock. */
  const frames: { name: string; png: Buffer; seconds: number }[] = [];
  const frame = async (name: string, page: Page, keys: KeyLabel[], seconds: number) => {
    await page.setViewportSize(MOCK_PAGE);
    const pagePng = (await page.screenshot({ animations: 'disabled' })).toString('base64');
    const drawn = await drawingPage(
      context,
      extensionId,
      browserFramePage(stylesheets, { tabs: await strip(worker), pagePng, keys }),
      SCREENSHOT,
    );
    frames.push({ name, png: flatten(await drawn.screenshot({ animations: 'disabled' })), seconds });
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
  const before = (await strip(worker)).length;
  await backdrop.keyboard.press('KeyG');
  await backdrop.keyboard.up('Alt');
  await expect.poll(activeLink).toBe(site('G').link);
  expect((await strip(worker)).length).toBe(before);
  const github = pages.get('G');
  if (github === undefined) throw new Error('no GitHub page');
  await frame('switch', github, [ALT, 'G' as KeyLabel], 1.5);

  // 4. Alt + M from there: Gmail wasn't open, so it opens in a new tab.
  const opened = context.waitForEvent('page');
  await github.keyboard.press('Alt+KeyM');
  const gmail = await opened;
  // The extension's own tab loads before the routes reach it, so it fails to resolve; load it again, routed.
  await gmail.goto(site('M').link);
  await expect.poll(activeLink).toBe(site('M').link);
  expect((await strip(worker)).length).toBe(before + 1);
  await frame('open', gmail, [ALT, 'M' as KeyLabel], 1.5);

  // 5. Keys up, a pause, then the loop fades back to the article.
  await frame('rest', gmail, [], 1.3);

  const work = mkdtempSync(join(tmpdir(), 'speedlink-frames-'));
  const shots = frames.map(({ name, png, seconds }) => {
    const path = join(work, `${name}.png`);
    writeFileSync(path, png);
    return { png: path, seconds };
  });
  mkdirSync(join(README_GIF, '..'), { recursive: true });
  encodeDemo(shots, SCREENSHOT, README_GIF);
  rmSync(work, { recursive: true, force: true });
});
