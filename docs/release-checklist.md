# Release checklist

Manual checks to run before every major or minor release (product spec §14, "Manual QA"). Each check says what passes, how to run it and when it has to be re-run. This page has only check #2 so far; item 21 adds the rest.

## 2. No re-consent

**What it protects.** 4.0 reaches v1 users as an update to the existing Store item. If the new manifest adds a permission *warning* that 1.6 didn't have, Chrome disables SpeedLink on update until the user approves, and most users never will. The fix for a new warning is always to drop the permission. Disabling v1 users is never accepted.

The check has two parts:

- **Local CRX test** (below): Chromium's real update path, run whenever the manifest changes.
- **Store update**: the real 1.6 → 4.0 update from the Web Store in Chrome Stable on the author's install, run with check #1 at release time.

### When to re-run the local test

Whenever a change touches the manifest in a way that makes `e2e/manifest.spec.ts` fail (the spec pins the built manifest to product spec §13). Changes to permissions, host permissions, content-script matches or frames, and web-accessible resources always count. The last recorded result is in the backlog item `09-permission-check`.

### Why this setup

- **Chromium, not Chrome.** Chrome Stable on macOS won't install a CRX that doesn't come from the Store unless a device-management policy allows it (`ExtensionInstallAllowlist` + `ExtensionInstallSources`). A Chromium snapshot still allows drag-and-drop installs. The warning logic is shared Chromium code.
- **The real update path.** Reloading an unpacked folder skips permission-increase handling. A signed CRX with an `update_url` plus **Update** on `chrome://extensions` runs the silent-update path that disables an extension whose update adds a warning.
- **One key.** Every version is signed with the same key, so they share one extension ID and Chromium treats each one as an update. That ID isn't the Store ID, which doesn't matter: Chromium compares two versions of the same ID.
- **A negative control.** A final update adds a permission known to warn. If Chromium doesn't disable *that* one, the setup is broken and the clean result doesn't count.

### Prerequisites

- A Chromium snapshot for the machine (<https://www.chromium.org/getting-involved/download-chromium/>; Apple Silicon: the `Mac_Arm` snapshots). On macOS, clear the quarantine flag after unzipping: `xattr -cr Chromium.app`.
- Node.js.
- GoogleChromeLabs [extension-update-testing-tool](https://github.com/GoogleChromeLabs/extension-update-testing-tool) at commit `573e9fd489b9ea40cd467c909a712a1cb09e2156`, cloned into a work directory **outside this repo**, with `npm ci` run in it.
- The v1 source: the `SpeedLink_1.0` repo at `964e891` (the 1.6 that shipped). Its lockfile is v6, so it needs pnpm 8.

Below, `$W` is that work directory.

### Packages

Each package is a zip with `manifest.json` at its root.

1. **1.6**: `git worktree add --detach $W/speedlink-1.6 964e891` from the `SpeedLink_1.0` repo, then in it `npx pnpm@8.15.9 install --frozen-lockfile --ignore-scripts` and `npx pnpm@8.15.9 exec vite build`. Zip the contents of `dist/`. Check that `dist/manifest.json` is byte-identical to `public/manifest.json` at `964e891`. If the old project no longer builds, use a stub instead: the exact 1.6 manifest plus placeholder files for everything it references, and write "stub" in the record.
2. **4.0.x**: `pnpm build` at a committed SHA in this repo, then zip the contents of `.output/chrome-mv3/`. Note the SHA.
3. **Control**: a copy of the 4.0 output with `history` appended to `permissions` and `version` bumped one patch higher (4.0.0 → 4.0.1). Never committed.

Optional pre-check: `chrome.management.getPermissionWarningsByManifest` on the three manifests should give the same list for 1.6 and 4.0, plus one extra line for the control. This is only a hint. The verdict comes from the run below.

### Run

1. In `$W/tool`, start the server with `WRITE_KEY=1 npm start`. It listens on `http://localhost:8080`, and `WRITE_KEY=1` keeps the signing key in `key.pem` so the ID stays the same across restarts. The server only serves the version uploaded **last**, so upload the packages one at a time, in this order. Upload each one **once**: the tool clears its `tmp/` before checking the version, so a rejected upload ("Please increase the version field") deletes the CRX it was serving, and **Update** then fetches nothing while `updates.xml` still offers the new version (`/extension.crx` returns 404). If that happens, restart the server (the key in `key.pem` keeps the ID) and upload that package again.
2. Start Chromium with a throwaway profile: `Chromium.app/Contents/MacOS/Chromium --user-data-dir=$W/profile --no-first-run --no-default-browser-check`. Open `chrome://extensions` and turn on **Developer mode**.
3. **Install 1.6.** Upload the 1.6 zip on `http://localhost:8080` (drag-and-drop, or `curl -H 'Content-Type: application/zip' --data-binary @speedlink-1.6.zip http://localhost:8080/upload/zip`). Download `http://localhost:8080/extension.crx` and drag the file onto `chrome://extensions`, then accept the install prompt.
4. **Before.** Under **Details**, write down the version, the ID and the **Permissions** list.
5. **Seed data.** In 1.6, assign 3–4 shortcuts to ordinary sites, one of them on S (assignable in 1.6, reserved in 4.0, so migration has to move it).
6. **Update to 4.0.** Upload the 4.0 zip, then click **Update** at the top of `chrome://extensions`.7. **Check 4.0.** It passes only if all of these hold:
   - the card shows the 4.0 version with the toggle on;
   - there is no permission prompt and no "needs your approval" / re-enable banner on the card or in the toolbar menu;
   - **Inspect views** shows a service-worker link and there's no **Errors** button. "(inactive)" alone is fine: an idle MV3 worker stops after about 30 seconds, and clicking the link wakes it.

   Under **Details**, write down the permission list after the update.
8. **Migration look (observation only).** Open SpeedLink's Options and note whether the 1.6 shortcuts are there and where S went. This doesn't affect the verdict. Problems go to the v1 migration work. ⌥S (Alt+S) left unbound after this update is expected (4.0.1 fixes it).
9. **Control.** Upload the control zip and click **Update**. Chromium must disable the extension and ask to approve the history permission: the card shows the control's version with the toggle off, and the toolbar shows **Action Required**. Write down what it shows.

### Verdict

- **Pass**: step 7 holds **and** step 9 disables the control with a prompt.
- **Void**: step 9 doesn't disable the control. The setup didn't exercise the update path (wrong browser, wrong ID, or the update never ran). Fix the setup and run again.
- **Fail**: step 7 shows any prompt, banner or disabled state while the control behaves correctly. This is a release blocker. Stop, record it, and reopen the Permissions decision in the release plan. The direction is fixed: drop the permission that adds the warning.

### Record

Add the result to the backlog item: date, Chromium version (`chrome://version`), tool commit, 1.6 source (build or stub), 4.0 SHA, the permission lists before and after, the verdict for 4.0 and for the control, and the migration note.
