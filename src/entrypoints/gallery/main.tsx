// Dev-only gallery (`pnpm dev`, then open /gallery.html): every shared piece in every state, side by side, to
// check by eye. A wxt.config.ts hook drops it from production builds. Later items add their own sections here.
// Its own labels are developer-facing identifiers (sizes, states, variants), not user-facing strings.
import '@/assets/theme.css';
import { type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyboardGrid } from '@/components/KeyboardGrid';
import { KeyCap, type KeyCapSize, type KeyCapState } from '@/components/KeyCap';
import { Monogram } from '@/components/Monogram';
import { OverlayTile } from '@/components/OverlayTile';
import { PageToast } from '@/components/PageToast';
import { createToastSlot, ToastRegion } from '@/components/ToastRegion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { TooltipProvider } from '@/components/ui/tooltip';
import { draftOf, type KeyDraft } from '@/domain/key-draft';
import { isAssignable, type Key, type KeyLabel } from '@/domain/keys';
import type { OverlayTile as OverlayTileData } from '@/domain/overlay-model';
import type { Shortcut } from '@/domain/shortcut';
import { validShortcut } from '@/domain/test-shortcut';
import type { SaveState } from '@/hooks/use-autosave';
import { chordLabel, type Platform, triggerLabel } from '@/platform/platform-labels';
import { Inspector } from '../options/Inspector';
import { KeyboardCard } from '../options/KeyboardCard';
import { ListCard } from '../options/ListCard';

const SIZES: KeyCapSize[] = ['lg', 'xl', 'md', 'sm'];
const STATES: KeyCapState[] = ['free', 'assigned', 'selected', 'drop-target', 'reserved', 'taken', 'picked'];
const PLATFORMS: Platform[] = ['mac', 'other'];

const github = validShortcut({ link: 'https://github.com/', name: 'GitHub' });
const youtube = validShortcut({ link: 'https://youtube.com/' });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-6">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="font-mono text-2xs text-muted-foreground">{children}</span>;
}

function KeyCapMatrix() {
  return (
    <div className="flex flex-col gap-4 overflow-x-auto">
      {SIZES.map((size) => (
        <div key={size} className="flex items-end gap-6">
          <Caption>{size}</Caption>
          {STATES.map((state) =>
            [false, true].map((open) => (
              <div key={`${state}-${open}`} className="flex flex-col items-center gap-1">
                <KeyCap
                  size={size}
                  state={state}
                  open={open}
                  label={state === 'reserved' ? 'S' : 'G'}
                  name={state === 'free' || state === 'reserved' ? undefined : 'GitHub'}
                  monogram="GH"
                />
                <Caption>
                  {state}
                  {open ? ' +open' : ''}
                </Caption>
              </div>
            )),
          )}
        </div>
      ))}
    </div>
  );
}

/** A sample keymap to fill the grids: a few assigned keys, one open, one selected. */
function sampleState(label: KeyLabel): { state: KeyCapState; open?: boolean; name?: string; monogram?: string } {
  const sample = { name: 'Sample', monogram: 'SA' };
  if (!isAssignable(label)) return { state: 'reserved' };
  if (label === 'K') return { state: 'selected', open: true, ...sample };
  if (label === 'D') return { state: 'drop-target', ...sample };
  if ('YGCTNFL12'.includes(label)) return { state: 'assigned', open: 'YN'.includes(label), ...sample };
  return { state: 'free' };
}

/** The popup mini keyboard: H picked, a few keys taken. */
function miniState(label: KeyLabel): KeyCapState {
  if (!isAssignable(label)) return 'reserved';
  if (label === 'H') return 'picked';
  return 'YGCK'.includes(label) ? 'taken' : 'free';
}

function Grids() {
  return (
    <div className="flex flex-col gap-8 overflow-x-auto">
      {PLATFORMS.map((platform) => (
        <div key={platform} className="flex flex-col gap-4">
          <Caption>
            {platform}: {triggerLabel(platform)} · {chordLabel('K', platform)}
          </Caption>
          <KeyboardGrid
            size="lg"
            platform={platform}
            renderKey={(label) => <KeyCap size="lg" label={label} platform={platform} {...sampleState(label)} />}
          />
          <KeyboardGrid
            size="sm"
            platform={platform}
            renderKey={(label) => <KeyCap size="sm" label={label} platform={platform} state={miniState(label)} />}
          />
        </div>
      ))}
    </div>
  );
}

