import { resolve } from 'node:path';
import { type BrowserContext, test as base, chromium, type Page } from '@playwright/test';

export const EXTENSION_PATH = resolve(import.meta.dirname, '../.output/chrome-mv3');
export const THROW_EXTENSION_PATH = resolve(import.meta.dirname, '../.output-e2e-throw/chrome-mv3');

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
}

export const test = base.extend<Fixtures>({
  extensionPath: [EXTENSION_PATH, { option: true }],

  context: async ({ extensionPath }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
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
});

export const expect = test.expect;

/** Exceptions thrown by our extension's scripts (content scripts run in an isolated world, not the page console). */
export function fromExtension(exceptions: CapturedException[], extensionId: string): CapturedException[] {
  return exceptions.filter((e) => e.url?.startsWith(`chrome-extension://${extensionId}/`));
}
