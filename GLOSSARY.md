# SpeedLink

A browser extension that puts web pages on keys: holding ⌥ (Alt) and pressing a key opens or switches to that key's page.

## Keys

**Key**:
One of the assignable physical keyboard keys (letters A–Z and digits 0–9, by physical position, regardless of layout), named by its label such as `Y` or `1`. A key is a shortcut's identity.
_Avoid_: slot, hotkey, binding

**Trigger**:
The single, fixed modifier ⌥ Option (Alt on other platforms) held together with a key.
_Avoid_: shift option, modifier setting

**Reserved key**:
A key that can never hold a shortcut because SpeedLink itself uses it. In 4.0 that is `S`, so 35 keys are assignable.

**Free key**:
An assignable key that holds no shortcut.
_Avoid_: empty key, unassigned slot

**Fitting key**:
A free key suggested for a page because its letter comes from the page's site or name.
_Avoid_: suggested slot, recommended key

## Shortcuts

**Shortcut**:
What a key holds: a link plus how to open it (name, open mode, tab match, close current).
_Avoid_: binding, bookmark, command, link (for the whole thing)

**Keymap**:
All of a user's shortcuts, one per key at most.
_Avoid_: profile, shortcut list

**Link**:
The web address (http or https) a shortcut opens.
_Avoid_: URL (in user-facing copy), target

**Name**:
The optional label of a shortcut shown in the overlay and keymap. Without one, the link's site is shown.
_Avoid_: title

**Monogram**:
The one- or two-letter mark drawn for a shortcut, taken from its name or else its site.

## Opening

**Open mode**:
How pressing a shortcut's key opens its link: Smart switch, New tab, This tab or Background tab.
_Avoid_: behavior, post action, smart tabs

**Smart switch**:
The open mode that switches to an already-open matching tab, and opens a new tab only when none matches. The default.

**Tab match**:
What makes an open tab count as "already open" for Smart switch: *exact* (the same full link), *page* (the same page, ignoring query and anchor) or *site* (the same site; `www.` aside, subdomains and ports are different sites).
_Avoid_: match mode, URL matching

**Close current**:
A shortcut option that closes the tab the key was pressed on after the link is opened.
_Avoid_: close & jump

**Open now**:
A shortcut whose link is currently shown in some tab, by its tab match. Derived from tabs, never stored.
_Avoid_: active, running

**Force new tab**:
Holding ⇧ as well as ⌥ when pressing a key: opens the shortcut's link in a new tab this once, whatever its open mode.
_Avoid_: shift option, shift variant

## Overlay

**Overlay**:
The on-page cheat sheet of the keymap, drawn over the current page.
_Avoid_: HUD (in user-facing copy), cheat-sheet popup, command palette

**Peek**:
The overlay while ⌥ is held: it appears after ⌥ is held alone for a moment, a key opens its shortcut, and releasing ⌥ closes it. No search.

**Pinned overlay**:
The overlay opened with ⌥S (or pinned with S during a peek): it stays open after ⌥ is released, typing searches names and links, and Esc closes it.
_Avoid_: sticky mode, search mode

**Page toast**:
A short message at the bottom of the current page about a key: that it is free, that a page was just saved on it (with Undo), that Smart switch moved to an open tab, or that a save or an Undo didn't happen. One shows at a time.
_Avoid_: notification, snackbar