function Variants() {
  const buttons = ['default', 'inverse', 'warning-outline', 'destructive-outline', 'outline', 'ghost'] as const;
  const badges = ['default', 'highlight', 'accent', 'secondary'] as const;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {buttons.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
        <Button size="icon" variant="outline" aria-label="icon">
          ⌘
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {badges.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
        <Kbd>/</Kbd>
        <Kbd>{chordLabel('K')}</Kbd>
      </div>
      <div className="grid max-w-md gap-3">
        <Alert variant="warning">
          <AlertTitle>warning</AlertTitle>
          <AlertDescription>{chordLabel('K')} …</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>destructive</AlertTitle>
        </Alert>
        <Alert>
          <AlertTitle>default</AlertTitle>
        </Alert>
      </div>
    </div>
  );
}

function Monograms() {
  return (
    <div className="flex items-center gap-4">
      <Monogram shortcut={github} />
      <Monogram shortcut={youtube} />
      <Monogram shortcut={github} src="/icon/32.png" />
      <Monogram shortcut={github} src="/missing.png" />
      <Monogram shortcut={github} size="sm" />
    </div>
  );
}

const noop = () => {};

/** The toast region, live: the buttons drive the one slot. */
const gallerySlot = createToastSlot();
const LONG_NAME = 'A shortcut with a very long name that keeps going well past the pill';

function Toasts() {
  return (
    <div className="flex flex-col gap-4">
      {PLATFORMS.map((platform) => (
        <div key={platform} className="flex flex-col items-start gap-2">
          <Caption>{platform}</Caption>
          <PageToast
            chip={chordLabel('K', platform)}
            tone="free"
            message={i18n.t('pageToast.free')}
            actionLabel={i18n.t('pageToast.putPageOnKey')}
            onAction={noop}
            onClose={noop}
            closeLabel={i18n.t('pageToast.close')}
          />
          <PageToast
            chip={chordLabel('Y', platform)}
            tone="switched"
            message={i18n.t('pageToast.switched', ['YouTube'])}
            actionLabel={i18n.t('pageToast.openNew')}
            onAction={noop}
          />
          <PageToast
            chip={chordLabel('Y', platform)}
            tone="switched"
            message={i18n.t('pageToast.switched', [LONG_NAME])}
            actionLabel={i18n.t('pageToast.openNew')}
            onAction={noop}
          />
          <PageToast
            chip={chordLabel('K', platform)}
            tone="saved"
            message={i18n.t('pageToast.saved', ['The Guide'])}
            actionLabel={i18n.t('pageToast.undo')}
            onAction={noop}
          />
          <PageToast
            chip={chordLabel('K', platform)}
            tone="saved"
            message={i18n.t('pageToast.saved', [LONG_NAME])}
            actionLabel={i18n.t('pageToast.undo')}
            onAction={noop}
          />
          <PageToast chip={chordLabel('K', platform)} tone="error" message={i18n.t('pageToast.undoStale')} />
          <PageToast
            chip={chordLabel('K', platform)}
            tone="error"
            message={i18n.t('pageToast.saveFailed', [chordLabel('K', platform)])}
          />
        </div>
      ))}
      <Caption>ToastRegion (bottom centre of this window)</Caption>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => gallerySlot.show({ kind: 'free', key: 'K' })}>
          free K
        </Button>
        <Button variant="outline" onClick={() => gallerySlot.show({ kind: 'free', key: 'J' })}>
          free J
        </Button>
        <Button variant="outline" onClick={() => gallerySlot.show({ kind: 'switched', key: 'Y', name: 'YouTube' })}>
          switched Y (3 s)
        </Button>
        <Button variant="outline" onClick={() => gallerySlot.show({ kind: 'switched', key: 'Y', name: LONG_NAME })}>
          switched, long name
        </Button>
        <Button
          variant="outline"
          onClick={() => gallerySlot.show({ kind: 'saved', key: 'K', name: 'The Guide', undoId: 'gallery' })}
        >
          saved K (5 s)
        </Button>
        <Button variant="outline" onClick={() => gallerySlot.show({ kind: 'error', key: 'K', reason: 'undo-stale' })}>
          error: undo stale (5 s)
        </Button>
        <Button variant="outline" onClick={() => gallerySlot.show({ kind: 'error', key: 'K', reason: 'save-failed' })}>
          error: save failed (5 s)
        </Button>
      </div>
      <ToastRegion slot={gallerySlot} actions={{ openNew: noop, putPageOnKey: noop, undo: noop }} />
    </div>
  );
}

