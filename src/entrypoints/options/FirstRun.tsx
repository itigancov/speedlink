// The pieces only Options' first run draws (product spec §8.1): the step cards and the hint under the keys.
import { cn } from 'cn';
import { type Platform, pasteLabel, triggerSymbol } from '@/platform/platform-labels';

/** Three steps from an empty keymap to a working key; the active one follows the selection. Step 3 is never active. */
export function StepCards({ active, platform }: { active: 1 | 2; platform?: Platform }) {
  const steps = [
    { id: 'pick', title: i18n.t('options.firstRun.pick.title'), line: i18n.t('options.firstRun.pick.line') },
    {
      title: i18n.t('options.firstRun.paste.title'),
      line: i18n.t('options.firstRun.paste.line', [pasteLabel(platform)]),
    },
    {
      title: i18n.t('options.firstRun.use.title'),
      line: i18n.t('options.firstRun.use.line', [triggerSymbol(platform)]),
    },
  ];
  // The container query stacks the cards to one column when three don't fit in a row.
  return (
    <div className="@container">
      <ol aria-label={i18n.t('options.firstRun.steps')} className="grid gap-4 @2xl:grid-cols-3">
        {steps.map((step, index) => {
          const current = index + 1 === active;
          return (
            <li
              key={step.id}
              aria-current={current ? 'step' : undefined}
              className={cn('flex gap-3 rounded-xl border bg-card p-4', current && 'border-primary')}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-sm',
                  current ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                )}
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <p data-slot="step-title" className="font-semibold">
                  {step.title}
                </p>
                <p className="text-muted-foreground text-sm">{step.line}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Sits under the keys in place of the legend. */
export function FirstRunHint() {
  return (
    <p className="border-border-subtle border-t pt-4 text-muted-foreground text-xs">
      {i18n.t('options.firstRun.hint')}
    </p>
  );
}
