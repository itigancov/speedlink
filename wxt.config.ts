import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Negative control for the e2e exception capture: when set, the HUD content script throws on load.
// Normal builds compile the throw away. See e2e/global-setup.ts.
const e2eThrow = process.env.SPEEDLINK_E2E_THROW === '1';
// Test hooks on the service worker for e2e (e2e/open-shortcut.spec.ts). Normal builds compile them away.
const e2eHooks = process.env.SPEEDLINK_E2E_HOOKS === '1';

export default defineConfig({
  srcDir: 'src',
  outDir: e2eThrow ? '.output-e2e-throw' : e2eHooks ? '.output-e2e-hooks' : '.output',
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  manifest: {
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
    // The HUD's font, declared on the host page (src/platform/hud-font.ts). Adds no install warning.
    web_accessible_resources: [
      { resources: ['fonts/inter-latin-wght.woff2'], matches: ['<all_urls>'], use_dynamic_url: true },
    ],
  },
  hooks: {
    // The gallery is for `pnpm dev` only: it never reaches `.output/`, the Store zip or e2e.
    'entrypoints:resolved': (wxt, entrypoints) => {
      if (wxt.config.command !== 'build') return;
      const gallery = entrypoints.findIndex((entrypoint) => entrypoint.name === 'gallery');
      if (gallery !== -1) entrypoints.splice(gallery, 1);
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __SPEEDLINK_E2E_THROW__: JSON.stringify(e2eThrow),
      __SPEEDLINK_E2E_HOOKS__: JSON.stringify(e2eHooks),
    },
  }),
});