/** The Options keyboard card: assigned keys, open ones, the selected key, free keys and the reserved S. */
const sampleKeymap: Partial<Record<Key, Shortcut>> = {
  Y: validShortcut({ link: 'https://youtube.com/', name: 'YouTube' }),
  G: github,
  K: validShortcut({ link: 'https://claude.ai/', name: 'Claude' }),
  N: validShortcut({ link: 'https://notion.so/roadmap', name: 'Roadmap', tabMatch: 'exact' }),
  '1': validShortcut({ link: 'http://localhost:3000/', name: 'Dev server', openMode: 'this' }),
};

function KeyboardCards() {
  return (
    <div className="flex flex-col gap-4">
      {PLATFORMS.map((platform) => (
        <KeyboardCard
          key={platform}
          keymap={sampleKeymap}
          openKeys={new Set<Key>(['Y', 'K'])}
          selected="K"
          onSelect={noop}
          onDrop={noop}
          platform={platform}
        />
      ))}
    </div>
  );
}

/** The keyboard card under a search: "tube" matches Y only (K, selected, dims), and a query with no match. */
function SearchedKeyboardCards() {
  return (
    <div className="flex flex-col gap-4">
      {[
        { caption: 'query matching Y, selected K dimmed', matches: new Set<Key>(['Y']) },
        { caption: 'no match, all dimmed', matches: new Set<Key>() },
      ].map(({ caption, matches }) => (
        <div key={caption} className="flex flex-col gap-2">
          <Caption>{caption}</Caption>
          <KeyboardCard
            keymap={sampleKeymap}
            openKeys={new Set<Key>(['Y', 'K'])}
            selected="K"
            matches={matches}
            onSelect={noop}
            onDrop={noop}
          />
        </div>
      ))}
    </div>
  );
}

/** The keyboard card mid-drag: Y lifted over a free key (move) and over an assigned key (swap). */
function DraggingKeyboardCards() {
  return (
    <div className="flex flex-col gap-4">
      {[
        { caption: 'Y over free H: drop to move', target: 'H' as const },
        { caption: 'Y over assigned K: drop to swap', target: 'K' as const },
      ].map(({ caption, target }) => (
        <div key={caption} className="flex flex-col gap-2">
          <Caption>{caption}</Caption>
          <KeyboardCard
            keymap={sampleKeymap}
            openKeys={new Set<Key>(['Y', 'K'])}
            selected="K"
            onSelect={noop}
            onDrop={noop}
            frozenDrag={{ source: 'Y', target }}
          />
        </div>
      ))}
    </div>
  );
}

/** The List view: no name, closes current, This tab with close current (ignored), open now, selected, empty. */
const listKeymap: Partial<Record<Key, Shortcut>> = {
  '1': validShortcut({ link: 'http://localhost:3000/', name: 'Dev server', openMode: 'this', closeCurrent: true }),
  Y: youtube,
  G: validShortcut({ link: 'https://github.com/pulls', name: 'Pull requests', closeCurrent: true }),
  N: validShortcut({
    link: 'https://notion.so/workspace/roadmap-2026-q4-planning-and-everything-else-0123456789abcdef',
    name: 'Roadmap',
    openMode: 'bg',
  }),
  K: validShortcut({ link: 'https://claude.ai/', name: 'Claude', openMode: 'new' }),
};

