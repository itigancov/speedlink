import { contentScriptTab, createAssignPage, createUndo } from '@/platform/assign-page';
import { registerCommands, toggleOverlay } from '@/platform/commands';
import { registerInjectionOnInstall } from '@/platform/injection';
import { onMessage } from '@/platform/messaging';
import { createOpenKey } from '@/platform/open-key';
import { openOptions } from '@/platform/options-tab';
import { readOverlayModel, relayFrameEvent } from '@/platform/overlay';
import { registerStoragePreparation } from '@/platform/storage-preparation';

export default defineBackground(() => {
  registerStoragePreparation();
  registerInjectionOnInstall();
  registerCommands();

  const openKey = createOpenKey();
  onMessage('openKey', ({ data, sender }) => openKey(data, sender.tab));
  onMessage('tryKey', ({ data, sender }) => openKey({ key: data.key, force: false, trial: true }, sender.tab));
  const assignPage = createAssignPage();
  const undo = createUndo();
  onMessage('assignPage', ({ data, sender }) => assignPage(data, contentScriptTab(sender)));
  onMessage('undo', ({ data }) => undo(data));
  onMessage('openOptions', ({ data, sender }) => openOptions(data?.key, sender.tab));
  onMessage('getOverlayModel', ({ sender }) => readOverlayModel(sender.tab));
  onMessage('frameEvent', ({ data, sender }) => relayFrameEvent(sender.tab, data));

  // e2e only: drive the same openKey and the toggle-overlay command from Playwright with a real tab (CDP can't fire
  // Chrome's command accelerators). Compiled away in every other build.
  if (__SPEEDLINK_E2E_HOOKS__) {
    Object.assign(globalThis, { speedlinkE2E: { openKey, toggleOverlay } });
  }
});
