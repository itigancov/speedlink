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
| `name` | string? | none | without a name, the link's site is shown |
| `openMode` | `smart` \| `new` \| `this` \| `bg` | `smart` | Smart switch / New tab / This tab / Background tab |
| `tabMatch` | `exact` \| `page` \| `site` | `site` | always stored, used only by `smart` |
| `closeCurrent` | boolean | `false` | ignored, and its checkbox disabled, when `openMode = this` |

No timestamps, `canEdit`, `groupId` or stored favicon. The favicon is read live from the tab and never fetched from Google s2.

- **Monogram**: built from the name, else the site. Two or more words → the initials of the first two; one word → its first two characters; uppercased.
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

### 3.1 Schema (schemaVersion 1)
| Area | Item | Value |
|---|---|---|
| `sync` | `key.<K>` (e.g. `key.Y`, `key.1`), one per occupied key | `{ link, name?, openMode, tabMatch, closeCurrent }` |
| `sync` | `meta` | `{ schemaVersion: 1, v1Imported?: true }` |
| `session` | `undo` | `{ id, expiresAt, keys: { <K>: Shortcut \| null }, written: { <K>: Shortcut \| null } }` |

- A free key has no `key.<K>` item. There is no `settings` item; a future setting becomes its own item, defaulted on read.
- Item names never collide with v1's (`speedlink`, legacy `shortcuts`), so v1 data stays alongside.
- Per-key items keep each shortcut under the 8 KB item cap. A swap is one `set` of two items. Sync is last-writer-wins per item, so edits to different keys on different devices don't clobber each other.
- Options autosave is debounced (~400 ms) to stay under 120 writes/min.

### 3.2 Rules
- **Write strict**: an invalid shortcut is never written; the UI shows the error.
- **Read tolerant**: invalid items are skipped (the key looks free) and **not deleted**; missing fields take their defaults; unknown fields survive a rewrite. Only migrations rewrite stored data.
- **Migrations** run in the background on install, update and startup, keyed on `meta.schemaVersion`.
- All surfaces see live keymap changes, including remote sync changes.

### 3.3 Undo record
- Holds `{ id, expiresAt, keys, written }` in `storage.session` for up to 60 s. Undo is offered while the saved toast is visible and applies only when every touched key still holds what the assign wrote (all or nothing); otherwise nothing changes.
- `keys` is the previous contents of every touched key (null = free), `written` what the assign put there. `id` is fresh per assign, and every assign replaces the record, so an older toast's Undo is refused.
- It is created **only** by an assign from the popup or from the page toast, so an Undo after Replace or Move restores the old shortcut too.
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
UI (overlay, toasts) renders in the **top frame only**. A sub-frame sends `openKey` itself (its `sender.tab` is the tab); its own Peek (it runs its own hold timer) is relayed through the background to `frameId: 0` as `frameEvent{kind: 'show'|'close'}`, and it consumes the Windows Alt keyup itself.

### 4.5 Injection and lifecycle
- On `onInstalled` (install and update), inject into every open http(s) tab, all frames, skipping discarded tabs.
- Every background → tab send pings first, injects when there is no answer, and retries once.
- A double-mount guard prevents a second copy of the script.
- On every event the script checks `chrome.runtime?.id`. When its context is dead it tears down its listeners and UI.
- The orphaned v1.6 script is left alone.

