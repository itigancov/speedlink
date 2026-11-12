// Dev-only gallery (`pnpm dev`, then open /gallery.html): every shared piece in every state, side by side, to
// check by eye. A wxt.config.ts hook drops it from production builds. Later items add their own sections here.
// Its own labels are developer-facing identifiers (sizes, states, variants), not user-facing strings.
import '@/assets/theme.css';
import { type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyboardGrid } from '@/components/KeyboardGrid';
import { KeyCap, type KeyCapSize, type KeyCapState } from '@/components/KeyCap';
import { Monogram } from '@/components/Monogram';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { isAssignable, type KeyLabel } from '@/domain/keys';
import { validShortcut } from '@/domain/test-shortcut';
import { chordLabel, type Platform, triggerLabel } from '@/platform/platform-labels';

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
      <Section title="Monogram">
        <Monograms />
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
