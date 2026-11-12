import '@/assets/theme.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsPage } from './OptionsPage';

document.title = i18n.t('extName');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OptionsPage />
    </StrictMode>,
  );
}
