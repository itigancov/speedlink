import { type LinkError, normalizeLink, siteOf } from './link';
import type { Result } from './result';

export const OPEN_MODES = ['smart', 'new', 'this', 'bg'] as const;
export type OpenMode = (typeof OPEN_MODES)[number];

export const TAB_MATCHES = ['exact', 'page', 'site'] as const;
export type TabMatch = (typeof TAB_MATCHES)[number];

/** The stored fields of a shortcut (product spec §2.2). */
export interface ShortcutFields {
  link: string;
  name?: string;
  openMode: OpenMode;
  tabMatch: TabMatch;
  closeCurrent: boolean;
}

/** Fields a newer version stored, carried along unchanged. */
type UnknownFields = { readonly [field: string]: unknown };

/** What a surface hands to `validateShortcut`: a fresh shortcut, or a parsed one spread with edits. */
export type ShortcutDraft = ShortcutFields & UnknownFields;

/**
 * Only `validateShortcut` and `parseShortcut` produce this brand. Its `#` private field is dropped by object
 * spread, so a draft built as `{ ...shortcut, name }` is no longer a `Shortcut` and must be validated again.
 */
// biome-ignore lint/correctness/noUnusedPrivateClassMembers: a type-only brand, never read
declare class Validated {
  #validated: true;
}

export type Shortcut = Readonly<ShortcutFields> & UnknownFields & Validated;

export type ShortcutError = LinkError | 'invalid-open-mode' | 'invalid-tab-match' | 'too-large';

export const DEFAULT_OPEN_MODE: OpenMode = 'smart';
export const DEFAULT_TAB_MATCH: TabMatch = 'page';

/** `storage.sync` QUOTA_BYTES_PER_ITEM: the key's length plus the JSON of its value, in bytes. */
const SYNC_ITEM_CAP = 8192;
/** Every shortcut is stored under `key.<K>`, one label character long. */
const ITEM_KEY_BYTES = 'key.Y'.length;

const isOpenMode = (value: unknown): value is OpenMode => (OPEN_MODES as readonly unknown[]).includes(value);
const isTabMatch = (value: unknown): value is TabMatch => (TAB_MATCHES as readonly unknown[]).includes(value);

/** A trimmed, non-empty name, or undefined. */
function cleanName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim();
  return trimmed === '' ? undefined : trimmed;
}

function build(extra: object, fields: ShortcutFields): Shortcut {
  const { name, ...rest } = fields;
  return { ...extra, ...rest, ...(name === undefined ? {} : { name }) } as unknown as Shortcut;
}

/** Write strict: normalizes the link and name, and rejects anything that must not be stored. */
export function validateShortcut(draft: ShortcutDraft): Result<Shortcut, ShortcutError> {
  const { link, name, openMode, tabMatch, closeCurrent, ...extra } = draft;
  const normalized = normalizeLink(link);
  if (!normalized.ok) return normalized;
  if (!isOpenMode(openMode)) return { ok: false, error: 'invalid-open-mode' };
  if (!isTabMatch(tabMatch)) return { ok: false, error: 'invalid-tab-match' };

  const shortcut = build(extra, {
    link: normalized.value,
    name: cleanName(name),
    openMode,
    tabMatch,
    closeCurrent: closeCurrent === true,
  });
  const bytes = ITEM_KEY_BYTES + new TextEncoder().encode(JSON.stringify(shortcut)).length;
  if (bytes > SYNC_ITEM_CAP) return { ok: false, error: 'too-large' };
  return { ok: true, value: shortcut };
}

/**
 * Read tolerant: null only when the link is missing or unusable (the key then looks free, and the stored item
 * is left alone). Every other missing or invalid field takes its default; unknown fields are kept.
 */
export function parseShortcut(raw: unknown): Shortcut | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { link, name, openMode, tabMatch, closeCurrent, ...extra } = raw as Record<string, unknown>;
  if (typeof link !== 'string') return null;
  const normalized = normalizeLink(link);
  if (!normalized.ok) return null;

  return build(extra, {
    link: normalized.value,
    name: cleanName(name),
    openMode: isOpenMode(openMode) ? openMode : DEFAULT_OPEN_MODE,
    tabMatch: isTabMatch(tabMatch) ? tabMatch : DEFAULT_TAB_MATCH,
    closeCurrent: typeof closeCurrent === 'boolean' ? closeCurrent : false,
  });
}

/** The name, else the link's site. */
export function displayName(shortcut: Shortcut): string {
  return shortcut.name ?? siteOf(shortcut.link);
}

/** A letter or digit with any combining marks that follow it. */
const LETTER = /[\p{L}\p{N}]\p{M}*/u;

const firstLetter = (text: string): string | undefined => text.match(LETTER)?.[0];

/** The one-letter mark on the shortcut's tile: the first letter of the name, else of the site, uppercased. */
export function monogram(shortcut: Shortcut): string {
  const letter =
    (shortcut.name === undefined ? undefined : firstLetter(shortcut.name)) ?? firstLetter(siteOf(shortcut.link));
  return (letter ?? '').toUpperCase();
}

/** The tile colours, in the order the hash picks them. Changing the order reshuffles every user's colours. */
export const TILE_HUES = ['red', 'amber', 'blue', 'teal', 'slate', 'purple', 'indigo', 'green'] as const;
export type TileHue = (typeof TILE_HUES)[number];

/** FNV-1a, 32-bit, over the UTF-8 bytes. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}

/** The site to colour by, else the whole link: a link that doesn't parse or has no host (`file:`) hashes whole. */
function hueSource(link: string): string {
  try {
    return siteOf(link) || link;
  } catch {
    return link;
  }
}

/**
 * The tile colour of a link (product spec §2.2): derived from its site, never stored, so the same site gets the same
 * colour everywhere and a rename keeps it. The hash and the order of `TILE_HUES` are pinned by tests: changing
 * either reshuffles every user's colours and needs an ADR.
 */
export function tileHue(link: string): TileHue {
  return TILE_HUES[fnv1a(hueSource(link)) % TILE_HUES.length] as TileHue;
}
