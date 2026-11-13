# Release checklist

The checks to run before every major or minor release (product spec §14, "Manual QA"). Each one says what it protects, when it runs, how to run it and what passes. Some are automated and only need their result read. The rest are done by hand.

**When a check runs.** There are three points:

- **RC**: on the release candidate, before the real tag. The candidate is a `v<version>-rc.N` tag on `main`. Its dry-run prerelease (see `docs/publishing.md`, "Releasing") holds the zip, and the zip is what gets checked. The real `v<version>` tag goes on the same commit. If the code changes after a candidate, that's `rc.N+1`: re-run the checks the change touches, plus #9 and the automated suite.
- **After publish**: on the author's own install, once the Store has served the update.
- **After 4.0.1**: only for the 4.0 release, once the no-op 4.0.1 is live.

| # | Check | When | How |
|---|---|---|---|
| 1 | Real Store update 1.6 → 4.0 | After publish | By hand |
| 2 | No re-consent | RC (automated), after publish (by hand) | `e2e/manifest.spec.ts`; local CRX test when it fails |
| 3 | Welcome on the update from 1.x | RC (automated), after publish (by hand) | `e2e/v1-update.spec.ts` |
| 4 | Alt+S bound after 4.0.1 | After 4.0.1 | By hand |
| 5 | ⌥S on restricted pages opens Options | RC | By hand |
| 6 | Windows: Alt after a Peek | RC | By hand, on Windows only |
| 7 | macOS: no dead-key leftover | RC | By hand |
| 8 | Second device: sync catches up | After publish | By hand |
| 9 | The four open modes on live sites | RC | `pnpm smoke:live` |

**Getting the candidate.** Download the zip from the prerelease and unzip it into an empty folder:

```bash
gh release download v<version>-rc.N -p '*.zip' -D <dir> && unzip -q <dir>/speedlink-<version>-chrome.zip -d <dir>/rc
```

For a check by hand, load `<dir>/rc` in Chrome Stable with **Load unpacked** on `chrome://extensions` (Developer mode), in a separate Chrome profile so the author's own Store install stays untouched. An unpacked load is a fresh install, so ⌥S (Alt+S) is bound and the welcome tab opens.

**Recording.** Each run gets a record (template at the end) in the backlog item of that release step.

## 1. Real Store update 1.6 → 4.0

**What it protects.** Every v1 user meets 4.0 through this update. The keymap has to come across, with the shortcut on S moved to a free key. The v1 data (`speedlink` in `storage.sync`) has to stay untouched, so a Rollback to 1.6 resumes as before.

**When.** After publish, on the author's install, together with #2 and #3. The same migration on the real 1.6 code also runs at RC in `e2e/v1-update.spec.ts`.

**How.**
1. Before publishing, on the author's 1.6 install: in the service-worker console (`chrome://extensions` → SpeedLink → **Inspect views**), run `chrome.storage.sync.get('speedlink')` and save the output. Note which key has S.
2. After the Store approves and the update is published: on `chrome://extensions`, turn on Developer mode and click **Update** (otherwise Chrome updates within a few hours).
3. Open the new service worker's console. The migration report is logged with `console.info`: what was migrated, what was skipped and why, where S went.
4. Open Options and compare the keymap with step 1.
5. Run `chrome.storage.sync.get('speedlink')` again.

**Pass.**
- Every 1.6 shortcut is in Options with its link. The one on S is on the key the report names.
- The report is in the console.
- `speedlink` is identical to step 1.

## 2. No re-consent

**What it protects.** 4.0 reaches v1 users as an update to the existing Store item. If the new manifest adds a permission *warning* that 1.6 didn't have, Chrome disables SpeedLink on update until the user approves, and most users never will. The fix for a new warning is always to drop the permission. Disabling v1 users is never accepted.

The check has two parts:

- **Local CRX test** (below): Chromium's real update path, run whenever the manifest changes.
- **Store update**: the real 1.6 → 4.0 update from the Web Store in Chrome Stable on the author's install, run with check #1 after publish. After the update, the card on `chrome://extensions` is on, with no "needs your approval" banner.

**When.** At RC the test `the manifest warns about exactly what 1.6 warns about` in `e2e/manifest.spec.ts` stands in for the local CRX test. It compares `chrome.management.getPermissionWarningsByManifest` for the built manifest and the shipped 1.6 manifest (`e2e/fixture-v1/`), with a `history` control that must change the list. While it passes, the last local CRX result still holds, because Chromium computes the warnings from the manifest alone. When it fails, the local CRX test below is due before release. The real CRX update path can't be automated: the install prompt is native UI, and a force-install by policy grants permissions without a prompt, which voids the test.

### When to re-run the local test

Whenever the warnings test above fails, or a change touches the manifest in a way that makes `e2e/manifest.spec.ts` fail (the spec pins the built manifest to product spec §13). Changes to permissions, host permissions, content-script matches or frames, and web-accessible resources always count. The last recorded result is in the backlog item `09-permission-check`.

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
6. **Update to 4.0.** Upload the 4.0 zip, then click **Update** at the top of `chrome://extensions`.
7. **Check 4.0.** It passes only if all of these hold:
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

## 3. The welcome page opens on the update from 1.x

**What it protects.** v1 users get no other sign that SpeedLink changed (product spec §9). The welcome tab opens once on the update from any 1.x version, and never on updates within 4.x.

