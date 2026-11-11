import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { EXTENSION_PATH, THROW_EXTENSION_PATH } from './extension';

export default function globalSetup() {
  if (!existsSync(`${EXTENSION_PATH}/manifest.json`)) {
    throw new Error(`No build at ${EXTENSION_PATH}. Run \`pnpm e2e\`, which builds first.`);
  }
  // Negative control: the same extension, built with the content-script throw switched on.
  execFileSync('pnpm', ['exec', 'wxt', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, SPEEDLINK_E2E_THROW: '1' },
  });
  if (!existsSync(`${THROW_EXTENSION_PATH}/manifest.json`)) {
    throw new Error(`Negative-control build missing at ${THROW_EXTENSION_PATH}.`);
  }
}
