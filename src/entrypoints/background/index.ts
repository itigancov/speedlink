import { runMigrations } from '@/platform/migrations';

export default defineBackground(() => {
  // Item 05's v1 import chains onto this, once the schema is known.
  const prepareStorage = () =>
    runMigrations().catch((error: unknown) => console.error('SpeedLink: storage migration failed', error));
  browser.runtime.onInstalled.addListener(() => void prepareStorage());
  browser.runtime.onStartup.addListener(() => void prepareStorage());
});
