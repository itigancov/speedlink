# SpeedLink 4.0: product spec

This is the product reference for the 4.0 rebuild. It consolidates every decision made on the rebuild map (`~/.scratch/speedlink/rebuild/map.md`) and states them as requirements. It is an **input**, not an implementation plan: each backlog item gets its own grilling, implementation plan and per-item spec (to-spec), and that per-item spec reads the sections of this file it needs. Since the repo skeleton (backlog item 01) this file lives in the repo as `docs/product-spec.md` and is canonical; `GLOSSARY.md` is at the repo root.

- Names follow [GLOSSARY.md](../GLOSSARY.md). Where this spec and the glossary disagree on a term, the glossary wins.
- The visual and behavioral source of truth is the design canvas (5 boards: Options · Keymap, Popup · Assign this page, Hold ⌥ · Cheat-sheet overlay, User flows, Behaviors & key states); it is catalogued in rebuild map: research/design-inventory.md. Where the canvas and this spec disagree, this spec wins: it records cuts and fixes made after the canvas (for example 35 keys, not 36).
- Each section names its source tickets as `↳ rebuild map: …`. They are plain-text paths under `~/.scratch/speedlink/rebuild/`, outside this repo.
- "⌥" below means ⌥ Option on macOS and Alt elsewhere (§4.7).

---

## 1. Scope

4.0 ships **exactly what the design shows**, minus the cuts below. It is an update to the existing Chrome Web Store item `kddkenmaadibebdpekhfibihfpealhbe` (v1.6 today), Chrome only, English only (all strings go through `chrome.i18n`), light theme only.

Cut from 4.0: Profiles, Defaults (a global default open mode), Import & export, Excluded sites, the Settings page, the usage-suggestion card, Top Sites starter keys in onboarding, dark mode and the theme setting, the Options left nav, cloud accounts and Firebase, the new-tab override, the side panel, devtools panels, and Firefox/Safari/Edge builds. Profiles and Import & export are 4.1 candidates.
↳ rebuild map: issues/05-domain-model.md (domain model), map.md Out of scope

---

## 2. Domain model

### 2.1 Keys
- **Trigger** is fixed: ⌥ + key. There is no Shift variant and no trigger setting.
- **Key** = physical key by `event.code`: `KeyA`–`KeyZ`, `Digit0`–`Digit9` (no numpad). It is named by its label (`Y`, `1`).
- **`S` is reserved**: it can never hold a shortcut (§5.3). That leaves **35 assignable keys**, and copy reads "N of 35 keys in use".
- **Keyboard order** (used for "first free key", lists, the overlay): `1 2 3 4 5 6 7 8 9 0`, `Q W E R T Y U I O P`, `A S D F G H J K L`, `Z X C V B N M`.
- **The key is the shortcut's identity.** There is no id, and a key holds at most one shortcut.

### 2.2 Shortcut
| Field | Type | Default | Notes |
|---|---|---|---|
| `link` | string | required | normalized http(s) URL (§2.3) |
| `name` | string? | none | without a name, the link's site is shown; Options fills it from a matching open tab's title (§8.3) |
| `openMode` | `smart` \| `new` \| `this` \| `bg` | `smart` | Smart switch / New tab / This tab / Background tab |
| `tabMatch` | `exact` \| `page` \| `site` | `page` | always stored, used only by `smart` |
| `closeCurrent` | boolean | `false` | ignored, and its checkbox disabled, when `openMode = this` |

No timestamps, `canEdit`, `groupId`, favicon or colour.

- **Monogram**: one letter, the first letter of the name, else of the site, uppercased. It is drawn white on a tile coloured by the site.
- **Tile colour**: derived, never stored. The link's site (§2.3: no leading `www.`, a non-default port kept, IDN hosts in punycode) is hashed with FNV-1a 32-bit over its UTF-8 bytes, mod 8, into red, amber, blue, teal, slate, purple, indigo, green, in that order. A link that doesn't parse or has no host (`file:`) is hashed whole. The same site gets the same colour on every surface, and a rename keeps it. The hash and the order are pinned by tests: changing either reshuffles every user's colours and needs an ADR.
- **Open now** is derived from the open tabs by the shortcut's tab match and never stored. It is computed only for Smart shortcuts.
↳ rebuild map: issues/05-domain-model.md (domain model), issues/06-behavior-audit.md (behavior audit)

### 2.3 Link rules
- Only `http:` and `https:` are allowed. Scheme-less input gets `https://`, except `localhost`, IP addresses and `*.local`, which get `http://`.
- The link is stored as `new URL(x).toString()`.
- Any other scheme, empty or unparseable input → one inline error message; nothing is written.
- The same link may sit on several keys.

### 2.4 Tab match (tab URL vs link)
- **exact**: the full URL incl. query and hash, ignoring a trailing `/` in the path.
- **page**: scheme + host + port + path, ignoring query, hash and a trailing `/`.
- **site**: hostname + port, ignoring a leading `www.`. Subdomains and ports count as different sites.

### 2.5 Keymap operations
- **assign(key, shortcut)** on a free key writes it. On an occupied key it returns a **conflict**, resolved by **Replace** (the old shortcut is lost) or **Move** (the old shortcut goes to a free key, §2.6).
- **swap(a, b)** exchanges the contents of two keys. **move(a, b)** moves a shortcut to a free key. **clear(key)** frees the key. `S` is never a target.

### 2.6 Fitting keys
- Candidates for a page, in order: the first letter of the site's main label (`github.com` → G), then the first letters of the title's words, then the remaining letters of that label.
- Only free keys count, never `S`; at most 4 are suggested.
- **Fallback**: the first free key in keyboard order.
- The **Move** target for a displaced shortcut is the first free fitting key for the *old* shortcut, else the first free key in keyboard order.

### 2.7 Search
Case-insensitive substring search.
- Options: over key, name and link.
- Overlay: over name and link, not the key letter.
↳ rebuild map: issues/06-behavior-audit.md (behavior audit)

---

## 3. Storage

### 3.1 Schema (schemaVersion 2)
| Area | Item | Value |
|---|---|---|
| `sync` | `key.<K>` (e.g. `key.Y`, `key.1`), one per occupied key | `{ link, name?, openMode, tabMatch, closeCurrent }` |
| `sync` | `meta` | `{ schemaVersion: 2, v1Imported?: true }` |
| `session` | `undo` | `{ id, expiresAt, keys: { <K>: Shortcut \| null }, written: { <K>: Shortcut \| null } }` |

- A free key has no `key.<K>` item. There is no `settings` item; a future setting becomes its own item, defaulted on read.
- Item names never collide with v1's (`speedlink`, legacy `shortcuts`), so v1 data stays alongside.
- Per-key items keep each shortcut under the 8 KB item cap. A swap is one `set` of two items. Sync is last-writer-wins per item, so edits to different keys on different devices don't clobber each other.
- Options autosave is debounced (~400 ms) to stay under 120 writes/min.

### 3.2 Rules
- **Write strict**: an invalid shortcut is never written; the UI shows the error.
- **Read tolerant**: invalid items are skipped (the key looks free) and **not deleted**; missing fields take their defaults; unknown fields survive a rewrite. Only migrations rewrite stored data.
- **Migrations** run in the background on install, update and startup, keyed on `meta.schemaVersion`. A missing `meta` is version 1 (the 4.0 baseline); a higher version is never lowered.
  - **2** (4.1.1): every readable `key.<K>` item with `tabMatch: site`, whatever its open mode, becomes `page`; every other field is kept as stored. Unreadable items and other tab matches are not written. It runs once, so a `site` chosen later stays.
- All surfaces see live keymap changes, including remote sync changes.

