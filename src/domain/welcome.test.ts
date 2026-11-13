import { describe, expect, it } from 'vitest';
import { shouldOpenWelcome } from './welcome';

describe('shouldOpenWelcome', () => {
  it('opens on a fresh install', () => {
    expect(shouldOpenWelcome({ reason: 'install' })).toBe(true);
  });

  it.each(['1.0', '1.6', '1.6.3'])('opens on an update from v1 (%s)', (previousVersion) => {
    expect(shouldOpenWelcome({ reason: 'update', previousVersion })).toBe(true);
  });

  it.each(['4.0.0', '4.1.2'])('opens nothing on an update within 4.x (%s)', (previousVersion) => {
    expect(shouldOpenWelcome({ reason: 'update', previousVersion })).toBe(false);
  });

  it('opens nothing on an update with no previous version', () => {
    expect(shouldOpenWelcome({ reason: 'update' })).toBe(false);
  });

  it.each(['11.0', '4.1.0', '21.5'])(
    'opens nothing when "1." only appears later in the version (%s)',
    (previousVersion) => {
      expect(shouldOpenWelcome({ reason: 'update', previousVersion })).toBe(false);
    },
  );

  it.each(['chrome_update', 'shared_module_update'])('opens nothing on %s', (reason) => {
    expect(shouldOpenWelcome({ reason, previousVersion: '1.6' })).toBe(false);
  });
});
