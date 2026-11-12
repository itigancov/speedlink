import { registerInjectionOnInstall } from '@/platform/injection';
import { onMessage } from '@/platform/messaging';
import { createOpenKey } from '@/platform/open-key';
import { openOptions } from '@/platform/options-tab';
import { registerStoragePreparation } from '@/platform/storage-preparation';

export default defineBackground(() => {
  registerStoragePreparation();
  registerInjectionOnInstall();

  const openKey = createOpenKey();
  onMessage('openKey', ({ data, sender }) => openKey(data, sender.tab));
  onMessage('openOptions', ({ data, sender }) => openOptions(data?.key, sender.tab));

  // e2e only: drive the same openKey from Playwright with a real sender tab. Compiled away in every other build.
  if (__SPEEDLINK_E2E_HOOKS__) {
    Object.assign(globalThis, { speedlinkE2E: { openKey } });
  }
});
