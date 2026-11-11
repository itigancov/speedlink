// Throwaway: proves WxtVitest + fakeBrowser are wired for platform/ tests. Replaced by item 04.
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('platform smoke', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('round-trips storage.local through fakeBrowser', async () => {
    await browser.storage.local.set({ smoke: { ok: true } });
    expect(await browser.storage.local.get('smoke')).toEqual({ smoke: { ok: true } });
  });

  it('starts each test with empty storage', async () => {
    expect(await browser.storage.local.get('smoke')).toEqual({});
  });
});
