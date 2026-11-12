import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { EXTENSION_PATH, HOOKS_EXTENSION_PATH, THROW_EXTENSION_PATH } from './extension';

export default function globalSetup() {
  if (!existsSync(`${EXTENSION_PATH}/manifest.json`)) {
    throw new Error(`No build at ${EXTENSION_PATH}. Run \`pnpm e2e\`, which builds first.`);
  }
  // Negative control: the same extension, built with the content-script throw switched on.
  buildVariant('SPEEDLINK_E2E_THROW', THROW_EXTENSION_PATH, 'Negative-control');
  // The same extension with test hooks on the service worker, so specs can drive the background directly.
  buildVariant('SPEEDLINK_E2E_HOOKS', HOOKS_EXTENSION_PATH, 'Test-hooks');
}

function buildVariant(flag: string, path: string, name: string) {
  execFileSync('pnpm', ['exec', 'wxt', 'build'], { stdio: 'inherit', env: { ...process.env, [flag]: '1' } });
  if (!existsSync(`${path}/manifest.json`)) throw new Error(`${name} build missing at ${path}.`);
}
