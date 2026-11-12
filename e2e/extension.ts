import { resolve } from 'node:path';
import { type BrowserContext, test as base, chromium, type Page, type Worker } from '@playwright/test';

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

export const test = base.extend<Fixtures>({
  extensionPath: [EXTENSION_PATH, { option: true }],

  context: async ({ extensionPath }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      // The unsafe-debugging flag opens CDP's Extensions domain, so a spec can update the extension in place.
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--enable-unsafe-extension-debugging',
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
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
