// Numbered step cards (product spec §8.1 first run, §9 welcome): one card per step, in a row when three fit and
// stacked otherwise. With `active` that card is the current step; without it all are neutral (no progress is tracked).
import { cn } from 'cn';
import type { ReactNode } from 'react';

export interface Step {
  id: string;
  title: ReactNode;
  line: ReactNode;
}

export interface StepCardsProps {
  steps: readonly Step[];
  /** The current step, counted from 1. Unset: every card is neutral and none is `aria-current`. */
  active?: number;
  /** The list's accessible name. */
  label?: string;
}

export function StepCards({ steps, active, label }: StepCardsProps) {
  // The container query stacks the cards to one column when three don't fit in a row.
  return (
    <div className="@container">
      <ol aria-label={label} className="grid gap-4 @2xl:grid-cols-3">
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
