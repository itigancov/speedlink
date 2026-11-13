import '@/assets/theme.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WelcomePage } from './WelcomePage';

document.title = i18n.t('welcome.title');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WelcomePage />
    </StrictMode>,
  );
}
