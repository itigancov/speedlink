import { defineConfig } from '@playwright/test';

export const FIXTURE_PORT = 4321;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${FIXTURE_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node e2e/fixture-server.ts ${FIXTURE_PORT}`,
    url: `http://127.0.0.1:${FIXTURE_PORT}/frames.html`,
    reuseExistingServer: !process.env.CI,
  },
});
