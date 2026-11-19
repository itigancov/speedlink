// "Edit key" (product spec §8.3): the selected key's draft, edited in a non-modal dialog anchored under the key.
// Presentational: the page owns the draft, the autosave and the actions, and the keyboard card places it, so the
// gallery can show every state.
import { cn } from 'cn';
import { AppWindowIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { type Ref, useId, useState } from 'react';
import { Monogram } from '@/components/Monogram';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { checkDraft, hintLink, type KeyDraft, keyStatus } from '@/domain/key-draft';
import type { Key } from '@/domain/keys';
import { normalizeLink, siteOf } from '@/domain/link';
import {
  DEFAULT_TAB_MATCH,
  displayName,
  OPEN_MODES,
  type OpenMode,
  type Shortcut,
  TAB_MATCHES,
  type TabMatch,
} from '@/domain/shortcut';
import type { SaveState } from '@/hooks/use-autosave';
import { chordLabel, PLATFORM, type Platform } from '@/platform/platform-labels';

/** The page Use current tab would fill in. */
export interface WebPage {
  url: string;
  title: string;
}

/** Where the editor sits, in px from the keyboard's top left; `arrow` is the key's centre from the editor's left. */
export interface EditorPlacement {
  top: number;
  left: number;
  arrow: number;
}

/** The editor's width (w-95) and its arrow's (size-3.5), for placing it. */
export const EDITOR_WIDTH = 380;
const ARROW_SIZE = 14;
/** The dialog's border: its children are placed from inside it. */
const BORDER = 1;

export interface KeyEditorProps {
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
  onTest: () => void;
  /** ×, Done. */
  onClose: () => void;
  /** The Link field, for the page to move focus to it. */
  linkRef?: Ref<HTMLInputElement>;
  /** Anchored under its key; without one it sits in the flow with the arrow centred (the gallery). */
  placement?: EditorPlacement;
  /** Faded out and click-through, while a drag runs. */
  hidden?: boolean;
  platform?: Platform;
}

function statusText(stored: Shortcut | undefined, openNow: boolean): string {
  const status = keyStatus(stored, openNow);
  switch (status.kind) {
    case 'free':
      return i18n.t('options.editor.statusFree');
    case 'open':
      return i18n.t('options.editor.statusOpen');
    case 'mode':
      return i18n.t(`options.openMode.${status.openMode}.title`);
  }
}

/** More options starts open when the key stores a setting it holds. */
const needsMoreOptions = (stored: Shortcut | undefined) =>
  stored !== undefined && (stored.tabMatch !== DEFAULT_TAB_MATCH || stored.closeCurrent);

function SaveLine({ state, assigned }: { state: SaveState; assigned: boolean }) {
  return (
    <span role="status" className="flex items-center gap-1.5 text-muted-foreground text-xs">
      {state === 'saved' && assigned && (
        <>
          <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
          {i18n.t('options.editor.saved')}
        </>
      )}
      {state === 'pending' && i18n.t('options.editor.saving')}
      {state === 'error' && <span className="font-medium text-destructive">{i18n.t('options.editor.saveError')}</span>}
    </span>
  );
}

/** A segmented control on a grey track: one choice of a few, each on an equal share of the row. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; text: string; name?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      spacing={1}
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next !== '') onChange(next as T);
      }}
      className="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-lg bg-secondary p-1"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.name}
          className="h-9 min-w-0 rounded-md px-1 font-semibold text-foreground-subtle text-xs hover:bg-card/60 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
        >
          <span className="truncate">{option.text}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type PreviewTabKind = 'active' | 'new' | 'plain' | 'closed';

/** One tab in the preview: how it's drawn, and whose it is (the shortcut's own tab carries its tile). */
interface PreviewTab {
  kind: PreviewTabKind;
  page: 'docs' | 'mail' | 'own';
}

const PREVIEW_TAB: Record<PreviewTabKind, string> = {
  active: 'border-primary bg-card text-link',
  new: 'border-primary/30 bg-accent text-accent-foreground',
  plain: 'border-secondary bg-secondary text-foreground-subtle',
  closed: 'border-border-strong border-dashed text-muted-foreground',
};

const BEFORE: readonly PreviewTab[] = [
  { kind: 'active', page: 'docs' },
  { kind: 'plain', page: 'own' },
  { kind: 'plain', page: 'mail' },
];

/**
 * The tabs after the key is pressed with "Docs" in front, per the open plan (§2.3): close current takes the source
 * tab away, except with This tab; Background stays on Docs unless close current makes the new tab active.
 */
function stripAfter(mode: OpenMode, closeCurrent: boolean): PreviewTab[] {
  const closes = closeCurrent && mode !== 'this';
  const source: PreviewTab = { kind: closes ? 'closed' : 'plain', page: 'docs' };
  const opened: PreviewTab = { kind: 'active', page: 'own' };
  const own: PreviewTab = { kind: 'plain', page: 'own' };
  const mail: PreviewTab = { kind: 'plain', page: 'mail' };
  switch (mode) {
    case 'smart':
      return [source, opened, mail];
    case 'new':
      return [source, opened, own, mail];
    case 'this':
      return [opened, own, mail];
    case 'bg':
      return closes
        ? [source, opened, own, mail]
        : [{ kind: 'active', page: 'docs' }, { kind: 'new', page: 'own' }, own, mail];
  }
}

/** Decorative: what pressing the key does to a row of tabs. The mode description above it is the accessible text. */
function TabStripPreview({ draft, stored }: { draft: KeyDraft; stored: Shortcut | undefined }) {
  const check = checkDraft(draft, stored);
  const shortcut = check.kind === 'valid' ? check.shortcut : stored;
  const link = normalizeLink(draft.link);
  const name =
    draft.name.trim() ||
    (link.ok ? siteOf(link.value) : undefined) ||
    (shortcut === undefined ? undefined : displayName(shortcut)) ||
    i18n.t('options.editor.preview.link');
  const label = (tab: PreviewTab) => {
    if (tab.kind === 'closed') return i18n.t('options.editor.preview.closed');
    if (tab.page === 'docs') return i18n.t('options.editor.preview.docs');
    if (tab.page === 'mail') return i18n.t('options.editor.preview.mail');
    return name;
  };

  const chip = (tab: PreviewTab, index: number) => (
    <span
      key={index}
      className={cn(
        'flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border px-1 font-semibold',
        PREVIEW_TAB[tab.kind],
      )}
    >
      {tab.page === 'own' && shortcut !== undefined && <Monogram shortcut={shortcut} size="2xs" />}
      <span className="truncate text-3xs">{label(tab)}</span>
    </span>
  );

  return (
    <div aria-hidden="true" data-slot="tab-strip-preview" className="flex items-center gap-2">
      <div className="flex min-w-0 flex-3 gap-0.5">{BEFORE.map(chip)}</div>
      <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-4 gap-0.5">{stripAfter(draft.openMode, draft.closeCurrent).map(chip)}</div>
    </div>
  );
}

export function KeyEditor({
  keyLabel,
  stored,
  draft,
  onDraftChange,
  openNow,
  webPage,
  saveState,
  onClear,
  onTest,
  onClose,
  linkRef,
  placement,
  hidden = false,
  platform = PLATFORM,
}: KeyEditorProps) {
  const id = useId();
  const check = checkDraft(draft, stored);
  const linkError = check.kind === 'invalid' && check.showError;
  const hint = hintLink(draft, stored);
  const thisTab = draft.openMode === 'this';
  const canTest = check.kind !== 'invalid' && (stored !== undefined || check.kind === 'valid');
  const edit = (fields: Partial<KeyDraft>) => onDraftChange({ ...draft, ...fields });

  // Collapsed on every key switch, unless the key needs it open.
  const [more, setMore] = useState(() => needsMoreOptions(stored));
  const [moreKey, setMoreKey] = useState(keyLabel);
  if (moreKey !== keyLabel) {
    setMoreKey(keyLabel);
    setMore(needsMoreOptions(stored));
  }

  const fillFromWebPage = () => {
    if (webPage === undefined) return;
    edit({ link: webPage.url, ...(draft.name.trim() === '' ? { name: webPage.title } : {}) });
  };
  const useTabLabel =
    webPage === undefined ? i18n.t('options.editor.noWebPage') : i18n.t('options.editor.useTab', [webPage.title]);
  const arrow = placement?.arrow ?? EDITOR_WIDTH / 2;

  return (
    <div
      role="dialog"
      aria-label={i18n.t('options.editor.label')}
      tabIndex={-1}
      data-hidden={hidden || undefined}
      style={
        placement === undefined
          ? { transformOrigin: `${arrow}px 0` }
          : { top: placement.top, left: placement.left, transformOrigin: `${arrow}px 0` }
      }
      className={cn(
        'z-10 flex w-95 flex-col gap-3.5 rounded-xl border border-border-strong bg-popover p-4.5 text-popover-foreground shadow-xl outline-none transition-opacity duration-150 motion-safe:animate-editor-in',
        placement === undefined ? 'relative' : 'absolute',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -top-2 size-3.5 rotate-45 border-border-strong border-t border-l bg-popover"
        style={{ left: arrow - ARROW_SIZE / 2 - BORDER }}
      />

      <div className="flex items-center gap-3">
        <span
          data-slot="editor-chip"
          className="flex h-8 shrink-0 items-center rounded-lg bg-primary px-2.5 font-bold text-primary-foreground text-sm"
        >
          {chordLabel(keyLabel, platform)}
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-bold text-md">
            {stored === undefined ? i18n.t('options.editor.freeKey') : displayName(stored)}
          </h2>
          <p className="text-muted-foreground text-xs">{statusText(stored, openNow)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={i18n.t('options.editor.close')}
          className="ml-auto text-muted-foreground"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      <Field data-invalid={linkError || undefined} className="gap-1.5">
        <FieldLabel htmlFor={`${id}-link`}>{i18n.t('options.editor.link')}</FieldLabel>
        <InputGroup className="h-11">
          <InputGroupInput
            ref={linkRef}
            id={`${id}-link`}
            value={draft.link}
            placeholder={i18n.t('options.editor.linkPlaceholder')}
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
        {linkError && <FieldError id={`${id}-link-error`}>{i18n.t('options.editor.linkError')}</FieldError>}
      </Field>

      <Field className="gap-1.5">
        <FieldLabel htmlFor={`${id}-name`}>
          {i18n.t('options.editor.name')}{' '}
          <span className="font-normal text-muted-foreground">{i18n.t('options.editor.optional')}</span>
        </FieldLabel>
        <Input
          id={`${id}-name`}
          value={draft.name}
          placeholder={i18n.t('options.editor.namePlaceholder')}
          className="h-11"
          onChange={(event) => edit({ name: event.target.value })}
        />
      </Field>

      {/* min-w-0: a fieldset is otherwise as wide as its content's min-content, the preview's tabs. */}
      <FieldSet className="min-w-0 gap-2">
        <FieldLegend variant="label" className="mb-0">
          {i18n.t('options.editor.opensAs')}
        </FieldLegend>
        <Segmented
          label={i18n.t('options.editor.opensAs')}
          value={draft.openMode}
          options={OPEN_MODES.map((mode) => ({
            value: mode,
            text: i18n.t(`options.openMode.${mode}.short`),
            name: i18n.t(`options.openMode.${mode}.title`),
          }))}
          onChange={(openMode) => edit({ openMode })}
        />
        <div className="flex flex-col gap-2 rounded-lg bg-background px-3 py-2.5">
          <p className="text-foreground-subtle text-xs">{i18n.t(`options.openMode.${draft.openMode}.description`)}</p>
          <TabStripPreview draft={draft} stored={stored} />
        </div>
      </FieldSet>

      <Collapsible open={more} onOpenChange={setMore} className="flex flex-col gap-3.5">
        <CollapsibleTrigger asChild>
          <Button variant="link" size="sm" className="group self-start px-1 font-semibold text-link">
            <span className="text-ui">{i18n.t('options.editor.moreOptions')}</span>
            <ChevronDownIcon aria-hidden="true" className="transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3.5">
          {draft.openMode === 'smart' && (
            <FieldSet className="min-w-0 gap-2">
              <FieldLegend variant="label" className="mb-0">
                {i18n.t('options.editor.tabMatchPrompt')}
              </FieldLegend>
              <Segmented
                label={i18n.t('options.editor.tabMatchPrompt')}
                value={draft.tabMatch}
                options={TAB_MATCHES.map((match) => ({
                  value: match,
                  text: i18n.t(`options.tabMatch.${match}.title`),
                }))}
                onChange={(tabMatch: TabMatch) => edit({ tabMatch })}
              />
              {hint !== null && (
                <FieldDescription className="text-xs">
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
              {i18n.t('options.editor.closeCurrent')}
            </FieldLabel>
          </Field>
        </CollapsibleContent>
      </Collapsible>

      <footer className="flex items-center gap-2 border-border-subtle border-t pt-3.5">
        <Button
          variant="destructive-ghost"
          className="h-10 px-2.5 font-semibold"
          disabled={stored === undefined}
          onClick={onClear}
        >
          <span className="text-ui">{i18n.t('options.editor.clear')}</span>
        </Button>
        <span className="ml-auto">
          <SaveLine state={saveState} assigned={stored !== undefined} />
        </span>
        {/* The label spans carry text-ui: cn would drop a variant's text colour next to it. */}
        <Button variant="outline" className="h-10 bg-card px-3 font-semibold" disabled={!canTest} onClick={onTest}>
          <span className="text-ui">{i18n.t('options.editor.test')}</span>
        </Button>
        <Button variant="inverse" className="h-10 px-4 font-semibold" onClick={onClose}>
          <span className="text-ui">{i18n.t('options.editor.done')}</span>
        </Button>
      </footer>
    </div>
  );
}
