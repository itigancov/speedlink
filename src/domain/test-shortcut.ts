// Test helper: builds a Shortcut through validateShortcut, so tests respect the brand and never forge one.
import { DEFAULT_OPEN_MODE, DEFAULT_TAB_MATCH, type Shortcut, type ShortcutDraft, validateShortcut } from './shortcut';

export function validShortcut(draft: Partial<ShortcutDraft> & { link: string }): Shortcut {
  const result = validateShortcut({
    openMode: DEFAULT_OPEN_MODE,
    tabMatch: DEFAULT_TAB_MATCH,
    closeCurrent: false,
    ...draft,
  });
  if (!result.ok) throw new Error(`test shortcut is invalid: ${result.error}`);
  return result.value;
}
