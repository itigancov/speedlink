import { useEffect, useState } from 'react';
import { isOverlayCommandBound } from '@/platform/commands';

/**
 * Whether `toggle-overlay` has a key; null until known. Chrome has no `commands.onChanged`, so it is read again
 * whenever the page comes back (the user may have just set one on the shortcut page).
 */
export function useOverlayCommandBound(): boolean | null {
  const [bound, setBound] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => {
      isOverlayCommandBound()
        .then((next) => {
          if (live) setBound(next);
        })
        .catch((error: unknown) => console.debug('SpeedLink: could not read the commands', error));
    };
    read();
    document.addEventListener('visibilitychange', read);
    window.addEventListener('focus', read);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', read);
      window.removeEventListener('focus', read);
    };
  }, []);
  return bound;
}