### 3.3 Undo record
- Holds `{ id, expiresAt, keys, written }` in `storage.session` for up to 60 s. Undo is offered while the saved toast is visible and applies only when every touched key still holds what the change wrote (all or nothing); otherwise nothing changes.
- `keys` is the previous contents of every touched key (null = free), `written` what the change put there. `id` is fresh per change, and every change replaces the record, so an older toast's (or inline) Undo is refused.
- It is created **only** by an assign from the popup or from the page toast, and by **Remove** and **Move** on the popup's key card (§7), so an Undo after Replace or Move restores the old shortcut too. Opens as and Use this exact page have no undo.
- Options edits (autosave, Clear key, swap, move) have no undo.
↳ rebuild map: issues/05-domain-model.md (domain model)

---

## 4. Opening a shortcut and key capture

### 4.1 Opening (background)
- **Smart switch**: pick the winning tab among the tabs that match:
  1. If the current tab matches → nothing happens: no toast, and close current never closes it.
  2. Else the most recently used (`lastAccessed`) matching tab in the current window.
  3. Else the most recently used one in other windows, raising its window.
  4. With no match → open a new tab.
- **New tab** / **Background tab**: open at the current index + 1 with `openerTabId`; Background keeps focus.
- **This tab**: update the current tab.
- **Close current**: after the open, close the tab the key was pressed on (never with This tab, never when Smart found the current tab).
- **Force new tab** (⌥⇧+key, ⇧+key or ⇧+click in the overlay): open in a new tab once, ignoring the open mode and close current.
- **Badge flash**: after a successful open by key, the target tab's badge shows "K" for 1.5 s, then it is cleared.
- Opening is a pure "what to do" plan (`noop` | `activate` | `create` | `update`, plus an optional tab to close) executed by a thin Chrome layer (§11.2).
↳ rebuild map: issues/06-behavior-audit.md (behavior audit)

### 4.2 Listener
- The content script runs in **all frames**. `window` `keydown`/`keyup` listeners in the **capture** phase are registered synchronously at the top of `main()`, before any `await`.
- Trigger check = `altKey && !ctrlKey && !metaKey && !getModifierState('AltGraph')`. AltGr layouts are untouched.
- Ignored:
  - `event.repeat` (still suppressed, never opens twice);
  - IME composition (`isComposing` / `keyCode 229`);
  - an **editable target** resolved through `composedPath()[0]`: text-like `input`, `textarea`, `select`, `isContentEditable`, `designMode`. The guard covers both ⌥+key and the ⌥ hold. Accepted cost: no ⌥+key in Google Docs or mail compose.
- The content script keeps a read-only cache of occupied keys (an initial read plus `storage.onChanged`), so it can decide synchronously on keydown.

### 4.3 Suppression
Suppression = `preventDefault` + `stopImmediatePropagation`.
- **Assigned key**: always suppressed and opened. An assigned key wins over browser Alt shortcuts.
- **Free key**: suppressed, and the "⌥K is free" toast is shown (§6). **Exception**: free platform browser keys pass through silently:
  - Windows: D, E, F
  - Linux: D, E, F, 1–9
  - ChromeOS: E, F, 1–9
  - macOS: none
- **⌥⇧ + free key**: passes through silently on every OS, so Alt+Shift browser shortcuts (e.g. Alt+Shift+T) keep working.
- Page `accesskey`s on intercepted keys are lost (accepted).

### 4.4 Frames
UI (overlay, toasts) renders in the **top frame only**. A sub-frame sends `openKey` itself (its `sender.tab` is the tab); its own Peek (it runs its own hold timer) and its ⌥S are relayed through the background to `frameId: 0` as `frameEvent{kind: 'show'|'close'|'pin'}`, and it consumes the Windows Alt keyup itself.

### 4.5 Injection and lifecycle
- On `onInstalled` (install and update), inject into every open http(s) tab, all frames, skipping discarded tabs.
- Every background → tab send pings first, injects when there is no answer, and retries once.
- A double-mount guard prevents a second copy of the script.
- On every event the script checks `chrome.runtime?.id`. When its context is dead it tears down its listeners and UI.
- The orphaned v1.6 script is left alone.