function ListCards() {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        {[
          { caption: 'filled, G selected, Y open', keymap: listKeymap, matches: null },
          { caption: 'no match', keymap: listKeymap, matches: new Set<Key>() },
          { caption: 'empty keymap', keymap: {}, matches: null },
        ].map(({ caption, keymap, matches }) => (
          <div key={caption} className="flex flex-col gap-2">
            <Caption>{caption}</Caption>
            <ListCard keymap={keymap} openKeys={new Set<Key>(['Y'])} selected="G" matches={matches} onSelect={noop} />
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}

interface InspectorSample {
  caption: string;
  stored: Shortcut | undefined;
  draft?: Partial<KeyDraft>;
  saveState?: SaveState;
  openNow?: boolean;
  webPage?: boolean;
}

const INSPECTORS: InspectorSample[] = [
  { caption: 'assigned, open now, saved', stored: github, openNow: true, webPage: true },
  { caption: 'free', stored: undefined, webPage: true },
  { caption: 'free, no web page open', stored: undefined },
  { caption: 'invalid link', stored: github, draft: { link: 'mailto:me@example.com' }, saveState: 'invalid' },
  { caption: "couldn't save", stored: github, draft: { name: 'Code' }, saveState: 'error' },
  { caption: 'This tab', stored: validShortcut({ link: 'https://github.com/', openMode: 'this', closeCurrent: true }) },
  { caption: 'Smart, exact', stored: validShortcut({ link: 'https://notion.so/roadmap', tabMatch: 'exact' }) },
  { caption: 'Smart, page', stored: validShortcut({ link: 'https://linear.app/my-issues', tabMatch: 'page' }) },
  { caption: 'Smart, site', stored: youtube },
];

function Inspectors() {
  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-start gap-6">
        {INSPECTORS.map(({ caption, stored, draft, saveState = 'saved', openNow = false, webPage = false }) => (
          <div key={caption} className="flex w-full max-w-md flex-col gap-2">
            <Caption>{caption}</Caption>
            <Inspector
              keyLabel="G"
              stored={stored}
              draft={{ ...draftOf(stored), ...draft }}
              onDraftChange={noop}
              openNow={openNow}
              webPage={webPage ? { url: 'https://docs.example.com/', title: 'Docs' } : undefined}
              saveState={saveState}
              onClear={noop}
              onTry={noop}
            />
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}

/** One overlay tile per subline: open in this window, in another window, and each open mode. */
const OVERLAY_TILES: OverlayTileData[] = [
  { key: '1', name: 'Docs', subline: { kind: 'tab', index: 3 } },
  { key: 'G', name: 'GitHub', subline: { kind: 'other-window' } },
  { key: 'K', name: 'Calendar', subline: { kind: 'mode', mode: 'smart', site: 'calendar.example.com' } },
  { key: 'Y', name: 'youtube.com', subline: { kind: 'mode', mode: 'new', site: 'youtube.com' } },
  {
    key: 'T',
    name: 'A shortcut with a very long name indeed',
    subline: { kind: 'mode', mode: 'this', site: 't.example' },
  },
  { key: 'B', name: 'Board', subline: { kind: 'mode', mode: 'bg', site: 'board.example' } },
];

function OverlayTiles() {
  return (
    <div className="flex flex-col gap-4">
      {PLATFORMS.map((platform) => (
        <div key={platform} className="flex flex-col gap-2">
          <Caption>{platform} (hover a tile for its pencil)</Caption>
          <div className="grid max-w-3xl grid-cols-4 gap-2">
            {OVERLAY_TILES.map((tile) => (
              <OverlayTile key={tile.key} tile={tile} platform={platform} onOpen={() => {}} onEdit={() => {}} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-8">
      <h1 className="font-bold text-3xl">Gallery</h1>
      <Section title="KeyCap: size × state (each without and with open)">
        <KeyCapMatrix />
      </Section>
      <Section title="KeyboardGrid: lg and sm, per platform">
        <Grids />
      </Section>
      <Section title="Options: keyboard card, per platform">
        <KeyboardCards />
      </Section>
      <Section title="Options: keyboard card under a search">
        <SearchedKeyboardCards />
      </Section>
      <Section title="Options: keyboard card mid-drag">
        <DraggingKeyboardCards />
      </Section>
      <Section title="Options: list view">
        <ListCards />
      </Section>
      <Section title="Options: inspector states">
        <Inspectors />
      </Section>
      <Section title="Monogram">
        <Monograms />
      </Section>
      <Section title="OverlayTile: every subline, per platform">
        <OverlayTiles />
      </Section>
      <Section title="PageToast and ToastRegion">
        <Toasts />
      </Section>
      <Section title="Button, Badge, Kbd, Alert">
        <Variants />
      </Section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
