# SpeedLink 4.0

Chrome extension (MV3) built with WXT + React 19 + TypeScript + Tailwind v4 + shadcn/ui. Product requirements: `docs/product-spec.md`.

## Commands

pnpm only, at the version in `packageManager`: `pnpm install`, `pnpm <script>`, `pnpm exec <bin>`, `pnpm dlx <pkg>@<exact version>`. Dependencies are saved at exact versions (`saveExact` in `pnpm-workspace.yaml`); upgrade them deliberately.

- `pnpm check`: the read-only gate (Biome lint + format verification, then `wxt prepare && tsc --noEmit`). CI runs the same command.
- `pnpm format`: apply formatting and sort imports. Fix style with this, by hand never.
- `pnpm test`: Vitest once. Run a single file with `pnpm test src/path/file.test.ts`.
- `pnpm e2e`: builds, then runs Playwright against the build (it also builds a negative-control variant into `.output-e2e-throw/` and a variant with service-worker test hooks into `.output-e2e-hooks/`). First run needs `pnpm exec playwright install chromium`.
- `pnpm listing`: builds the e2e-hooks variant and redraws the Store listing images with its own Playwright config (`playwright.listing.config.ts`, `listing/`): the five screenshots and the promo tile into `store/` (and the landing page's copies into `site/media/`), the extension icons into `public/icon/`. It fails on a wrong size or an alpha channel. Not part of `pnpm e2e` or CI; the listing texts in `store/listing.md` are edited by hand.
- `pnpm smoke:live`: builds, then runs the four open modes on live sites (`playwright.live.config.ts`, `live/`; release checklist #9). `SPEEDLINK_EXTENSION=<folder>` runs it on an unzipped release candidate instead. Not part of `pnpm e2e` or CI.
- `pnpm dev` / `pnpm build` / `pnpm zip`: WXT watch mode, unpacked build in `.output/`, Store zip.

Done means `check`, `test` and `e2e` all pass. A `pre-push` hook (`.githooks/`, wired by `postinstall`) runs `check` and `test` before every push; fix the failure rather than skipping it.

## Layout and the boundary

```
src/entrypoints/   background/, hud.content/ (the page content script), popup/, options/, welcome/ (unlisted page),
                   gallery/ (dev-only: every shared piece in every state; dropped from builds)
src/domain/        pure TS: keys, key-grid, shortcut, link, tab-match, keymap-ops, fitting-keys, open-plan, assign-plan, assign-picker, keydown, restricted, search, migrations, welcome
src/platform/      everything touching chrome.*: stores, tabs (open executor), open-key, assign-page (assign with undo), options-tab, badge, injection (sendToTab), key-capture, commands, messaging, platform-labels, hud-font, i18n, welcome-tab
src/components/ui/ stock shadcn;  src/components/: shared custom (KeyCap, KeyboardGrid, Monogram, Brand)
src/hooks/  src/assets/ (tokens.css, theme.css for pages, hud.css for the HUD)  src/locales/en.yml
public/icon/       extension icons;  public/fonts/  Inter woff2 + OFL.txt (see README)
e2e/               Playwright specs, harness (extension.ts), fixture-pages/ and fixture-v1/ (the shipped 1.6 build, for the update spec)
```

**Boundary:** `src/domain/` is pure TypeScript. It takes plain data in and returns plain data or a plan out; `platform/` and entrypoints do the side effects (pure plan → thin executor, e.g. `planOpen(...) → OpenPlan`, executed by the background). Biome enforces this: inside `src/domain/` it rejects imports of WXT, `#imports`, `#i18n`, `@webext-core/*`, React, the polyfill and `platform/`, and the `chrome` / `browser` globals.

## Domain language

Use the terms in `GLOSSARY.md` (it wins over every other doc). Decisions with lasting consequences go in `docs/adr/`. Requirements are in `docs/product-spec.md`; each backlog item's own spec says which sections it reads.

## UI rules

- Add shadcn components with `pnpm dlx shadcn@4.23.0 add <name>`. Add variants in place with `cva` in the component file.
- Style only with tokens from `src/assets/tokens.css` and the Tailwind scale; snap to the nearest token (arbitrary values like `w-[37px]` are off-limits).
- The HUD (`hud.content`) lives in a Shadow DOM on arbitrary pages, so it uses only inline, non-modal UI: our own `div role="dialog"`, cmdk `Command` inline, a custom `PageToast`. Sonner, Radix portals/dialogs/popovers and focus traps are out: Sonner crashes the content script at `document_start`, and portals and focus traps escape the shadow root or fight the host page's focus (product spec §12.3).

## Strings

Every user-facing string is a key in `src/locales/en.yml`, read with `i18n.t('key')` (manifest fields use `__MSG_key__`). Every trigger label (⌥ / Alt + key) comes from the platform-labels helper in `src/platform/`, so macOS and other platforms render correctly.

## Messages

All extension messaging goes through the typed protocol in `src/platform/messaging.ts`. Add or tighten a message there, then use its `sendMessage` / `onMessage`; `runtime.sendMessage` and `tabs.sendMessage` are used nowhere else.

## Tests

Work test-first from the behaviour list in the item's spec: a failing test per behaviour, then the code. Unit tests sit next to the code as `*.test.ts`; component tests are `*.test.tsx` with Testing Library and a `// @vitest-environment happy-dom` docblock. `i18n.t` returns the real `en.yml` text in tests (`src/test/setup-i18n.ts`). Domain tests use plain values and no fakes; `platform/` tests use WXT's `fakeBrowser` (`wxt/testing/fake-browser`). User flows get a Playwright spec in `e2e/`. `e2e/manifest.spec.ts` pins the built manifest to product spec §13: change it only together with a deliberate manifest change, and a new install warning over v1 is a release blocker.

## Commits

Conventional Commits (`feat:`, `fix:`, `test:`, `build:`, `ci:`, `docs:`, `chore:`, `refactor:`), imperative, one logical change each.

## Agent skills

### Issue tracker

Local markdown under `~/.scratch/speedlink/` (outside this repo): the backlog is `rebuild/backlog/`, per-item specs are `<item>/spec.md`. See `~/.claude/docs/agents/issue-tracker.md`.

### Triage labels

The default five roles as a `Status:` line in each issue file. See `~/.claude/docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root.
