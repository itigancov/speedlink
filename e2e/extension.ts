import { resolve } from 'node:path';
import { type BrowserContext, test as base, chromium, type Page, type Worker } from '@playwright/test';

type ContextOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;

export const EXTENSION_PATH = resolve(import.meta.dirname, '../.output/chrome-mv3');
export const THROW_EXTENSION_PATH = resolve(import.meta.dirname, '../.output-e2e-throw/chrome-mv3');
/** The extension with test hooks on the service worker (`SPEEDLINK_E2E_HOOKS=1`). */
export const HOOKS_EXTENSION_PATH = resolve(import.meta.dirname, '../.output-e2e-hooks/chrome-mv3');

export interface CapturedException {
  url: string | undefined;
  description: string | undefined;
}

interface Fixtures {
  extensionPath: string;
  /** Leaves the welcome tab that opens on install alone. Only `welcome.spec.ts` wants it. */
  keepWelcomeTab: boolean;
  /** Extra Chromium switches, e.g. the listing script's Windows user agent. */
  launchArgs: string[];
  /** Extra options for the browser context, e.g. the listing script's viewport. */
  extraContextOptions: ContextOptions;
  context: BrowserContext;
  extensionId: string;
  /** Opens a page with CDP `Runtime.exceptionThrown` capture attached before any script runs. */
  openWithExceptionCapture: (url: string) => Promise<{ page: Page; exceptions: CapturedException[] }>;
  /**
   * Updates the extension in place, as the Store would: Chrome reloads it from the same folder under the same ID,
   * fires `onInstalled` with `reason: 'update'` and orphans the old content scripts. Resolves with the new
   * service worker. (`chrome.runtime.reload()` would unload a command-line-loaded extension for good.)
   */
  updateExtension: () => Promise<Worker>;
}

/** The extension's service worker; it is the only extension loaded. */
export async function serviceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

/** The extension's welcome tab, if it is open. */
export const welcomeTabs = (context: BrowserContext): Page[] =>
  context.pages().filter((page) => page.url().endsWith('/welcome.html'));

/**
 * Waits for the welcome tab that opens on install and closes it, so tab counts in a spec start as they would
 * without it. The production behaviour stays on: nothing is switched off by a build flag.
 */
export async function closeWelcomeTab(context: BrowserContext): Promise<void> {
  await base.expect.poll(() => welcomeTabs(context).length, { message: 'the welcome tab opens on install' }).toBe(1);
  await welcomeTabs(context)[0]?.close();
}

export const test = base.extend<Fixtures>({
  extensionPath: [EXTENSION_PATH, { option: true }],
  keepWelcomeTab: [false, { option: true }],
  launchArgs: [[], { option: true }],
  extraContextOptions: [{}, { option: true }],

  context: async ({ extensionPath, keepWelcomeTab, launchArgs, extraContextOptions }, use) => {
    const context = await chromium.launchPersistentContext('', {
      ...extraContextOptions,
      channel: 'chromium',
      headless: true,
      // The unsafe-debugging flag opens CDP's Extensions domain, so a spec can update the extension in place.
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--enable-unsafe-extension-debugging',
        ...launchArgs,
      ],
    });
    if (!keepWelcomeTab) await closeWelcomeTab(context);
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const id = new URL((await serviceWorker(context)).url()).host;
    await use(id);
  },

  openWithExceptionCapture: async ({ context }, use) => {
    await use(async (url) => {
      const page = await context.newPage();
      const exceptions: CapturedException[] = [];
      const cdp = await context.newCDPSession(page);
      cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
        exceptions.push({ url: exceptionDetails.url, description: exceptionDetails.exception?.description });
      });
      await cdp.send('Runtime.enable');
      await page.goto(url, { waitUntil: 'load' });
      return { page, exceptions };
    });
  },

  updateExtension: async ({ context, extensionPath }, use) => {
    await use(async () => {
      const browser = context.browser();
      if (browser === null) throw new Error('no browser for CDP');
      const cdp = await browser.newBrowserCDPSession();
      const next = context.waitForEvent('serviceworker');
      await cdp.send('Extensions.loadUnpacked' as never, { path: extensionPath } as never);
      await cdp.detach();
      return next;
    });
  },
});

export const expect = test.expect;

/** Exceptions thrown by our extension's scripts (content scripts run in an isolated world, not the page console). */
export function fromExtension(exceptions: CapturedException[], extensionId: string): CapturedException[] {
  return exceptions.filter((e) => e.url?.startsWith(`chrome-extension://${extensionId}/`));
}
