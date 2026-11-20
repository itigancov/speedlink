// The welcome tab (product spec §9): what SpeedLink does and the three moves, shown on install and on the update
// from v1. Its text is static; the keymap is read only so that ⌥ + key works here too (§9).
import { PinIcon, PuzzleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from '@/components/Brand';
import { StepCards } from '@/components/StepCards';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import type { Key } from '@/domain/keys';
import { useKeymap } from '@/hooks/use-keymap';
import { usePageKeys } from '@/hooks/use-page-keys';
import { sendMessage } from '@/platform/messaging';
import { PLATFORM, type Platform, triggerSymbol } from '@/platform/platform-labels';

export interface WelcomePageProps {
  /** Forces the trigger labels; defaults to the running platform. */
  platform?: Platform;
  /** Where "Open keymap" goes; defaults to replacing this tab's page, so no stale welcome tab is left behind. */
  navigate?: (url: string) => void;
}

const replacePage = (url: string) => window.location.replace(url);

/** A private-use character that stands in for the trigger while the string is split around it. */
const TRIGGER_MARK = '';

/** Locale text made with `[TRIGGER_MARK]` for its `$1`, with the trigger drawn as a keycap. */
function withTrigger(text: string, platform: Platform): ReactNode {
  const [before, after] = text.split(TRIGGER_MARK);
  if (after === undefined) return before;
  return (
    <>
      {before}
      <Kbd>{triggerSymbol(platform)}</Kbd>
      {after}
    </>
  );
}

/** Asks the background for Options, on `key` when there is one; the welcome page stays where it is. */
function openOptions(key?: Key) {
  sendMessage('openOptions', key === undefined ? undefined : { key }).catch((error: unknown) =>
    console.error('SpeedLink: could not open Options', error),
  );
}

/** The three moves as step cards; none is current, as the page tracks no progress. */
export function WelcomeSteps({ platform }: { platform: Platform }) {
  const steps = [
    {
      id: 'assign',
      title: i18n.t('welcome.steps.assign.title'),
      line: i18n.t('welcome.steps.assign.body', [TRIGGER_MARK]),
    },
    {
      id: 'open',
      title: i18n.t('welcome.steps.open.title', [TRIGGER_MARK]),
      line: i18n.t('welcome.steps.open.body'),
    },
    {
      id: 'peek',
      title: i18n.t('welcome.steps.peek.title', [TRIGGER_MARK]),
      line: i18n.t('welcome.steps.peek.body'),
    },
  ];
  return (
    <StepCards
      steps={steps.map(({ id, title, line }) => ({
        id,
        title: withTrigger(title, platform),
        line: withTrigger(line, platform),
      }))}
    />
  );
}

export function WelcomePage({ platform = PLATFORM, navigate = replacePage }: WelcomePageProps) {
  // ⌥ + a free key assigns it in Options, ⌥S opens Options.
  usePageKeys({ keymap: useKeymap(), onFree: openOptions, onReserved: openOptions });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card px-8 py-4">
        <Brand />
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-12">
        <h1 className="text-balance font-bold text-3xl">
          {withTrigger(i18n.t('welcome.heading', [TRIGGER_MARK]), platform)}
        </h1>
        <WelcomeSteps platform={platform} />
        <p className="flex items-start gap-2 text-muted-foreground text-ui">
          <span aria-hidden="true" className="flex shrink-0 items-center gap-1 pt-0.5">
            <PuzzleIcon className="size-4" />
            <PinIcon className="size-4" />
          </span>
          {i18n.t('welcome.pinTip')}
        </p>
        <Button size="lg" className="self-start" onClick={() => navigate(browser.runtime.getURL('/options.html'))}>
          {i18n.t('welcome.openKeymap')}
        </Button>
      </main>
    </div>
  );
}
