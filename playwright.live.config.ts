import { defineConfig } from '@playwright/test';

// `pnpm smoke:live`: release checklist #9 on live sites. Not part of `pnpm e2e` or CI (see live/live-sites.spec.ts).
export default defineConfig({
  testDir: './live',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
