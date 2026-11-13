// The welcome tab (product spec §9): what SpeedLink does and the three moves, shown on install and on the update
// from v1. Static: it reads no keymap.
import { PinIcon, PuzzleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
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

export function WelcomePage({ platform = PLATFORM, navigate = replacePage }: WelcomePageProps) {
  const steps = [
    {
      id: 'assign',
      title: i18n.t('welcome.steps.assign.title'),
      body: i18n.t('welcome.steps.assign.body', [TRIGGER_MARK]),
    },
    {
      id: 'open',
      title: i18n.t('welcome.steps.open.title', [TRIGGER_MARK]),
      body: i18n.t('welcome.steps.open.body'),
    },
    {
      id: 'peek',
      title: i18n.t('welcome.steps.peek.title', [TRIGGER_MARK]),
      body: i18n.t('welcome.steps.peek.body'),
    },
  ];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card px-8 py-4">
        <Brand />
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-12">
        <h1 className="text-balance font-bold text-3xl">
          {withTrigger(i18n.t('welcome.heading', [TRIGGER_MARK]), platform)}
        </h1>
        <Card className="px-6">
          <ol className="flex flex-col gap-6">
            {steps.map(({ id, title, body }, index) => (
              <li key={id} className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/7 font-bold text-link"
                >
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h2 className="font-semibold text-md">{withTrigger(title, platform)}</h2>
                  <p className="text-muted-foreground text-ui">{withTrigger(body, platform)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
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
