// The pieces only Options' first run draws (product spec §8.1): its step cards and the hint under the keys.
import { StepCards } from '@/components/StepCards';
import { type Platform, pasteLabel, triggerSymbol } from '@/platform/platform-labels';

/** Three steps from an empty keymap to a working key; the active one follows the selection. Step 3 is never active. */
export function FirstRunSteps({ active, platform }: { active: 1 | 2; platform?: Platform }) {
  const steps = [
    { id: 'pick', title: i18n.t('options.firstRun.pick.title'), line: i18n.t('options.firstRun.pick.line') },
    {
      id: 'paste',
      title: i18n.t('options.firstRun.paste.title'),
      line: i18n.t('options.firstRun.paste.line', [pasteLabel(platform)]),
    },
    {
      id: 'use',
      title: i18n.t('options.firstRun.use.title'),
      line: i18n.t('options.firstRun.use.line', [triggerSymbol(platform)]),
    },
  ];
  return <StepCards steps={steps} active={active} label={i18n.t('options.firstRun.steps')} />;
}

/** Sits under the keys in place of the legend. */
export function FirstRunHint() {
  return (
    <p className="border-border-subtle border-t pt-4 text-muted-foreground text-xs">
      {i18n.t('options.firstRun.hint')}
    </p>
  );
}