**When.** RC: `e2e/v1-update.spec.ts` loads the shipped 1.6 build, sets its data through its own service worker and updates it in place to 4.0. It passes when exactly one welcome tab opens and the keymap migrates with S moved. It runs in `pnpm e2e` and so in CI on every candidate. After publish: watched on the author's install during #1.

**How (after publish).** Leave Chrome open during the update in #1, step 2.

**Pass.** One welcome tab opens, and only one.

## 4. Alt+S is bound after 4.0.1

**What it protects.** An update from v1 leaves both commands unbound, so ⌥S does nothing on restricted pages and in the omnibox (product spec §5.3). The no-op 4.0.1 is the attempt to make Chrome assign the suggested Alt+S.

**When.** After 4.0.1 is published, on the author's install. 4.0 release only.

**How.**
1. Update to 4.0.1 (**Update** on `chrome://extensions`).
2. Open `chrome://extensions/shortcuts` and find SpeedLink's overlay command.
3. Open Options.

**Pass.** The command shows Alt+S, and the Options line "Set ⌥S for pages where SpeedLink can't run" is gone. If Chrome leaves it unbound, the release still passes (accepted in the release plan): the Options line stays as the fallback, and the record says so.

## 5. ⌥S on restricted pages opens Options

**What it protects.** On pages where the content script can't run, ⌥S is the only key that does something (product spec §4.6, §5.3). Playwright can't press browser shortcuts, so this is checked by hand.

**When.** RC, on the candidate loaded unpacked.

**How.** Assign at least one shortcut. Then press ⌥S on each page:
1. `chrome://extensions`;
2. the New Tab page;
3. a Web Store page (`https://chromewebstore.google.com/`);
4. a PDF (any `https://…/….pdf` opens in the PDF viewer);
5. `view-source:https://example.com/`.

Then, with an Options tab already open, press ⌥S on one of those pages again.

**Pass.** Each press opens Options on the keymap. When Options is already open, that tab is focused instead of a second one opening.

## 6. Windows: Alt after a Peek

**What it protects.** On Windows, a released Alt focuses Chrome's ⋮ menu. After a Peek (holding ⌥ until the overlay shows) the menu must not take focus. A bare Alt tap must keep its native behavior (product spec §5.1).

**When.** RC, on Windows. Without a Windows machine or VM, the check is marked **unverified** and the risk is accepted explicitly in the record: who accepted it, the date, and the mitigation (the suppression rules are unit-tested; reports come through GitHub Issues; a confirmed bug gets a fix in a patch release, not a Rollback). Each release needs its own acceptance.

**How.** Load the candidate in Chrome on Windows. On an ordinary site:
1. Hold Alt until the overlay shows, then release it. Press ↓.
2. Tap Alt alone. Press ↓.

**Pass.** After step 1, ↓ scrolls the page and the ⋮ menu isn't focused. After step 2, the ⋮ menu is focused, as without SpeedLink.

## 7. macOS: no dead-key leftover

**What it protects.** On macOS, ⌥E is a dead key (the acute accent) on the US layout. When SpeedLink takes ⌥E, the next key typed into a field must not come out accented.

**When.** RC, on macOS with the US (or ABC) layout.

**How.** Load the candidate and assign E to any site with **Background** (so the page stays in front). On a page with a text field, such as `https://duckduckgo.com/`, click outside the field and press ⌥E. Then click into the field and type `a`.

**Pass.** The background tab opens, and the field shows `a`, not `á` or `´`.

## 8. Second device: late-arriving sync data

**What it protects.** On a new device, Chrome installs SpeedLink from sync before `storage.sync` has arrived. The migration has to catch the v1 data when it comes, and import it once (product spec §10).

**When.** After publish.

**How.** Use a second device, or a separate Chrome install on the same machine (Chrome Canary or Beta: it keeps its own profile, while Chrome won't sign one account into two profiles of one install). Sign it in to the author's Google account with sync on and wait for SpeedLink to install from sync. Keep the service-worker console open.

**Pass.** The keymap appears in Options as on the first device, with S moved the same way. The welcome tab opens once (a fresh install). The console shows one migration report. After a minute and a browser restart, nothing is imported twice.

## 9. The four open modes on live sites

**What it protects.** Unit tests and e2e run on fixture pages. This check presses real ⌥ + key on live sites: a site that redirects to another host (Smart switch must find the tab it ended up on), a SPA, and plain sites, one test per open mode.

**When.** RC.

**How.** On the candidate, unzipped as above:

```bash
SPEEDLINK_EXTENSION=<dir>/rc pnpm smoke:live
```

Without `SPEEDLINK_EXTENSION`, it builds and runs on `.output/chrome-mv3`. It isn't in CI: live sites change and go down.

**Pass.** All tests pass. A failure is read by hand before it counts. If a site changed or is down, swap it in `live/live-sites.spec.ts` for one with the same role and re-run.

## Record template

```markdown
### Release checklist, <version> (<rc tag or "Store">), <date>

- Candidate: <tag> at <SHA>; zip SHA-256 <hash>
- Browser: <Chrome or Chromium version>, <OS>
- #N <check>: pass | fail | unverified (<why; for unverified: risk accepted by <who> on <date>, mitigation>)
- Notes: <anything odd, even on a pass>
```
