// Guards the built manifest against drift from product spec §13. A change here is a deliberate manifest change:
// a new permission that adds an install warning over v1 is a release blocker.
import { readFileSync } from 'node:fs';
import { EXTENSION_PATH, expect, test } from './extension';

const manifest = JSON.parse(readFileSync(`${EXTENSION_PATH}/manifest.json`, 'utf8'));

test('has exactly the spec §13 top-level keys (no `key`, nothing extra)', () => {
  expect(Object.keys(manifest).sort()).toEqual(
    [
      'action',
      'background',
      'commands',
      'content_scripts',
      'default_locale',
      'description',
      'host_permissions',
      'icons',
      'manifest_version',
      'minimum_chrome_version',
      'name',
      'options_ui',
      'permissions',
      'version',
    ].sort(),
  );
  expect(manifest).not.toHaveProperty('key');
});

test('versions', () => {
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.version).toBe('4.0.0');
  expect(manifest.minimum_chrome_version).toBe('121');
});

test('permissions are exactly storage, tabs, scripting on <all_urls>', () => {
  expect(manifest.permissions).toEqual(['storage', 'tabs', 'scripting']);
  expect(manifest.host_permissions).toEqual(['<all_urls>']);
});

test('the HUD content script runs on all URLs, in all frames, at document_start', () => {
  expect(manifest.content_scripts).toEqual([
    { matches: ['<all_urls>'], all_frames: true, run_at: 'document_start', js: ['content-scripts/hud.js'] },
  ]);
});

test('commands: toggle-overlay on Alt+S, _execute_action with no suggested key', () => {
  expect(manifest.commands).toEqual({
    'toggle-overlay': { description: '__MSG_commandToggleOverlay__', suggested_key: { default: 'Alt+S' } },
    _execute_action: {},
  });
});

test('name and description come from i18n', () => {
  expect(manifest.name).toBe('__MSG_extName__');
  expect(manifest.description).toBe('__MSG_extDescription__');
  expect(manifest.default_locale).toBe('en');
});

test('icons are the v1 16/32/48/128 set', () => {
  expect(manifest.icons).toEqual({ 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' });
});

test('the action popup is titled from i18n', () => {
  expect(manifest.action).toEqual({ default_title: '__MSG_extName__', default_popup: 'popup.html' });
});

test('options open in a tab', () => {
  expect(manifest.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
});
