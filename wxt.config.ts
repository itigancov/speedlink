import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  manifest: {
    version: '4.0.0',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    minimum_chrome_version: '121',
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: { default_title: '__MSG_extName__' },
    commands: {
      'toggle-overlay': {
        description: '__MSG_commandToggleOverlay__',
        suggested_key: { default: 'Alt+S' },
      },
      _execute_action: {},
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
