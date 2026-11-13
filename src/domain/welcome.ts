// When the welcome page opens (product spec §9). Plain data in, a yes or no out.

export interface InstallEvent {
  /** `runtime.onInstalled`'s reason: 'install', 'update', 'chrome_update' or 'shared_module_update'. */
  reason: string;
  /** The version before an update. */
  previousVersion?: string;
}

/** A fresh install, or the update from any 1.x version. Updates within 4.x, and Chrome's own updates, open nothing. */
export function shouldOpenWelcome({ reason, previousVersion }: InstallEvent): boolean {
  if (reason === 'install') return true;
  return reason === 'update' && previousVersion?.startsWith('1.') === true;
}
