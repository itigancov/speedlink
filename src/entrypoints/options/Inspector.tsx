// "Key details" (product spec §8.3): the selected key's draft, edited in place. Presentational: the page owns the
// draft, the autosave and the actions, so the gallery can show every state.
import { AppWindowIcon, CheckIcon } from 'lucide-react';
import { type Ref, useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { checkDraft, hintLink, type KeyDraft, keyStatus } from '@/domain/key-draft';
import type { Key } from '@/domain/keys';
import { normalizeLink, siteOf } from '@/domain/link';
import { displayName, OPEN_MODES, type OpenMode, type Shortcut, TAB_MATCHES, type TabMatch } from '@/domain/shortcut';
import type { SaveState } from '@/hooks/use-autosave';
import { chordLabel, PLATFORM, type Platform, triggerLabel } from '@/platform/platform-labels';

/** The page Use current tab would fill in. */
export interface WebPage {
  url: string;
  title: string;
}

export interface InspectorProps {
  keyLabel: Key;
  stored: Shortcut | undefined;
  draft: KeyDraft;
  onDraftChange: (draft: KeyDraft) => void;
  /** The stored shortcut is open in a tab right now. */
  openNow: boolean;
  /** Use current tab's page, or undefined when no web page is open. */
  webPage: WebPage | undefined;
  saveState: SaveState;
  onClear: () => void;
  onTry: () => void;
  /** The Link field, for the page to move focus to it. */
  linkRef?: Ref<HTMLInputElement>;
  platform?: Platform;
}

function statusText(stored: Shortcut | undefined, openNow: boolean): string {
  const status = keyStatus(stored, openNow);
  switch (status.kind) {
    case 'free':
      return i18n.t('options.inspector.statusFree');
    case 'open':
      return i18n.t('options.inspector.statusOpen');
    case 'mode':
      return i18n.t(`options.openMode.${status.openMode}.title`);
  }
}

function SaveIndicator({ state, assigned }: { state: SaveState; assigned: boolean }) {
  return (
    <span role="status" className="flex items-center gap-1 font-medium text-ui">
      {state === 'saved' && assigned && (
        <span className="flex items-center gap-1 text-success-foreground">
          <CheckIcon aria-hidden="true" className="size-4" />
          {i18n.t('options.inspector.saved')}
        </span>
      )}
      {state === 'error' && <span className="text-destructive">{i18n.t('options.inspector.saveError')}</span>}
    </span>
  );
}

export function Inspector({
  keyLabel,
  stored,
  draft,
  onDraftChange,
  openNow,
  webPage,
  saveState,
  onClear,
  onTry,
  linkRef,
  platform = PLATFORM,
}: InspectorProps) {
  const id = useId();
  const check = checkDraft(draft, stored);
  const linkError = check.kind === 'invalid' && check.showError;
  const hint = hintLink(draft, stored);
  const thisTab = draft.openMode === 'this';
  const canTry = check.kind !== 'invalid' && (stored !== undefined || check.kind === 'valid');
  const edit = (fields: Partial<KeyDraft>) => onDraftChange({ ...draft, ...fields });

  const fillFromWebPage = () => {
    if (webPage === undefined) return;
    edit({ link: webPage.url, ...(draft.name.trim() === '' ? { name: webPage.title } : {}) });
  };
  const useTabLabel =
    webPage === undefined ? i18n.t('options.inspector.noWebPage') : i18n.t('options.inspector.useTab', [webPage.title]);

  return (
    <aside
      aria-label={i18n.t('options.inspector.label')}
      className="flex w-full max-w-md flex-col gap-6 rounded-2xl border bg-card p-6"
    >
      <header className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-key bg-primary font-bold text-primary-foreground text-xl"
        >
          {keyLabel}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate font-bold text-lg">
            {stored === undefined ? i18n.t('options.inspector.freeKey') : displayName(stored)}
          </h2>
          <p className="text-muted-foreground text-ui">
            {i18n.t('options.inspector.status', [triggerLabel(platform), keyLabel, statusText(stored, openNow)])}
          </p>
        </div>
      </header>

      <Field data-invalid={linkError || undefined}>
        <FieldLabel htmlFor={`${id}-link`}>{i18n.t('options.inspector.link')}</FieldLabel>
        <InputGroup className="h-11">
          <InputGroupInput
            ref={linkRef}
            id={`${id}-link`}
            value={draft.link}
            placeholder={i18n.t('options.inspector.linkPlaceholder')}
            aria-invalid={linkError || undefined}
            aria-describedby={linkError ? `${id}-link-error` : undefined}
            spellCheck={false}
            onChange={(event) => edit({ link: event.target.value })}
            onBlur={() => {
              const normalized = normalizeLink(draft.link);
              if (normalized.ok && normalized.value !== draft.link) edit({ link: normalized.value });
            }}
          />
          <InputGroupAddon align="inline-end">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled button gets no pointer events, so the span keeps the tooltip working. */}
                <span>
                  <InputGroupButton
                    size="icon-sm"
                    aria-label={useTabLabel}
                    disabled={webPage === undefined}
                    onClick={fillFromWebPage}
                  >
                    <AppWindowIcon aria-hidden="true" />
                  </InputGroupButton>
                </span>
              </TooltipTrigger>
              <TooltipContent>{useTabLabel}</TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
        {linkError && <FieldError id={`${id}-link-error`}>{i18n.t('options.inspector.linkError')}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor={`${id}-name`}>{i18n.t('options.inspector.name')}</FieldLabel>
        <Input
          id={`${id}-name`}
          value={draft.name}
          placeholder={i18n.t('options.inspector.namePlaceholder')}
          onChange={(event) => edit({ name: event.target.value })}
        />
      </Field>

      <FieldSet>
        <FieldLegend variant="label">{i18n.t('options.inspector.whenPressed')}</FieldLegend>
        <RadioGroup
          value={draft.openMode}
          onValueChange={(value) => edit({ openMode: value as OpenMode })}
          className="gap-2"
        >
          {OPEN_MODES.map((mode) => (
            <FieldLabel key={mode} htmlFor={`${id}-mode-${mode}`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>
                    {i18n.t(`options.openMode.${mode}.title`)}
                    {mode === 'smart' && <Badge variant="highlight">{i18n.t('options.inspector.recommended')}</Badge>}
                  </FieldTitle>
                  <FieldDescription>{i18n.t(`options.openMode.${mode}.description`)}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={mode} id={`${id}-mode-${mode}`} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </FieldSet>

      {draft.openMode === 'smart' && (
        <FieldSet className="gap-3 rounded-xl bg-muted p-4">
          <FieldLegend variant="label" className="mb-0">
            {i18n.t('options.inspector.tabMatchPrompt')}
          </FieldLegend>
          <ToggleGroup
            type="single"
            variant="outline"
            value={draft.tabMatch}
            onValueChange={(value) => {
              if (value !== '') edit({ tabMatch: value as TabMatch });
            }}
            className="w-full bg-card"
          >
            {TAB_MATCHES.map((match) => (
              <ToggleGroupItem
                key={match}
                value={match}
                className="h-auto min-h-9 flex-1 whitespace-normal px-2 py-1.5 text-ui leading-tight"
              >
                {i18n.t(`options.tabMatch.${match}.title`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {hint !== null && (
            <FieldDescription>
              {i18n.t(`options.tabMatch.${draft.tabMatch}.hint`, [draft.tabMatch === 'site' ? siteOf(hint) : hint])}
            </FieldDescription>
          )}
        </FieldSet>
      )}

      <Field orientation="horizontal" data-disabled={thisTab || undefined}>
        <Checkbox
          id={`${id}-close`}
          checked={!thisTab && draft.closeCurrent}
          disabled={thisTab}
          onCheckedChange={(checked) => edit({ closeCurrent: checked === true })}
        />
        <FieldLabel htmlFor={`${id}-close`} className="font-normal">
          {i18n.t('options.inspector.closeCurrent')}
        </FieldLabel>
      </Field>

      <footer className="flex items-center gap-3 border-t pt-5">
        <Button variant="destructive-outline" disabled={stored === undefined} onClick={onClear}>
          {i18n.t('options.inspector.clear')}
        </Button>
        <span className="flex-1">
          <SaveIndicator state={saveState} assigned={stored !== undefined} />
        </span>
        <Button disabled={!canTry} onClick={onTry}>
          {i18n.t('options.inspector.try', [chordLabel(keyLabel, platform)])}
        </Button>
      </footer>
    </aside>
  );
}