### 4.6 Where ⌥+key does not work
⌥+key does nothing on restricted pages (chrome://, the NTP, the Web Store, the PDF viewer, view-source) and on extension pages (Options, welcome, popup). It also does nothing while focus is inside an `about:blank`, `srcdoc` or `data:` child frame (no `match_about_blank` / `match_origin_as_fallback`). Only ⌥S has a fallback there (§5.3).

### 4.7 Platform labels
- One synchronous helper decides Mac vs non-Mac from `navigator.userAgent` and is used by every surface.
- Mac: "⌥ Option", "⌥K …", modifier row `fn ⌃ ⌥ ⌘`.
- Windows/Linux/ChromeOS: "Alt", "Alt+K …", row `Ctrl · Alt (highlighted) · space · Alt · Ctrl`.
- Every trigger string goes through this helper and an i18n placeholder.
↳ rebuild map: issues/13-keyboard-capture.md (keyboard capture)

---

## 5. Overlay

### 5.1 Peek
- **Opening**: the timer starts on keydown of `AltLeft`/`AltRight` with no other modifier and not repeat. Any other keydown, mousedown, wheel, `blur`, `visibilitychange`, or ⌥ keyup before **400 ms** (fixed) cancels it. A quick ⌥+key never flashes the overlay.
- **In Peek**: key → open; ⇧+key → Force new tab; S → pin (§5.2); ⌥ release or Esc → close. There is no search.
  - A key or a tile click that opens closes the Peek: one hold opens one thing. Shift alone doesn't close it.
  - Ctrl, ⌘, and any key that isn't a SpeedLink key close it and pass through to the page; Esc is consumed.
  - Focus never leaves the page in a Peek: the overlay takes no focus, so nothing needs restoring.
- **Windows**: releasing Alt alone focuses Chrome's ⋮ menu. The Alt keyup is consumed **only after a Peek was shown**; a bare Alt tap keeps native behavior.

### 5.2 Pinned overlay
- **Opening**: ⌥S, or S during a Peek.
- **Behavior**:
  - It stays open after ⌥ is released.
  - Bare letters type into the search (§2.7); non-matching tiles are hidden, and the first visible tile is the top result.
  - ↵ opens the top result, using the real target via `composedPath`. Arrow keys move the highlight.
  - ⌥+key still opens.
  - Esc (one level) or a click outside closes it.
- No results → `No keys match "…"`.

### 5.3 ⌥S and commands
- `S` is reserved regardless of command bindings. The content script handles ⌥S itself wherever it runs.
- Command `toggle-overlay` (suggested `Alt+S`) covers the omnibox and restricted pages. Chrome swallows the S keydown, so the handler tells the tab to cancel the hold timer or pin the overlay.
- On a page that can't host the overlay, the command **opens Options on the keymap**, focusing an existing Options tab.
- `_execute_action` (popup) has **no suggested key**.
- An update from v1 leaves both commands unbound. Mitigation: Options shows the quiet line "Set ⌥S for pages where SpeedLink can't run", linking to `chrome://extensions/shortcuts`, while `commands.getAll()` reports no binding. A no-op 4.0.1 then assigns Alt+S (§14).

### 5.4 Content
- **Tiles**: one per assigned key, in keyboard order, 4 columns. Past 12 tiles the tile area scrolls inside the dialog (max ~70vh), up to 35. No profile label.
- **Tile**: keycap (md) + name (or site) + subline:
  - Smart switch would switch to a tab in this window (the current tab included) → "Open · tab N" (1-based position);
  - Smart switch would raise another window → "Open · other window" (green);
  - else Smart → site, New → "new tab", This → "this tab", Background → "background". Both "Open" sublines follow Smart switch's winner (§4.1), so other open modes show their mode even when the page is open.
- **Top row**: badge "⌥ held" + the search field "Press a key — or keep typing to search".
- **Footer legend**: key go · ⇧ + key force new tab · type search names & links · ⌥ release or Esc close · green dot "open now — will switch, not reopen".
- **Empty keymap**: "No keys yet" + an "Open keymap" link.
- **Mouse**: tile click opens, ⇧+click = Force new tab; both work in Peek too. A pencil on tile hover/focus opens Options `#key=K` (focusing an existing tab without reloading it) and closes the overlay.
- ⌥+free key while the overlay is open: the overlay closes and the "⌥K is free" toast appears.
- The overlay model (tiles, Open now, tab N, other window) comes from the background on open.
↳ rebuild map: issues/13-keyboard-capture.md (keyboard capture), issues/06-behavior-audit.md (behavior audit)

---

## 6. Page toasts and badge

Toasts render on the page, top frame only. Each is a dark pill: key chip + message + action link.

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

380 px wide.
- **Header**: logo + "SpeedLink" + an "Open keymap" icon link.
- **Footer tip**: "Tip: hold ⌥ on any page to see all keys".

**Page card**
- The favicon from the tab (monogram fallback), the tab title and the link.
- **Already on a key**: each shortcut is matched by its own tab match. The card says "Already on ⌥Y" (or "⌥Y, ⌥2"). Nothing is blocked: saving adds another key.

**Key picker**
- Label "Press a key to put this page on it".
- A picked-key drop zone ("⌥ +" + big keycap).
- "Free & fitting:" chips (§2.6, at most 4).
- A mini keyboard (picked / taken / free / reserved).
- **Default picked key**: the first chip, else the first free key in keyboard order.
- A physical key press in the popup (`event.code`, no ⌥) picks that key; ↵ saves.

**Opens as**: a `Select` with the 4 open modes. Tab match and close current are not in the popup. A new shortcut gets the defaults (smart / site / no close) plus the chosen open mode; it never inherits a replaced shortcut's settings.

**Primary button**: free key → "Save to ⌥K"; taken key → dark "Replace ⌥K".

**Conflict**
- A warning alert "⌥K already opens **Name**." with **Replace** and **Move it to ⌥X** (X per §2.6). Move is hidden when no key is free.
- Pick another = press another key.
- Replace and Move both write the undo record.

**Unusable page** (any non-http(s) or restricted page)
- The popup opens; the card says "This page can't be put on a key".
- The picker and Save are disabled; the keymap link still works.

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
There is no left nav: only Keymap is left.

**Header**
- Logo + "SpeedLink".
- A search field "Find a link, site or key…" with a `/` keycap.
- The hint "Hold **⌥ Option** anywhere to see your keys".

**Heading**
- "Keymap" + the subline "Press **⌥ + key** on any page to open its link. N of 35 keys in use."
- A view switch **Keyboard** (default) | **List**.

**Keyboard view**
- Keys: 4 staggered rows of 56 px keys plus a decorative modifier row (§4.7).
- Key states: free, assigned (monogram chip), open now (green dot), selected, drop target, reserved S (lock).
- A legend, plus "Drag a key onto another to swap".

**List view**
- Columns Key · Name · Link · Opens as ("· closes current" when set, never for This tab, where it is ignored).
- Only assigned keys, in keyboard order, with no sorting. A row click selects.
- The Key cell shows the open-now dot. Name falls back to the site, shown muted. The Link is truncated to one line, with the full link in a tooltip.
- Empty → "No keys yet — pick one in Keyboard view" (it wins over a query). A query that matches no assigned key, including one that matches only free keys, shows "No keys match".

### 8.2 Selection
- Exactly one key is always selected.
- `#key=K` selects K. It is used by the overlay pencil and by ⌥S on restricted pages. It is read on load and on `hashchange`; S is never selected.
- Otherwise the first assigned key in keyboard order is selected; with an empty keymap, the first free key.
- The selection is mirrored to `#key=K` with `history.replaceState`.

### 8.3 Inspector ("Key details")
**Header**
- A key tile.
- Title = the name (or site), or "Free key".
- Status line "⌥ Option + K · {open in a tab now | open mode label | paste a link to assign}".

**Link**
- Placeholder "Paste a link or type a site", plus a **Use current tab** icon button.
- Use current tab takes the most recently used (`lastAccessed`) http(s) tab in a normal, non-incognito window, never an extension page; the tooltip names its title. Without one, the button is disabled with the tooltip "No web page open".
- It fills Link, and Name if Name is empty (tab title).

**Name**: "— shown in the overlay", placeholder "Taken from the page title".

**When I press it**: 4 radio cards. Smart switch carries a "Recommended" badge. Copy per card:
- Smart switch: "Jump to the tab if it's already open, otherwise open it in a new tab."
- New tab: "Always open a fresh tab next to this one."
- This tab: "Replace the page you're looking at."
- Background tab: "Open quietly and stay where you are."

**Tab match** (shown only for Smart)
- Prompt: "Count a tab as "already open" when it shows".
- Choices: **This exact link** | **This page** | **Any page of the site**.
- Live hints:
  - exact: "Only a tab with exactly {link} is reused."
  - page: "Reuses a tab on {link}, ignoring ?query and #anchors."
  - site: "Reuses any tab on {site} — e.g. a video you left open."

**Close current**: the checkbox "Close the tab I'm on afterwards", disabled with This tab.

**Footer**: **Clear key** (destructive outline; no confirm, no undo) · the "Saved" indicator · **Try ⌥K** (primary).

### 8.4 Autosave and validation
- Changes save automatically, debounced ~400 ms.
- An invalid link → an inline error under the field. Nothing is written, the stored value stays the last valid one, and "Saved" is hidden.
- A free key becomes assigned only once its link is valid.
- Switching keys discards an unsaved invalid draft.
- Remote (sync) changes appear live.

### 8.5 Try ⌥K
- Opens the shortcut as if its key were pressed with Options as the current tab, but it never replaces or closes Options:
  - Smart → switch or new tab;
  - New / This → new tab;
  - Background → background tab;
  - close current ignored.
- Disabled on a free key.

### 8.6 `/` search
- `/` focuses the search and selects its text; it matches per §2.7. `/` is ignored in editable fields (inputs, textareas, contenteditable) and with ⌘, Ctrl or ⌥ held.
- Filtering is live on every keystroke. Keyboard view dims non-matching keys; List view hides non-matching rows.
- ↵ selects the exact key-label match first, otherwise the first match in keyboard order; in List view, the first visible row. It moves focus to Link and keeps the query. ↵ with no match does nothing.
- Esc clears the query; a second Esc on an empty field leaves it. Esc only applies while the search field has focus.
- Typing never changes the selection. The query is shared by both views, not persisted, and empty on load.
- No match → all keys dimmed / "No keys match".

### 8.7 Drag-to-swap
- Dropping onto an assigned key swaps; dropping onto a free key moves. `S` is never a target.
- It also works with the keyboard (dnd-kit keyboard sensor).
- The selection follows the dragged shortcut. No undo.
- Only keys that hold a shortcut can be dragged. A pointer drag starts after a 5 px move, so a click still selects.
- From the keyboard, Space picks up, the arrows jump key to key across the staggered rows (passing over `S`), Space or ↵ drops and Esc cancels. ↵ on a key that isn't being dragged still just selects it.
- Dropping a key on itself, or outside any key, changes nothing. Dimmed (search) keys stay targets.
- A valid pending draft is saved first and an invalid one is discarded, as on switching keys.
- "Saved" shows after the drop, as after an autosave. There is no toast.
- Screen-reader announcements (picked up, over a key with swap or move, dropped, cancelled) are localized and name keys with the platform trigger.

### 8.8 ⌥S hint
The "Set ⌥S" line, per §5.3.
↳ rebuild map: issues/06-behavior-audit.md (behavior audit), issues/08-theme-and-components.md (theme and components)

---

## 9. Welcome page

- An extension page. It opens on **fresh install** and on **update from 1.x** (`reason: 'update'`, `previousVersion` starting with `1.`). 4.x → 4.y updates open nothing.
- Content:
  - "Hold ⌥ and press a key to jump to a site";
  - three steps: put a page on a key (the icon, or ⌥ + a free key) → press ⌥ + key anywhere → hold ⌥ to see your keys;
  - a tip to pin the icon;
  - an "Open keymap" button.
- No Top Sites, no Default behavior step, no "Press ⌥Y now", no "What's new" variant.
↳ rebuild map: issues/06-behavior-audit.md (behavior audit), issues/10-release-plan.md (release plan)

---

## 10. Migration from v1

**Source**: the v1 `sync` item `speedlink` = `{shortcuts:[{canEdit,id,shortcut,title,url}], settings:{theme,useShift,postAction,smartTabs}}`. Missing settings take their effective 1.6 values: `smartTabs:false`, `postAction:"Jump to tab"`.

**Mapping** (into `key.<K>`)
- **Open mode** is the same for all of a user's shortcuts:
  - `smartTabs:true` → `smart`;
  - else by `postAction`: "Open in background" → `bg`, "Jump to tab" → `new`, "Close & Jump to tab" → `this`.
- `tabMatch: site`, `closeCurrent: false`.
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
- **Assign with undo** (popup and the free-key toast) goes **only through the background**: `assignPage{key, tabId?, openMode?, resolve?: 'replace'|'move'}` and `undo{id}`. A content script's own tab (sender.tab) is always the one assigned and it sends no `tabId`; the popup names its tab, and an extension page's own tab (the popup opened in a tab) never counts. The background writes the undo record to `storage.session`, which content scripts can't see.
- The **content script** only reads `sync`.
- The **overlay** gets its model from the background (`getOverlayModel`).

### 11.4 Messaging
One typed protocol in `platform/messaging.ts` on `@webext-core/messaging`. No ad-hoc `runtime.sendMessage`.
- content → bg: `openKey{key, force}`, `assignPage`, `undo{id}`, `openOptions{key?}`, `getOverlayModel`, `frameEvent{kind: 'show'|'close'}`
- popup → bg: `assignPage`, `openOptions`
- bg → tab (`frameId: 0`): `ping`, `overlay{action: 'toggle'|'pin'|'cancel-hold'}`, `toast{kind: 'saved'|'free'|'switched'|'error', …}`, `frameEvent`
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

Key-state colors live inside `KeyCap`.

**Scale**: snap to the token scale (±2 px). **No arbitrary values.**
- Radius: `--radius: 10px` → sm 6 · md 8 · lg 10 · xl 14, plus `2xl` 20 and 12 for keys.
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
- `Input`, `Label`/`Field`, `InputGroup`, `ToggleGroup`, `RadioGroup` choice cards, `Checkbox`, `Select`, `Card`, `Table`, square `Avatar`, `Tooltip`
- `Sonner`, on extension pages only
- `Sidebar` is not used.
- `cn` comes from the `cn` npm package (shadcn's registry imports it; there is no `lib/utils`). `shadcn init` fails on WXT, so `components.json` and tsconfig `paths` are hand-written.

**Custom**
- `KeyCap`: `size` lg 56 / xl 44 / md 40 / sm 28 × `state` free / assigned / selected / drop-target / reserved / taken / picked, plus an `open` flag; includes the monogram chip and the open dot.
- `KeyboardGrid` (lg / sm, row stagger, platform modifier row).
- `Monogram` (square `Avatar`; the favicon appears only on the popup page card).
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

- `version: "4.0.0"`; `minimum_chrome_version: "121"`, set by `Tab.lastAccessed` (Smart switch, §4.1). Other APIs used are lower (`storage.session` 102, `runtime.getContexts` 116). No `key` field.
- `permissions: storage, tabs, scripting`; `host_permissions: ["<all_urls>"]`.
- Content script `<all_urls>`, `all_frames: true`, `run_at: document_start`.
- Icons: v1's 16/32/48/128 PNGs (no regression; item 20 may replace them).
- `web_accessible_resources`: the Inter woff2, `use_dynamic_url: true`.
- Commands: `toggle-overlay` (suggested Alt+S), `_execute_action` (no suggested key).
- Nothing beyond this list. A permission that adds a new install warning compared with v1 is a **release blocker**: drop it rather than disable v1 users.
↳ rebuild map: issues/10-release-plan.md (release plan), issues/13-keyboard-capture.md (keyboard capture)

---

## 14. Release

**Versions**
- 4.0.0, then a no-op **4.0.1** (version bump only, built together) to bind Alt+S.
- 4.0.1 is submitted once 4.0.0 is published and confirmed on the author's install.

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
- 3–5 screenshots at 1280×800, captured by a Playwright script from the real build on fixture pages: Options keymap, popup assign, Peek overlay, toast.
- A small promo tile 440×280.
- Privacy tab: single purpose; justifications for `tabs`, `scripting`, `storage` and `<all_urls>`; data "not collected".
- A short privacy policy page hosted from the repo.

**Manual QA** (`docs/release-checklist.md`, run before every major or minor release)
1. Real Store update 1.6 → 4.0: keymap migrated, S moved, `speedlink` untouched, report in the service-worker console.
2. No re-consent (local CRX test and Store update).
3. The welcome page opens on the update from 1.x.
4. Alt+S is bound after 4.0.1 and the Options hint disappears.
5. ⌥S on restricted pages opens Options.
6. Windows: ⋮ is not focused after a Peek; a bare Alt tap stays native. Needs Windows; otherwise it is marked unverified and the risk is accepted explicitly.
7. macOS: no dead-key leftover after a suppressed ⌥E.
8. Second device: late-arriving sync data, and the migration catches up.
9. Smoke test of all 4 open modes on live sites.
↳ rebuild map: issues/10-release-plan.md (release plan)
