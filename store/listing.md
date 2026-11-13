# Web Store listing texts

Every text the Developer Dashboard asks for, ready to paste (item 22 does the pasting). Images: `01`–`05` are the screenshots (1280×800), `promo-tile.png` the small promo tile (440×280). `pnpm listing` redraws them and the extension icons from the build; the texts are edited here, by hand.

## Store listing tab

### Summary

Quotes `extDescription` in `src/locales/en.yml`, which is the manifest description (the Store reads it from there). 132 characters at most; `e2e/manifest.spec.ts` checks it.

```
Put your sites on keys. Hold ⌥ (Alt) and press a key to open a site or jump to its tab.
```

### Description (English)

```
Put your favourite sites on keys. Hold ⌥ (Alt) and press a key: SpeedLink opens that key's site, or switches to the tab where it is already open.

HOW IT WORKS
• Every letter and digit can hold a shortcut: a link, with a name and a way to open it.
• The trigger is ⌥ Option on a Mac and Alt on Windows, Linux and ChromeOS. Hold it and press a key, on any page.
• Smart switch, the default, jumps to a tab that already shows the site and opens a new one only when none does. You can also choose New tab, This tab or Background tab for each shortcut, and decide what counts as "already open": the exact link, the same page, or the same site.
• Hold ⇧ as well to open a shortcut in a new tab this once.

SEE YOUR KEYS
• Peek: hold ⌥ for a moment and your keys appear over the page. Press one to go, or let go to close.
• Pinned overlay: press ⌥S, or S during a Peek, to keep it open and search your shortcuts by name or link.
• A dot marks the shortcuts whose site is open right now.

PUT A PAGE ON A KEY
• Click the toolbar icon to assign the page you are on. SpeedLink suggests free keys that fit the site's name, and a toast on the page offers Undo.
• The Options page shows your keymap as a keyboard: edit a shortcut, drag one key onto another to swap, or search with "/".

COMING FROM SPEEDLINK 1?
Your keys come over on update. Nothing to export or set up again.

PRIVATE BY DESIGN
Your keymap lives in your browser and syncs through Chrome's own sync when it is on. SpeedLink collects no data, makes no network requests and has no analytics.
```

### Category and language

Productivity. English.

### URLs

| Field | Value |
|---|---|
| Privacy policy | https://itigancov.github.io/speedlink/privacy/ |
| Support | https://github.com/itigancov/speedlink/issues |
| Homepage | Left for item 22: the repo (https://github.com/itigancov/speedlink) or empty until the landing page (item 24) exists |

There is no contact email: Support and the policy's contact are GitHub Issues.

## Privacy tab

### Single purpose

```
Open websites with ⌥ (Alt) + key shortcuts.
```

### Permission justifications

Each is checked against the code that uses the permission.

**`tabs`**
```
SpeedLink reads the address and title of open tabs to switch to a tab that already shows a shortcut's site instead of opening a duplicate, to mark which shortcuts are open now, and to fill in the page the user is assigning to a key from the toolbar popup. This is only read in memory, never stored or sent anywhere.
```

**`scripting`**
```
When the extension is installed or updated, Chrome does not run its content script in tabs that are already open. SpeedLink injects the same key listener into them with chrome.scripting.executeScript, so shortcuts work straight away without reloading every tab.
```

**`storage`**
```
The user's keymap (each key's link, name and open settings) is kept in chrome.storage.sync, so it follows the user across their own devices through Chrome Sync. A short-lived record for the Undo button is kept in chrome.storage.session. Nothing else is stored.
```

**Host permission (`<all_urls>`)**
```
The shortcut keys, and the overlay that lists them, must work on whatever page the user is on when they press the trigger. SpeedLink therefore runs a small content script on all pages. It only listens for ⌥ (Alt) and the key pressed with it, and draws the overlay and toasts. It does not read or change page content, and sends nothing off the page.
```

### Remote code

No, SpeedLink does not use remote code.

### Data usage

Collected data types: none of them are collected, so every box is left unticked ("not collected").

Certifications, all ticked:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.
