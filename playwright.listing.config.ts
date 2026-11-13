import { defineConfig } from '@playwright/test';

// `pnpm listing`: the Store listing's images. Not part of `pnpm e2e` or CI (see listing/listing.spec.ts).
export default defineConfig({
  testDir: './listing',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
});
