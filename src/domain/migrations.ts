// Maps v1's `speedlink` sync item (CWS 1.6) to 4.0 shortcuts (product spec §10). Pure: the caller reads and writes.
import { type KeyUse, moveTarget } from './fitting-keys';
import { isAssignable, type Key, type KeyLabel } from './keys';
import type { LinkError } from './link';
import { type OpenMode, type Shortcut, validateShortcut } from './shortcut';

export type V1SkipReason = 'invalid-key' | LinkError | 'too-large' | 'duplicate' | 'key-taken' | 'no-free-key';

export interface V1SkippedRow {
  /** The row's position in v1's `shortcuts` array. */
  readonly index: number;
  /** The row's `shortcut` as v1 stored it, or null when it was not a string. */
  readonly v1Key: string | null;
  readonly reason: V1SkipReason;
}

/** What an import did, for the background log. Links may appear in it, so it stays local. */
export interface V1ImportReport {
  readonly imported: readonly Key[];
  readonly skipped: readonly V1SkippedRow[];
  /** Where the v1 shortcut on the reserved S went. */
  readonly moved?: { readonly from: 'S'; readonly to: Key };
  /** Set when `shortcuts` was not an array: nothing is imported, and the caller still marks it done. */
  readonly malformed?: 'shortcuts-not-array';
}

export type V1Import =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'import';
      readonly shortcuts: Partial<Record<Key, Shortcut>>;
      readonly report: V1ImportReport;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What 1.6 did after a key with Smart Tabs off. A missing or unknown Post Action behaved as "Jump to tab". */
const POST_ACTION_MODES: Readonly<Record<string, OpenMode>> = {
  'Open in background': 'bg',
  'Jump to tab': 'new',
  // 1.6 navigated the current tab: nothing was closed.
  'Close & Jump to tab': 'this',
};

/** One open mode for every row, from the global settings; missing fields take their effective 1.6 values. */
function openModeOf(settings: unknown): OpenMode {
  const { smartTabs, postAction } = isRecord(settings) ? settings : {};
  if (smartTabs === true) return 'smart';
  return (typeof postAction === 'string' ? POST_ACTION_MODES[postAction] : undefined) ?? 'new';
}

/** v1 stored one character, `A`–`Z` or `0`–`9`; anything else never matched a key in 1.6 either. */
function keyLabelOf(v1Key: string | null): KeyLabel | null {
  const trimmed = v1Key?.trim() ?? '';
  // Checked before upper-casing, so a character that upper-cases to ASCII (`ı` → `I`) is not taken for a key.
  return /^[A-Za-z0-9]$/.test(trimmed) ? (trimmed.toUpperCase() as KeyLabel) : null;
}

/** A row with a valid key and link, still to be placed. */
interface Candidate {
  readonly index: number;
  readonly v1Key: string;
  readonly label: KeyLabel;
  readonly shortcut: Shortcut;
}

/** Each row as a candidate, or a skip with its reason. */
function readRows(rows: readonly unknown[], openMode: OpenMode): { candidates: Candidate[]; skipped: V1SkippedRow[] } {
  const candidates: Candidate[] = [];
  const skipped: V1SkippedRow[] = [];
  rows.forEach((row, index) => {
    const fields = isRecord(row) ? row : {};
    const v1Key = typeof fields.shortcut === 'string' ? fields.shortcut : null;
    const label = keyLabelOf(v1Key);
    if (v1Key === null || label === null) {
      skipped.push({ index, v1Key, reason: 'invalid-key' });
      return;
    }
    const result = validateShortcut({
      link: typeof fields.url === 'string' ? fields.url : '',
      name: typeof fields.title === 'string' ? fields.title : undefined,
      openMode,
      tabMatch: 'site',
      closeCurrent: false,
    });
    if (!result.ok) {
      // validateShortcut fails here only on the link or the size: the open mode and tab match are fixed.
      skipped.push({ index, v1Key, reason: result.error as V1SkipReason });
      return;
    }
    candidates.push({ index, v1Key, label, shortcut: result.value });
  });
  return { candidates, skipped };
}

/**
 * Maps the raw `speedlink` value onto keys outside `taken` (every key with a stored item, readable or not).
 * Missing or non-object data is `none`: there is nothing to import and nothing to mark.
 */
export function planV1Import(raw: unknown, taken: ReadonlySet<Key>): V1Import {
  if (!isRecord(raw)) return { kind: 'none' };
  if (!Array.isArray(raw.shortcuts)) {
    return { kind: 'import', shortcuts: {}, report: { imported: [], skipped: [], malformed: 'shortcuts-not-array' } };
  }

  const { candidates, skipped } = readRows(raw.shortcuts, openModeOf(raw.settings));

  // The later row on a label wins; only rows with a valid key and link take part.
  const winners = new Map<KeyLabel, Candidate>();
  for (const candidate of candidates) {
    const earlier = winners.get(candidate.label);
    if (earlier !== undefined) skipped.push({ index: earlier.index, v1Key: earlier.v1Key, reason: 'duplicate' });
    winners.set(candidate.label, candidate);
  }

  const shortcuts: Partial<Record<Key, Shortcut>> = {};
  const imported: Key[] = [];
  const inUse = (): KeyUse => ({ ...Object.fromEntries([...taken].map((key) => [key, true])), ...shortcuts });
  const place = (key: Key, shortcut: Shortcut) => {
    shortcuts[key] = shortcut;
    imported.push(key);
  };

  // Rows on assignable keys go first and stay on their key; the S row then takes a key that is still free.
  for (const { index, v1Key, label, shortcut } of winners.values()) {
    if (!isAssignable(label)) continue;
    if (taken.has(label)) skipped.push({ index, v1Key, reason: 'key-taken' });
    else place(label, shortcut);
  }

  const reservedRow = winners.get('S');
  let moved: V1ImportReport['moved'];
  if (reservedRow !== undefined) {
    const target = moveTarget(inUse(), reservedRow.shortcut);
    if (target === null) {
      skipped.push({ index: reservedRow.index, v1Key: reservedRow.v1Key, reason: 'no-free-key' });
    } else {
      place(target, reservedRow.shortcut);
      moved = { from: 'S', to: target };
    }
  }

  skipped.sort((a, b) => a.index - b.index);
  return { kind: 'import', shortcuts, report: { imported, skipped, ...(moved === undefined ? {} : { moved }) } };
}
