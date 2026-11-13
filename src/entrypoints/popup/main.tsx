import '@/assets/theme.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sendMessage } from '@/platform/messaging';
import { type PopupActions, PopupPage } from './PopupPage';

document.title = i18n.t('extName');

const actions: PopupActions = {
  assignPage: (request) => sendMessage('assignPage', request),
  openOptions: () => sendMessage('openOptions', undefined),
  close: () => window.close(),
};

/** e2e only: `popup.html?tabId=N` names the tab, since Playwright can't open the toolbar popup. Compiled away elsewhere. */
function namedTab(): number | undefined {
  if (!__SPEEDLINK_E2E_HOOKS__) return undefined;
  const tabId = Number(new URLSearchParams(window.location.search).get('tabId'));
  return Number.isInteger(tabId) && tabId > 0 ? tabId : undefined;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PopupPage actions={actions} tabId={namedTab()} />
    </StrictMode>,
  );
}