### 4.6 Where ⌥+key does not work
⌥+key does nothing on restricted pages (chrome://, the NTP, the Web Store, the PDF viewer, view-source) and in the popup's own page. It also does nothing while focus is inside an `about:blank`, `srcdoc` or `data:` child frame (no `match_about_blank` / `match_origin_as_fallback`). Only ⌥S has a fallback there (§5.3), and the popup becomes a launcher on a restricted page (§7).

**Extension pages** (Options, welcome) have no content script, so each page runs the same keydown decision itself (§4.2, §4.3: trigger check, AltGr, IME, repeat, editable target, per-OS browser keys) and ⌥+key works there with Test semantics (§8.5): `tryKey{key, force}` opens the shortcut and the SpeedLink page is never replaced or closed. ⇧ = Force new tab. No Peek and no overlay appear on these pages. A free key and ⌥S act on the page: §8.9 for Options, §9 for welcome. A free key replies `free` with no toast.

### 4.7 Platform labels
- One synchronous helper decides Mac vs non-Mac from `navigator.userAgent` and is used by every surface.
- Mac: "⌥ Option", "⌥K …".
- Windows/Linux/ChromeOS: "Alt", "Alt+K …".
- No keyboard picture draws a modifier row.
- Every trigger string goes through this helper and an i18n placeholder.
↳ rebuild map: issues/13-keyboard-capture.md (keyboard capture)

---

## 5. Overlay

### 5.1 Peek
- **Opening**: the timer starts on keydown of `AltLeft`/`AltRight` with no other modifier and not repeat. Any other keydown, mousedown, wheel, `blur`, `visibilitychange`, or ⌥ keyup before **400 ms** (fixed) cancels it. A quick ⌥+key never flashes the overlay.
- **In Peek**: key → open; ⇧+key → Force new tab; S → pin (§5.2); ⌥ release or Esc → close. There is no search: while ⌥ is held every letter is a key, so the hint says "S to search" and typing starts only in the pinned overlay.
  - A key or a tile click that opens closes the Peek: one hold opens one thing. Shift alone doesn't close it.
  - Ctrl, ⌘, and any key that isn't a SpeedLink key close it and pass through to the page; Esc is consumed.
  - Focus never leaves the page in a Peek: the overlay takes no focus, so nothing needs restoring.
- **Windows**: releasing Alt alone focuses Chrome's ⋮ menu. The Alt keyup is consumed **only after a Peek was shown**; a bare Alt tap keeps native behavior.

### 5.2 Pinned overlay
- **Opening**: ⌥S, or S during a Peek. ⌥S on the pinned overlay closes it.
- **Focus**: the search takes focus; on close, focus returns to the element that had it (through shadow roots) if it is still there.
- **Behavior**:
  - It stays open after ⌥ is released, and through a `blur` or `visibilitychange`. On Windows the Alt keyup after ⌥S is consumed, so the ⋮ menu doesn't take focus from the search.
  - Bare letters type into the search (§2.7); non-matching tiles are hidden, and the first visible tile is the top result.
  - The highlight sits on the top result and goes back to it on every query change. Arrow keys move it over the 4-column grid of visible tiles (↑↓ by row, ←→ by tile, clamped at the edges).
  - ↵ opens the highlighted tile, ⇧↵ in a new tab (Force new tab); ↵ with no matches does nothing. Keys are read from the real target via `composedPath`.
  - ⌥+key still opens, with focus in the search too (⇧ = Force new tab); ⌥+free key closes it and shows the free toast. Any open closes it.
  - Esc clears a non-empty query first, then closes. A click outside closes it.
- No results → `No keys match "…"`.

### 5.3 ⌥S and commands
- `S` is reserved regardless of command bindings. The content script handles ⌥S itself wherever it runs; on Options and welcome the page does (§4.6): ⌥S focuses the keymap search on Options and opens Options from welcome.
- Command `toggle-overlay` (suggested `Alt+S`) covers the omnibox and restricted pages. Chrome swallows the S keydown, so the handler sends the tab `overlay{action: 'toggle'}`, which pins (clearing a pending hold timer) or closes.
- The handler checks the tab's URL first. On the Options tab itself it sets `#search` in the tab's hash (a hash change, so nothing reloads and a draft survives), and Options focuses the keymap search (§8.9). A URL restricted by §4.6 (non-http(s), the NTP, the Web Store) **opens Options on the keymap** at once, focusing an existing Options tab; so does the welcome page. Otherwise it sends the toggle through `sendToTab` (§4.5, injecting into a tab from before install or update); `restricted` (the PDF viewer) → Options, `failed` (e.g. mid-navigation) → nothing.
- With focus in the omnibox the overlay still shows on the page, and the search takes focus as soon as the page does.
- `_execute_action` (popup) has **no suggested key**.
- An update from v1 leaves both commands unbound. Mitigation: Options shows the quiet line "Set ⌥S for pages where SpeedLink can't run", linking to `chrome://extensions/shortcuts`, while `commands.getAll()` reports no binding. A no-op 4.0.1 then assigns Alt+S (§14).

### 5.4 Content
- **Dialog**: wide (`max-w-4xl`) and low on the page (`pt-40`), `p-6`, rounded, with a slightly darker scrim and a shadow.
- **Tiles**: one per assigned key, in keyboard order, 4 columns. Past 12 tiles the tile area scrolls inside the dialog (max ~70vh), up to 35. No profile label.
- **Tile**: a plain white keycap (md, no open dot) on the left, then the name (or site) over the subline, then the shortcut's 20 px coloured monogram tile on the right (the same letter and colour as on its key in Options, §12.2). A tile whose page is open is green (background and border) and keeps its monogram colour:
  - Smart switch would switch to a tab in this window (the current tab included) → "Open · tab N" (1-based position, green);
  - Smart switch would raise another window → "Open · other window" (green);
  - else Smart → site, New → "new tab", This → "this tab", Background → "background". Both "Open" sublines follow Smart switch's winner (§4.1), so other open modes show their mode even when the page is open.
- **Top row**: badge "⌥ held" + the plain hint "Press a key — S to search" (no field: ⌥ is held, so every letter is a key). In the pinned overlay the badge reads "Pinned" and a bordered search box follows, with the placeholder "Press a key — or keep typing to search". The highlighted tile (the top result, or where the arrows moved) has a blue border and ring, and keeps its green when open.
- **Footer legend**: key go · ⇧ + key force new tab · ⌥ release or Esc close · small green tile swatch "open now — will switch, not reopen". The pinned overlay adds "type search names & links" and drops "⌥ release" (Esc close), since typing works only there.
- **Empty keymap**: "No keys yet" + an "Open keymap" link.
- **Mouse**: tile click opens, ⇧+click = Force new tab; both work in Peek too. A pencil on tile hover/focus (it takes the monogram tile's place) opens Options `#key=K` (focusing an existing tab without reloading it) and closes the overlay.
- ⌥+free key while the overlay is open: the overlay closes and the "⌥K is free" toast appears.
- The overlay model (tiles, Open now, tab N, other window) comes from the background on open.
↳ rebuild map: issues/13-keyboard-capture.md (keyboard capture), issues/06-behavior-audit.md (behavior audit)

---

## 6. Page toasts and badge

Toasts render on the page, top frame only. Each is a dark pill: key chip + message + action link. The saved and switched toasts also show the shortcut's tile (§12.2) between the chip and the message; the free-key and error toasts have none.

| Toast | Shown when | Action | Lifetime |
|---|---|---|---|
| **"⌥K is free · Put this page on it"** | ⌥ + free key (§4.3) | assigns the current page to K at once (name = tab title, defaults), then shows the saved toast. No popup step | until dismissed or replaced, or until its key is taken |
| **"⌥K → Name saved · Undo"** | after an assign from the popup or the free-key toast | Undo restores the undo record (§3.3); the toast closes at once | 5 s, held while hovered |
| **"Couldn't undo — your keys changed"** / **"Couldn't save ⌥K"** | an Undo was refused (§3.3), or an assign from the free-key toast saved nothing (key taken, page unusable, write failed); the popup shows its own failures (§7) | none, no × | 5 s, held while hovered |
| **"Switched to your open Name tab · Open new"** | on the switched-to tab after Smart switch activated another tab | Open new = Force new tab | 3 s |

- No toasts on restricted pages.
- Badge flash: §4.1.
↳ rebuild map: issues/06-behavior-audit.md (behavior audit)

---

## 7. Popup · Assign this page

380 px wide. Every view (assign, launcher, loading) has the same frame: a full-width white header bar, a grey scrolling body and a full-width white footer bar.
- **Header**: logo + "SpeedLink". Nothing on the right.
- **Footer**: "Hold ⌥ to see all keys" (⌥ as a key; "Alt" off a Mac) and an "Open keymap →" link that opens Options and closes the popup. The launcher's footer is only "Open keymap →". While loading, the body is empty and the footer is the assign view's.

**Page card**
- The shortcut's coloured monogram tile (36 px, no favicon), the tab title and the link.
- **Already on a key**: each shortcut is matched by its own tab match. The page card shows no "Already on" line while the key card (below) shows; only the picker behind "Put it on another key too" says "Already on ⌥Y" (or "⌥Y, ⌥2").

**Key card** (the page is already on a key): it takes the picker's place under the page card. Which key: the first in keyboard order, or the one picked among the chips below. Local view state, never stored; it follows the live keymap, and falls back to the picker when no key matches any more.
- A 56 px "⌥G" tile ("Alt+G" off a Mac), "This page is on ⌥G" (never "This site", whatever the tab match), and "Saved as Name · site" (the site stands in for a missing name).
- **Several keys**: chips named by their chord (`aria-pressed`) above the card switch between their cards. One key has no chips.
- **Opens as**: a dropdown with the key's current mode (named "Opens as: Smart switch"); a new mode saves at once, with no undo and no toast.
- **Move to another key** ›: the picker in **move mode**. Chips are the free keys that fit the moved shortcut (§2.6); the default pick is the first chip, else the first free key; the primary reads "Move to ⌥K"; the source key is taken and a press on it is ignored; there is no Opens as (the shortcut keeps its mode). A taken target gives the conflict alert without a Move button and a dark "Replace ⌥K": Replace drops the target's old shortcut (never a swap). ↵ moves. The popup closes after a move and the saved toast "⌥K → Name saved · Undo" shows on the page; its Undo puts every touched key back. A failed move keeps the popup in move mode with "Couldn't save ⌥K".
- **Use this exact page instead** (the tab's URL as a muted hint), only when the tab's URL differs from the link: the link becomes the tab's full URL and the tab match `exact`; name, open mode and close current stay. No undo; the card updates in place.
- **Remove from ⌥G** (destructive): frees the key and keeps the popup open with "Removed from ⌥G · Undo" above whatever follows: the card for the page's next key, else the picker. The line stays up to the undo record's lifetime (§3.3) and goes on Undo, after any other successful write from the popup, or when the lifetime ends. A refused Undo reads "Couldn't undo — your keys changed", with no button. No page toast.
- **Put it on another key too**: a link at the bottom that shows the normal picker (with "Already on ⌥G") and saves through the assign path, closing the popup with the saved toast as usual.
- **Cancel** (a link on the picker's prompt row) goes from move mode or that picker back to the card. Esc closes the popup as usual.
- A failed Opens as or Use this exact page shows "Couldn't save ⌥G" on the card. A key that was cleared meanwhile redraws from the fresh keymap, with no message.

**Key picker**
- Label "Press a key to put this page on it". With all 35 keys in use: "All 35 keys are in use — press one to replace it", no picked key and the keyboard shown.
- A picked-key drop zone ("⌥ +" + big keycap).
- "Free & fitting" chips (§2.6, at most 4): the bare letter, named "⌥H" ("Alt+H") for assistive tech.
- **Show keyboard / Hide keyboard**: a link-style button (`aria-expanded`) that swaps the chips for the mini keyboard (picked / taken / free / reserved) and back. The popup always opens on the chips; the choice is not remembered. With no chips (all 35 in use, or no free key fits) the mini keyboard shows from the start and there is no toggle.
- **Default picked key**: the first chip, else the first free key in keyboard order.
- A physical key press in the popup (`event.code`, no ⌥) picks that key in either view, without switching the view (a key that isn't a chip shows in the drop zone with no chip pressed); ↵ saves, also right after the toggle was clicked.

**Opens as**: a compact dropdown with the 4 open modes, no visible label (named "Opens as: Smart switch" for assistive tech), left of the primary button on one row; both 46 px high. Tab match and close current are not in the popup. A new shortcut gets the defaults (smart / page / no close) plus the chosen open mode; it never inherits a replaced shortcut's settings.

**Primary button**: fills the rest of the row. Free key → "Save to ⌥K"; taken key → dark "Replace ⌥K". A failed save shows "Couldn't save ⌥K" under the row.

**Conflict**
- A warning alert "⌥K already opens **Name**." with only **Move it to ⌥X** (X per §2.6); Replace is the primary button. Move is hidden when no key is free.
- Pick another = press another key.
- Replace and Move both write the undo record.

**Unusable page** (any non-http(s) or restricted page): the popup is a **launcher**, so it is never a dead end.
- Under the header, a short line "This page can't be put on a key" (the way to the keymap is the footer link). The picker, Save and Opens as are not shown.
- Then the overlay's tiles for this tab (the tiles follow §5.4: keycap, name or site, subline, monogram tile, green when open), from `getOverlayModel{tabId}`, 2 columns at this width; past 12 tiles the area scrolls inside the popup. No pencil and no search.
- A bare key, ⌥+key or a tile click opens that key's shortcut through `openKey{key, force, tabId}` with the restricted tab as the current tab (normal semantics, not Test): This tab replaces the new tab page, close current closes it. ⇧ (or ⇧+click) = Force new tab. The keys are read by `event.code`; S is ignored.
- An `opened` / `noop` reply closes the popup. A free key stays open with "⌥K is free" under the tiles; a `failed` reply shows "Couldn't open ⌥K".
- Empty keymap: "No keys yet" + "Open keymap" (and the footer link).
- ⌥S on a restricted page still opens Options (§5.3).

**All 35 in use**: no chips and no picked key; the prompt reads "All 35 keys are in use — press one to replace it". Replace only.

**After save**
- The popup closes, and the saved toast appears on the page (ping/inject fallback).
- The stored name = the tab title.
- The assign itself runs in the background, which reads url and title from `chrome.tabs`, never from the page.
- A failed save (tab gone, write failed, page turned unusable) keeps the popup open with "Couldn't save ⌥K" under the primary button, and no page toast. A key taken elsewhere between picking and saving keeps it open with the conflict alert, from the fresh keymap.
↳ rebuild map: issues/06-behavior-audit.md (behavior audit)

---

## 8. Options · Keymap

### 8.1 Layout
There is no left nav: only Keymap is left. The page is one centred column (header, heading, the keys card); there is no Inspector aside, so the keys card has the full width.

**Header**
- Logo + "SpeedLink".
- A 44 px search field "Find a link, site or key…" with a `/` keycap.
- In the right slot, the hint "Hold **⌥ Option** anywhere to see your keys". It is hidden in a narrow window (below).

**Heading**
- "Keymap" + the subline "Press **⌥ + key** on any page to open its link. N of 35 keys in use."
- A view switch **Keyboard** (default) | **List**.

**First run**
- While the keymap has no shortcut, Options shows the first-run state in place of the normal heading. It is derived live from the keymap, with no stored flag: it ends the moment a key is assigned, from here or from elsewhere (the popup, another Options tab, sync), and comes back when the last key is cleared.
- The header (logo, search, the "Hold ⌥ anywhere…" hint) and the ⌥S line (§8.8) stay as they are. The "Keymap" heading, the "N of 35" subline, the Keyboard | List switch and the legend go.
- Heading **"Put your first link on a key"** + the subline "Then press **⌥ + that key** on any page to open it. All 35 keys are free." (Alt on Windows and Linux).
- Three step cards in a row: **1 Pick a key** ("Click it below, or just press it on your keyboard.") · **2 Paste a link** ("⌘V works right away. The name comes from the page.", Ctrl+V on Windows and Linux) · **3 Use it anywhere** ("Hold ⌥ on any page to see your keys."). The active card has a primary border and number: step 2 exactly while a key is selected, step 1 otherwise; step 3 is never active. The cards stack to one column when three don't fit in a row.
- The keys are always the Keyboard view: with a List view open, clearing the last key shows the keys. Under the keys, the hint "Not sure where to start? Open a site you use every day, click the SpeedLink icon in the toolbar and press a key." replaces the legend.
- **Start here**: the first free key in keyboard order (`1` on an empty keymap, never `S`) is drawn as a dashed "Start here" key; selected wins on the same key. Its accessible name is that of any free key.
- Narrow window: the same compact keys and no header hint as below, a 24 px heading, and the subline and the hint wrap.
- It is there from the first paint; there is no flash of the normal layout.
- The first successful save turns the page behind the dialog into the normal layout (the new key selected); the dialog stays open on it, with "Saved", for a name or an Opens as mode. Clear key on the last key leaves the dialog open on the now-free key while the page behind it turns back into first run. Closing with an invalid link discards it (§8.4) and leaves first run, step 1 active.

**Keyboard view**
- Keys: 4 staggered rows of 76×64 keys, no modifier row.
- Narrow window: when the keys card is narrower than the 76×64 keyboard (860 px of card content, a window of about 974 px), the same keyboard is drawn with compact 56×52 keys (stagger 0/20/34/54 px, gap 6 px) and the header hint is hidden. The size follows the card's width live, both ways, and is right from the first paint. Narrower than the compact keyboard (634 px of content, a window of about 748 px) the keyboard scrolls sideways inside its card; the page never does. States, selection, drag-to-swap, the arrows, the key editor dialog and the List view work the same at every width. The legend and its hint stay and wrap.
- Key states: free, assigned (label, monogram tile and the name on a bottom line), open now (green dot on the outer corner), selected (blue, the tile keeps its colour with a white ring), drop target, reserved S (lock).
- A click (or ↵ / Space) on a key opens its editor dialog (§8.3), as does its bare key and ⌘V on it (§8.9).
- A legend: Assigned · Free · ● Open in a tab now, and on the right "Press a key to edit it · **⌘V** pastes a link onto it · Drag to swap" (Ctrl+V on Windows and Linux).

**List view**
- Columns Key · Name · Link · Opens as ("· closes current" when set, never for This tab, where it is ignored).
- Only assigned keys, in keyboard order, with no sorting.
- A row click selects that key and opens its editor dialog over the List view; the view does not switch. The selected key's row is highlighted.
- The Key cell shows the open-now dot. Name falls back to the site, shown muted. The Link is truncated to one line, with the full link in a tooltip.
- A query that matches no assigned key, including one that matches only free keys, shows "No keys match".

### 8.2 Selection
- At most one key is selected; the selection may be empty. The editor dialog (§8.3) is open exactly while a key is selected, over whichever view is shown.
- `#key=K` selects K and opens its dialog. It is used by the overlay pencil and by ⌥S on restricted pages. It is read on load and on `hashchange` (which also switches an open dialog to K); S is never selected.
- Without `#key=K`, nothing is selected on load.
- First run (§8.1): with the keymap empty and no `#key=K` or `#search` on load, focus goes to the Start here key, so ↵, Space, ⌘V and a bare key act at once. This happens once per page load; when first run comes back after Clear key, closing the dialog returns focus to the key as usual. With `#key=K`, K is selected and its dialog open over the first-run page. A click or bare key on any free key opens its dialog, as for any free key.
- The selection is mirrored to `#key=K` with `history.replaceState`; with nothing selected, the hash is cleared.
- A click on a key selects it and opens its dialog. With the dialog open the keys are behind its scrim, so another key is reached by closing it first (or with ⌥ + a free key or its bare key, §8.9).
- The dialog closes with ×, Done, a click on the scrim and Esc. Esc closes it when focus is outside a field, or in Link or Name while the draft equals storage; in a field with an unsaved change, the first Esc only leaves the field for the dialog (nothing is reverted) and the next one closes.
- Closing settles the draft as a key switch does: a valid one is saved, an invalid one is discarded (§8.4).
- Focus: a free key opens with focus in Link; an assigned key opens with focus on the dialog itself, no field active. ↵ from the search (§8.6) and ⌥ + a free key (§8.9) focus Link whatever the key. A bare key (§8.9) focuses Link on a free key and the dialog on an assigned one, also when it switches an open dialog; a ⌘V that opened the dialog focuses the dialog. Closing returns focus to the key, or to the List row's key it was opened from. The arrow keys move focus between keys (passing over `S`) without selecting. Only the selected key, or the first key with nothing selected, is in the tab order.

### 8.3 Key editor dialog ("Edit key")
A modal dialog named "Edit key": a scrim over the page, focus kept inside (Tab cycles through the dialog), the page behind it does not scroll and is hidden from assistive tech. It is centred at every window size, `max-w-md` (448 px) wide, and in a narrow window the window's width minus a margin; in a short window its content scrolls inside it. It never follows the key; the selected key stays highlighted under the scrim. It fades and zooms in, without animation under reduced motion. Radix `Dialog` is allowed here: the no-portal, no-focus-trap rule is for the HUD (§12.3).

**Header**
- A key chip "⌥K".
- Title = the name (or site), or "Free key".
- Status "Open in a tab now" | the open mode | "Paste a link to assign it".
- A × button.

**Link**
- Placeholder "Paste a link or type a site", plus a **Use current tab** icon button inside the field.
- Use current tab takes the most recently used (`lastAccessed`) http(s) tab in a normal, non-incognito window, never an extension page; the tooltip names its title. Without one, the button is disabled with the tooltip "No web page open".
- It fills Link, and Name if Name is empty (tab title).

**Name**: "— optional", placeholder "Taken from the page title". When the draft's link becomes valid at the autosave settle (§8.4), pasted or typed, and Name is empty and wasn't edited in this dialog session (opening or switching keys starts a new one), Name is filled from the title of an open tab on that link by the "This page" rule (§2.4): the most recently used (`lastAccessed`) such tab in a normal, non-incognito window. No such tab, or one without a title, leaves Name empty. Titles are read live (a tab that finishes loading later gives its real title); nothing is fetched over the network. A Name already there is never overwritten.

**Opens as**: a 4-way segmented control, Smart · New tab · This tab · Background, each segment named by its full term ("Smart switch", "Background tab") for assistive tech. No badge. The chosen mode's description shows under it:
- Smart switch: "Jumps to the tab if it's already open, otherwise opens a new one."
- New tab: "Always opens a fresh tab next to the current one."
- This tab: "Replaces the page you're looking at."
- Background tab: "Opens quietly and you stay where you are."

**Tab-strip preview**: under the description, a decorative before → after row of tabs (hidden from assistive tech), drawn with the shortcut's own name and tile, following the draft live. Before: "Docs" (active), the shortcut's tab, "Mail". After: Smart → its tab active; New tab → a new tab of it, active; This tab → it replaces the active tab; Background → a new tinted tab, "Docs" still active. With close current, the source tab shows as a dashed "closed" chip.

**More options**: a disclosure, collapsed each time the dialog opens and on every key switch, and open by itself when the key stores a non-default tab match or close current. It holds:
- **Tab match** (shown only for Smart): the prompt "Count a tab as "already open" when it shows"; choices **This exact link** | **This page** | **Any page of the site**; live hints:
  - exact: "Only a tab with exactly {link} is reused."
  - page: "Reuses a tab on {link}, ignoring ?query and #anchors."
  - site: "Reuses any tab on {site} — e.g. a video you left open."
- **Close current**: the checkbox "Close the tab I'm on afterwards", disabled with This tab.

**Footer**: **Clear key** (destructive text button; no confirm, no undo; the dialog stays open on the now-free key) · the save line ("Saved" on an assigned key with nothing pending, "Saving…", "Couldn't save"; empty on an untouched free key) · **Test** (outline, §8.5) · **Done** (closes the dialog). Clear key and Test are disabled on a free key.

While the dialog is open, `/` does nothing (§8.6), and ⌥S and `#search` leave focus in it (§8.9).

### 8.4 Autosave and validation
- Changes save automatically, debounced ~400 ms.
- An invalid link → an inline error under the field. Nothing is written, the stored value stays the last valid one, and "Saved" is hidden.
- A free key becomes assigned only once its link is valid.
- Switching keys or closing the dialog discards an unsaved invalid draft and saves a valid one.
- Remote (sync) changes appear live, in the open dialog too; a draft being edited is kept.

### 8.5 Test
- Opens the shortcut as if its key were pressed with Options as the current tab, but it never replaces or closes Options:
  - Smart → switch or new tab;
  - New / This → new tab;
  - Background → background tab;
  - close current ignored.
- Disabled on a free key.
- ⌥+key on the page (§8.9) opens through the same path; ⇧ forces a new tab.

### 8.6 `/` search
- `/` focuses the search and selects its text; it matches per §2.7. `/` is ignored in editable fields (inputs, textareas, contenteditable), with ⌘, Ctrl or ⌥ held, and while the dialog is open (the search is behind its scrim).
- Filtering is live on every keystroke. Keyboard view dims non-matching keys; List view hides non-matching rows.
- ↵ selects the exact key-label match first, otherwise the first match in keyboard order; in List view, the first visible row, as a row click does (the dialog opens over the list). It opens the key's dialog, moves focus to Link and keeps the query. ↵ with no match does nothing.
- Esc clears the query; a second Esc on an empty field leaves it. Esc only applies while the search field has focus.
- Typing never changes the selection, and a dimmed selected key keeps its dialog open. The query is shared by both views, not persisted, and empty on load.
- No match → all keys dimmed / "No keys match".

### 8.7 Drag-to-swap
- Dropping onto an assigned key swaps; dropping onto a free key moves. `S` is never a target.
- It also works with the keyboard (dnd-kit keyboard sensor).
- A drag happens only with the dialog closed (the keys are behind its scrim otherwise), and a drop leaves nothing selected: no dialog opens. No undo.
- Only keys that hold a shortcut can be dragged. A pointer drag starts after a 5 px move, so a click still opens the key.
- From the keyboard, Space picks up, the arrows jump key to key across the staggered rows (passing over `S`), Space or ↵ drops and Esc cancels; none of these opens a dialog. ↵ on a key that isn't being dragged still acts as a click.
- Dropping a key on itself, or outside any key, changes nothing. Dimmed (search) keys stay targets.
- A valid pending draft is saved first and an invalid one is discarded, as on switching keys.
- "Saved" shows after the drop, as after an autosave. There is no toast.
- Screen-reader announcements (picked up, over a key with swap or move, dropped, cancelled) are localized and name keys with the platform trigger.

### 8.8 ⌥S hint
The "Set ⌥S" line, per §5.3.

### 8.9 ⌥+key on Options
- ⌥+key follows §4.6: an assigned key opens as Test does (§8.5), ⌥⇧+key forces a new tab. A pending draft is left alone.
- ⌥ + a free key selects that key and opens its dialog with focus in Link, over the current view; with the dialog open it switches the dialog to that key. A draft is saved or discarded as on any key switch (§8.4). ⌥ + an assigned key opens as Test also with the dialog open.
- A bare key (a letter or digit, no ⇧, ⌘, Ctrl, ⌥ or AltGr, outside Link, Name and the search) selects that key and opens its dialog; with the dialog open it switches the dialog to that key, so a bare key reaches an assigned key from the dialog. It works with focus anywhere outside a text field, the dialog's controls and buttons included. The key already selected and S do nothing; a held key acts once; IME composition and a keyboard drag (§8.7) leave it alone. Focus per §8.2; the draft settles and More options collapses as on any key switch.
- ⌘V / Ctrl+V outside Link, Name and the search pastes a link onto the dialog's key, or, with the dialog closed, onto the focused key (a List row's key included), opening its dialog with focus on the dialog. With no key focused it does nothing. Only plain text is read, trimmed, from the paste event (no clipboard permission); an empty one, or an image, is ignored. A free key is assigned once the link is valid; an assigned key gets its link replaced and keeps its name; an invalid link shows the inline error and writes nothing (§8.4). The write is the normal autosave, with "Saved". Inside a field ⌘V pastes as usual.
- ⌥S focuses the search and selects its text, as `/` does (§8.6). It arrives either from the page's own listener, or from the `toggle-overlay` command, which sets `#search` (§5.3); the page reacts as it does to `#key=K` (no reload) and puts `#key=K` back (or an empty hash). With the dialog open, the search is behind its scrim: focus stays in the dialog.
- Typing in a field (Link, Name, the search) is the field's: ⌥+key there is not ours. On Windows and Linux the browser's own Alt keys on free keys keep working (§4.3). Repeats send once.
- No Peek: the keymap is already in view.
↳ rebuild map: issues/06-behavior-audit.md (behavior audit), issues/08-theme-and-components.md (theme and components)

---

## 9. Welcome page

- An extension page. It opens on **fresh install** and on **update from 1.x** (`reason: 'update'`, `previousVersion` starting with `1.`). 4.x → 4.y updates open nothing.
- Content:
  - "Hold ⌥ and press a key to jump to a site";
  - three steps, drawn as step cards (the same pattern as first run, §8.1, but none active): put a page on a key (the icon, or ⌥ + a free key) → press ⌥ + key anywhere → hold ⌥ to see your keys; the cards stay in one column;
  - a tip to pin the icon;
  - an "Open keymap" button.
- ⌥+key works here as on Options (§4.6): an assigned key opens in a new tab and the welcome tab stays; ⌥ + a free key opens Options on that key (`#key=K`); ⌥S opens Options.
- No Top Sites, no Default behavior step, no "Press ⌥Y now", no "What's new" variant.
↳ rebuild map: issues/06-behavior-audit.md (behavior audit), issues/10-release-plan.md (release plan)

---

## 10. Migration from v1

**Source**: the v1 `sync` item `speedlink` = `{shortcuts:[{canEdit,id,shortcut,title,url}], settings:{theme,useShift,postAction,smartTabs}}`. Missing settings take their effective 1.6 values: `smartTabs:false`, `postAction:"Jump to tab"`.

**Mapping** (into `key.<K>`)
- **Open mode** is the same for all of a user's shortcuts:
  - `smartTabs:true` → `smart`;
  - else by `postAction`: "Open in background" → `bg`, "Jump to tab" → `new`, "Close & Jump to tab" → `this`.
- `tabMatch: page`, `closeCurrent: false`.
- **Key**: `shortcut` A–Z / 0–9, upper-cased; other values are dropped. Duplicates: the last one in array order wins.
- **Key S**: moves to its first fitting key, else to the first free key in keyboard order.
- **Link**: the `url` goes through the 4.0 normalizer. Non-http(s), empty or unparseable links are not migrated.
- **Name**: `title` trimmed, omitted when empty.
- **Dropped**: `id`, `canEdit`, `useShift`, `theme`, `localStorage['vite-ui-theme']`, the legacy `shortcuts` key.
- The v1 seed (Google 1, Facebook 2) migrates like any other data.

**Running it**
- Pure `migrateV1(raw, existingKeys) → { items, report }`, executed by the background.
- It writes onto **free keys only**, so it is idempotent and safe against 4.0 data from another device.
- It runs on install, update, startup and `storage.onChanged` for `speedlink`, until `meta.v1Imported: true` exists.
- Items + `meta.v1Imported` are written in **one** `sync.set`. On failure nothing is marked, so the next trigger retries.
- `speedlink` is **never changed or deleted** in 4.0; it is the rollback and re-import source. Edits made on a device still on 1.6 after another device imported are lost (accepted).

**Reporting**: no UI. The report (migrated / skipped with reason / moved S) goes to `console.info` in the background.

**Tests**
- Unit fixtures:
  - the seed;
  - settings drift (1.0, 1.1, 1.3/1.4, 1.5+);
  - all 3 `postAction` values × `smartTabs`;
  - S occupied (fitting key and fallback);
  - duplicates;
  - empty, `canEdit:true` and lower-case rows;
  - non-http and scheme-less links;
  - keys already held by 4.0 data;
  - an empty or missing `speedlink`.
- A fixture from the author's real 1.6 export, with links anonymized.
- e2e: seeded `sync` → load 4.0 → check Options.
↳ rebuild map: issues/09-v1-migration.md (v1 migration), issues/02-v1-published-data.md (v1 published data)

---

## 11. Architecture

### 11.1 Stack and repo
- New private repo `itigancov/speedlink` at `~/personal/speedlink`. v1's `itigancov/SpeedLink` stays as an archive.
- Single package: WXT (`srcDir: 'src'`) + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite`) + shadcn/ui, pnpm.
- Node is pinned via `engines` + `.nvmrc`, pnpm via `packageManager`.
- 3.0 is the source of **logic** only: domain modules are ported test-first, and no 3.0 UI is copied.

```
src/
  entrypoints/
    background/        index.ts + handlers/ (open, commands, install, relay, badge)
    hud.content/       index.tsx (sync key guard + mount) + overlay/, toast/
    popup/  options/  welcome/
  domain/              pure TS: keys, shortcut, link, tab-match, keymap-ops,
                       fitting-keys, open-plan, search, migrations
  platform/            everything touching chrome.*: keymap-store, undo-store, tabs,
                       injection, commands, messaging, platform-labels, i18n
  components/ui/       stock shadcn (+ cva variants in place)
  components/          shared custom: KeyCap, KeyboardGrid, Monogram
  hooks/               useKeymap, usePlatform, …
  assets/              theme.css, fonts/
  locales/             en.yml (@wxt-dev/i18n source; generates _locales + typed keys)
public/icon/           16/32/48/128 PNGs (v1's icons until item 20)
e2e/                   Playwright specs + fixture pages
```

### 11.2 Boundary
- `src/domain/` imports nothing from `chrome`, `#imports`, `wxt/*`, React or `platform/`. A Biome `noRestrictedImports` rule enforces this.
- Side effects follow **pure plan → thin executor**. Examples: `planOpen(shortcut, {currentTab, tabs, force}) → OpenPlan`; `planAssign` (conflict / replace / move + undo record); `migrateV1`.

### 11.3 Who writes the keymap
- **Options** reads and writes through `platform/keymap-store` directly.
- **Assign with undo** (popup and the free-key toast) goes **only through the background**: `assignPage{key, tabId?, openMode?, resolve?: 'replace'|'move'}` and `undo{id}`. The popup's key card edits only through `editShortcut{key, tabId, op}`, `op` being `openMode`, `remove`, `move{to, resolve?: 'replace'}` or `exactPage`; the background reads the keymap and the tab's URL fresh, writes the undo record for Remove and Move, and toasts the tab after a Move. The popup still never writes the keymap. A content script's own tab (sender.tab) is always the one assigned and it sends no `tabId`; the popup names its tab, and an extension page's own tab (the popup opened in a tab) never counts. The background writes the undo record to `storage.session`, which content scripts can't see.
- The **content script** only reads `sync`.
- The **overlay** gets its model from the background (`getOverlayModel`).

### 11.4 Messaging
One typed protocol in `platform/messaging.ts` on `@webext-core/messaging`. No ad-hoc `runtime.sendMessage`.
- content → bg: `openKey{key, force}`, `assignPage`, `undo{id}`, `openOptions{key?}`, `getOverlayModel`, `frameEvent{kind: 'show'|'close'|'pin'}`
- popup → bg: `assignPage`, `editShortcut{key, tabId, op}`, `undo{id}`, `openOptions`, and on a restricted page `openKey{key, force, tabId}` and `getOverlayModel{tabId}`. A content script's own tab (sender.tab) always wins and it sends no `tabId`; the popup names the active tab it reads.
- options, welcome → bg: `tryKey{key, force?}`, `openOptions{key?}`
- bg → tab (`frameId: 0`): `ping`, `overlay{action: 'toggle'}`, `toast{kind: 'saved'|'free'|'switched'|'error', …}`, `frameEvent`
- Every bg → tab send goes through one `sendToTab` helper: ping → inject → retry once.

### 11.5 UI state
- No state library.
- `useKeymap()` over `storage.watch`; local `useState`/`useReducer` for drafts, selection and search; `useAutosave` for the debounced save.
- The overlay state machine `closed → arming → peek → pinned` is a pure reducer, tested without a DOM.

### 11.6 Tooling, tests, CI
- Biome 2 for lint + format (a11y, hooks, restricted imports).
- TS `strict` + `noUncheckedIndexedAccess`; types checked via `wxt prepare && tsc --noEmit`.
- i18n via `@wxt-dev/i18n`.
- Scripts: `dev`, `build`, `zip`, `check`, `test`, `e2e`, `format`.
- Unit tests are colocated (Vitest). Domain tests use no fakes; `platform/` tests use `WxtVitest` + `fakeBrowser`.
- **e2e**: Playwright, full Chromium (`channel: 'chromium'`), local fixture pages via `webServer`. The extension ID comes from the service-worker URL. Content-script exceptions are caught via CDP `Runtime.exceptionThrown`.
- e2e flows:
  - ⌥+key opens or switches;
  - Peek and Pinned overlay;
  - popup assign + Undo;
  - ⌥ + free key → toast → assign;
  - Options edit and swap;
  - v1 migration.
- What Playwright can't drive (commands, real Windows Alt) goes to the manual QA checklist.
- CI (GitHub Actions on PR and push to `main`): `install --frozen-lockfile` → `check` → `test` → `build` → `e2e`. Browsers are cached; the report is uploaded on failure.

### 11.7 AGENTS.md (`CLAUDE.md` symlinks to it)
1. The commands.
2. The layout and the boundary rule.
3. Where the domain language lives: `GLOSSARY.md`, `docs/adr/`, `docs/product-spec.md`.
4. UI rules: shadcn via `pnpm dlx shadcn add`, `cva` variants in place, no arbitrary Tailwind values, tokens only from `theme.css`, and no Sonner, Radix portals or focus traps in the HUD (with the reason).
5. Every user-facing string goes through i18n, every trigger string through the platform helper.
6. TDD from the behavior list.
7. Messages only through `platform/messaging.ts`.
8. Conventional Commits.
↳ rebuild map: issues/07-repo-architecture.md (repo architecture), issues/04-wxt-shadcn-setup.md (WXT + shadcn setup)

---

## 12. UI: theme and components

### 12.1 Theme
One `theme.css` is shared by Options, Popup, Welcome and the HUD. In the shadow root, WXT rewrites `:root` → `:host`. Light only.

**shadcn variables** (set directly to the canvas hex values)
- `background` #F3F4F7 · `foreground` #1A1C1E · `card`/`popover` #FFFFFF
- `muted` #F7F8FA · `muted-foreground` #5B6070 · `secondary` #E6E8ED
- `primary` #0066FF / #FFFFFF · `accent` #E5EEFF / #0050CC
- `border` #E1E3E9 · `input` #D5D8E0 · `ring` #0066FF · `destructive` #A2271F

**Own groups**
- `success`: #1F9D55 / text #17763F / tile #F2FAF5, #BFE3CC
- `warning`: #FFF4E8 / #F2C998 / #7A4100 (button #E0B47F, drag #D98A2B)
- `highlight`: #F1ECF6 / #6A5480 / #D8CBE4
- `inverse`: #1A1C1E, toast link #8FB6FF
- `link`: #0050CC, hover #003A99
- Neutrals: `foreground-subtle` #3E4250 (a key's name line) · `border-subtle` #EDEEF2 · `border-strong` #C9CDD8 · `edge-primary` #0047B3 (the edge under a blue key, `shadow-edge-primary`)
- Tiles: `tile-red` #B3261E · `tile-amber` #A2540A · `tile-blue` #1A56DB · `tile-teal` #0E6E8C · `tile-slate` #3E4250 · `tile-purple` #7A3EB1 · `tile-indigo` #4B55C4 · `tile-green` #0B7A53, the same in every theme. A test checks that each has a token and that white on it is at least 4.5:1.
- Near-primary tints are alpha forms of `primary`, not tokens: `primary/3`, `/4`, `/7`, `/20`, `/30`, `/40`.

Key-state colors live inside `KeyCap`.

**Scale**: snap to the token scale (±2 px). **No arbitrary values.**
- Radius: `--radius: 10px` → sm 6 · md 8 · lg 10 · xl 14, plus `2xl` 20 and 12 for keys. The canvas's 9, 16 and 22 snap to 10, 14 and 20.
- Type: Tailwind defaults plus `3xs` 10 · `2xs` 11 · `ui` 13 · `md` 15.
- Spacing: stock.

**Focus, font, icons**
- Focus: shadcn's ring with `--ring` = primary.
- **Font**: self-hosted Inter (a latin-subset variable woff2, never Google Fonts). In the HUD it is declared on the host document as `"SpeedLink Inter"`; the file is in `web_accessible_resources` with `use_dynamic_url: true`.
- Icons: `lucide-react`.

### 12.2 Components
**Stock shadcn**, with `cva` variants added in place
- `Button` + `inverse`, `warning-outline`, `destructive-outline`, `size="icon"` + `Tooltip`
- `Badge` + `highlight`, `accent`
- `Alert` + `warning`
- `Kbd` (2 px bottom border)
- `Input`, `Label`/`Field`, `InputGroup`, `ToggleGroup`, `RadioGroup` choice cards, `Checkbox`, `Select`, `Card`, `Table`, `Tooltip`
- `Sonner`, on extension pages only
- `Sidebar` is not used.
- `cn` comes from the `cn` npm package (shadcn's registry imports it; there is no `lib/utils`). `shadcn init` fails on WXT, so `components.json` and tsconfig `paths` are hand-written.

**Custom**
- `KeyCap`: `size` lg 76×64 / compact 56×52 / xl 44 / md 40 / sm 28×26 × `state` free / assigned / selected / drop-target / reserved / taken / picked / start / plain, plus an `open` flag and the `shortcut` it holds.
  - lg: the label top left, a 20 px monogram tile top right, the name on a bottom line (11/500, ellipsized), the open dot on the outer top-right corner (10 px, white ring). Compact: the label, a 16 px tile and the outer dot, no name line. sm, xl, md: the label only, the open dot inside.
  - `start` ("Start here"): 2 px dashed primary on `primary/4`, with the label. `plain`: a white keycap for overlay tiles, no blue tint and no dot.
  - Reserved (lock), drop target (↔), taken and dimmed keep their colours at every size. On a selected key the tile keeps its colour with a 1 px white ring. Accessible names are the same at every size; the tile, name line and dot are hidden from assistive tech.
- `KeyboardGrid` (lg / compact / sm, no modifier row): row stagger 0/28/46/74 px (lg), 0/20/34/54 (compact), 0/10/16/26 (sm). Arrow-key drag uses the lg fractions of a key width.
- `Monogram`: a square tile with one white letter, coloured `--tile-<hue>` by the shortcut's site, wherever a shortcut is drawn. No favicon anywhere.
- The picked-key drop zone, the "Saved" indicator, drag-to-swap via dnd-kit.

### 12.3 HUD constraints (from the spike)
- `cssInjectionMode: 'ui'`, `createShadowRootUi({ position: 'modal', isolateEvents: true })`.
- PostCSS: rem→px (rootValue 16), then rename `--tw-` → `--sl-tw-`, because `@property` rules leak into the host `<head>`.
- In `onMount`: the container gets `z-index: 2147483647` (WXT's `zIndex` option is a no-op) and `pointer-events: none`; only the open overlay and the toast region get `pointer-events: auto`.
- A synchronous capture-phase key guard on `window` stops events whose `composedPath()` contains our host.
- **No Sonner** (it crashes the content script at `document_start`), **no Radix portals, dialogs, popovers or focus traps**.
- The overlay is our own non-modal `div role="dialog"` + scrim, with cmdk `Command` inline for the filter. `OverlayTile` is built on KeyCap md; `PageToast` is custom.
↳ rebuild map: issues/08-theme-and-components.md (theme and components), issues/12-hud-shadow-dom-spike.md (HUD spike)

---

## 13. Manifest

- `version: "4.1.1"`; `minimum_chrome_version: "121"`, set by `Tab.lastAccessed` (Smart switch, §4.1). Other APIs used are lower (`storage.session` 102, `runtime.getContexts` 116). No `key` field.
- `permissions: storage, tabs, scripting`; `host_permissions: ["<all_urls>"]`.
- Content script `<all_urls>`, `all_frames: true`, `run_at: document_start`.
- Icons: the 16/32/48/128 PNGs drawn from the `Brand` logo mark by `pnpm listing`, at the same paths as v1's. The 128 px icon is 96 px of artwork inside 16 px of transparent padding.
- `web_accessible_resources`: the Inter woff2, `use_dynamic_url: true`.
- Commands: `toggle-overlay` (suggested Alt+S), `_execute_action` (no suggested key).
- Nothing beyond this list. A permission that adds a new install warning compared with v1 is a **release blocker**: drop it rather than disable v1 users.
↳ rebuild map: issues/10-release-plan.md (release plan), issues/13-keyboard-capture.md (keyboard capture)

---

## 14. Release

**Versions**
- 4.0.0, then a no-op **4.0.1** (version bump only, built together) to bind Alt+S.
- 4.0.1 is submitted once 4.0.0 is published and confirmed on the author's install.
- **4.2.0**: the redesign, a minor release without a migration. The manifest changes only in its version (§13); the listing texts and images are updated (below).

**Permission check**
- Before publishing: a local CRX → CRX update (packed 1.6, then 4.0.0, one `.pem`).
- The extension must stay enabled with no prompt.

**Rollout**
- Partial rollout is unavailable (<10k users). Use **deferred publish** at 100%: submit for review, then publish by hand.
- Safety net: CWS **Rollback** to 1.6. Migration leaves `speedlink` untouched, so 1.6 resumes as before.

**Publishing**
- `release.yml`, triggered by a `v*` tag: check/test/build/e2e → `wxt zip` → GitHub Release with the zip → `wxt submit` (CWS API v2 via `CHROME_API_VERSION=v2`, submit for review, **no auto-publish**: deferred publish is `CHROME_PUBLISH_TYPE=STAGED_PUBLISH`).
- Credentials live in the GitHub Environment `chrome-web-store` (tag rule `v*` only): one secret, the service-account private key, and three variables: the service-account client email, the publisher ID and the extension ID. The repo is public, so these Environment features work on GitHub Free.
- Prerequisite: a Google Cloud project + a service account linked to the CWS developer account. Fallback: a manual zip upload. Where everything lives, the dry run, key rotation and the fallback: `docs/publishing.md`.

**Listing**
- New English summary and description, worded from the glossary.
- Five captioned screenshots at 1280×800, drawn by `pnpm listing` from the real build on a demo keymap and a neutral backdrop page, each with a big headline and a short sub: Hero, Smart switch, Peek, Assign, Keymap.
  - Hero and Smart switch are templates drawn from the real components (keycaps, overlay tiles, monograms): the ⌥ / Alt + G chord over six tiles, open sites green; one tab strip before and after ⌥ / Alt + G, the same tabs with GitHub in front.
  - Peek, Assign and Keymap are a caption over a clean frame: a real capture (the Peek with ⌥ held, the popup under the toolbar icon, the key editor open on a key) in a template browser mock that is plainly not Chrome. Captures read "Alt" (Windows); captions say "⌥ / Alt" or "⌥ (Alt)". The landing page reuses the clean frames without captions.
- A small promo tile 440×280 ("Put your sites on keys." with the ⌥ / Alt + G chord), a marquee 1400×560 (the headline, the sub and six tiles, G highlighted) and the landing page's social card 1200×630 in the marquee style, drawn by the same command. The saved-toast and pinned-overlay shots are dropped; the demo loop only feeds the README's GIF. The Store assets and every listing text live in `store/` (`listing.md`).
- Privacy tab: single purpose; justifications for `tabs`, `scripting`, `storage` and `<all_urls>`; data "not collected".
- The landing page, `site/index.html` on GitHub Pages (the listing's Homepage URL): one static page, its styles and a small script inline, local Inter, nothing loaded from another site, light and dark. Its hero is a live try-it demo of Smart switch on the demo keymap (click a key: an open site's tab comes to the front, a closed one opens in a new tab; Reset), with "On your phone? Copy the link" for visitors who can't install. Below it: How it works, Peek, Assign and Keymap on the clean frames, the four open modes, a trust strip, an FAQ answered from §4.2, §13 and §1, and a closing Add to Chrome. No rating or user-count line. Its media are the clean frames and the social card.
- A short privacy policy page, `site/privacy/index.html`, published on GitHub Pages at `https://itigancov.github.io/speedlink/privacy/`. Support and the policy's contact are GitHub Issues; no email is published.

**Manual QA** (`docs/release-checklist.md`; which checks a release runs: #1, #3 by hand and #8 only when it changes the v1 migration or the storage schema, #4 was 4.0.1 only, #2's Store part only when the manifest changed, the rest at RC. For 4.2.0: #2 (automated), #5, #6, #7, #9, #10)
1. Real Store update 1.6 → 4.0: keymap migrated, S moved, `speedlink` untouched, report in the service-worker console.
2. No re-consent (local CRX test and Store update).
3. The welcome page opens on the update from 1.x.
4. Alt+S is bound after 4.0.1 and the Options hint disappears.
5. ⌥S on restricted pages opens Options.
6. Windows: ⋮ is not focused after a Peek; a bare Alt tap stays native. Needs Windows; otherwise it is marked unverified and the risk is accepted explicitly.
7. macOS: no dead-key leftover after a suppressed ⌥E.
8. Second device: late-arriving sync data, and the migration catches up.
9. Smoke test of all 4 open modes on live sites.
10. Visual pass: every redesigned surface (Options keyboard, first run, narrow window, key editor dialog and List; Popup picker, Show keyboard, key card and launcher; Peek and the pinned overlay; toasts and welcome) in light and dark, matching its canvas board, nothing clipped, no unreadable contrast. The Windows half needs Windows; otherwise it is marked unverified and the risk is accepted explicitly, as in #6.
↳ rebuild map: issues/10-release-plan.md (release plan)
