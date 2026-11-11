import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Negative control for the e2e exception capture: when set, the HUD content script throws on load.
// Normal builds compile the throw away. See e2e/global-setup.ts.
const e2eThrow = process.env.SPEEDLINK_E2E_THROW === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: e2eThrow ? '.output-e2e-throw' : '.output',
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
  vite: () => ({
    plugins: [tailwindcss()],
    define: { __SPEEDLINK_E2E_THROW__: JSON.stringify(e2eThrow) },
  }),
});
