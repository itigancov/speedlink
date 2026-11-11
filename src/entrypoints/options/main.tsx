import '@/assets/theme.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <h1>{i18n.t('extName')}</h1>;
}

document.title = i18n.t('extName');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
