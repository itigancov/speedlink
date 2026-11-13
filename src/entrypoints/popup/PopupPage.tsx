// Popup · Assign this page (product spec §7): the tab's page card, the key picker, Opens as and the save. The popup
// never writes the keymap: the background assigns (§11.3) and sends the saved toast to the page.
import { cn } from 'cn';
import { BanIcon, KeyboardIcon, ZapIcon } from 'lucide-react';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { KeyboardGrid } from '@/components/KeyboardGrid';
import { KeyCap, type KeyCapState } from '@/components/KeyCap';
import { Monogram } from '@/components/Monogram';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { keyFromCode, type PickedKey, type PickerModel, pickerModel } from '@/domain/assign-picker';
import type { Keymap, Resolve } from '@/domain/keymap-ops';
import { isAssignable, type Key, type KeyLabel } from '@/domain/keys';
import { withoutScheme } from '@/domain/link';
import { DEFAULT_OPEN_MODE, displayName, OPEN_MODES, type OpenMode } from '@/domain/shortcut';
import { useKeymap } from '@/hooks/use-keymap';
import type { AssignPageReply } from '@/platform/messaging';
import { chordLabel, PLATFORM, type Platform, triggerPlus, triggerSymbol } from '@/platform/platform-labels';
import type { PopupTab } from '@/platform/tabs';
import { usePopupTab } from './use-popup-tab';

export interface PopupActions {
  assignPage(request: { key: Key; tabId: number; openMode: OpenMode; resolve?: Resolve }): Promise<AssignPageReply>;
  openOptions(): Promise<void>;
  close(): void;
}

export interface PopupPageProps {
  actions: PopupActions;
  /** The tab to assign; the active tab of the popup's window when left out. */
  tabId?: number;
  /** Forces the trigger labels; defaults to the running platform. */
  platform?: Platform;
}

/** Key presses inside the Opens as select (its trigger or its open list) drive the select, never the picker. */
const inSelect = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-slot=select-trigger],[data-slot=select-content]') !== null;

/** Native activation applies on a focused control: ↵ on a chip picks it, on the select opens it. */
const onControl = (target: EventTarget | null) =>
  target instanceof Element && (target.closest('button') !== null || inSelect(target));

/** A pointer press on a picker key leaves focus where it was, so ↵ right after a click still saves. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

/** "⌥K already opens **Name**.", with the name in bold. */
function ConflictText({ chord, name }: { chord: string; name: string }) {
  // A private-use character stands in for the name; Chrome's getMessage drops a NUL.
  const MARK = '\uE000';
  const [before = '', after = ''] = i18n.t('popup.conflict', [chord, MARK]).split(MARK);
  return (
    <p>
      {before}
      <strong className="font-semibold">{name}</strong>
      {after}
    </p>
  );
}

function Header({ onOpenKeymap }: { onOpenKeymap: () => void }) {
  return (
    <header className="flex items-center gap-2">
      <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-md bg-primary">
        <ZapIcon className="size-3.5 fill-primary-foreground text-primary-foreground" />
      </span>
      <h1 className="flex-1 font-bold text-md">{i18n.t('extName')}</h1>
      <Button variant="ghost" size="icon-xs" aria-label={i18n.t('popup.openKeymap')} onClick={onOpenKeymap}>
        <KeyboardIcon aria-hidden="true" className="size-4" />
      </Button>
    </header>
  );
}

function PageCard({ tab, model, platform }: { tab: PopupTab; model: PickerModel; platform: Platform }) {
  const icon = tab.favIconUrl === '' ? undefined : tab.favIconUrl;
  return (
    <section className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
      {model.usable ? (
        <Monogram shortcut={model.shortcut} src={icon} size="default" />
      ) : (
        <Avatar shape="square">
          {icon !== undefined && <AvatarImage src={icon} alt="" />}
          <AvatarFallback className="bg-muted text-muted-foreground">
            <BanIcon aria-hidden="true" className="size-4" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate font-semibold text-ui">{tab.title}</p>
        <p className="truncate text-2xs text-muted-foreground">{withoutScheme(tab.url)}</p>
        {!model.usable && <p className="text-2xs text-warning-foreground">{i18n.t('popup.unusable')}</p>}
        {model.usable && model.alreadyOn.length > 0 && (
          <p className="text-2xs text-link">
            {i18n.t('popup.alreadyOn', [model.alreadyOn.map((key) => chordLabel(key, platform)).join(', ')])}
          </p>
        )}
      </div>
    </section>
  );
}

function miniKeyState(label: KeyLabel, keymap: Keymap, picked: Key | null): KeyCapState {
  if (!isAssignable(label)) return 'reserved';
  if (label === picked) return 'picked';
  return keymap[label] === undefined ? 'free' : 'taken';
}

export function PopupPage({ actions, tabId, platform = PLATFORM }: PopupPageProps) {
  const tab = usePopupTab(tabId);
  const keymap = useKeymap();
  const [picked, setPicked] = useState<Key | null | undefined>(undefined);
  const [openMode, setOpenMode] = useState<OpenMode>(DEFAULT_OPEN_MODE);
  const [saving, setSaving] = useState(false);
  const [failedKey, setFailedKey] = useState<Key | null>(null);
  // A second ↵ can land before the re-render that disables everything.
  const inFlight = useRef(false);

  const model = tab === null || keymap === null ? null : pickerModel(keymap, tab, picked ?? null);
  const defaultKey = model?.usable ? model.defaultKey : null;

  // The default pick is made once, when the tab and the keymap have loaded; after that only the user picks.
  const loaded = model !== null;
  useEffect(() => {
    if (loaded && picked === undefined) setPicked(defaultKey);
  }, [loaded, picked, defaultKey]);

  const ready = model?.usable === true && !saving;
  const pickedState: PickedKey | null = model?.usable ? model.picked : null;

  const pick = (key: Key) => {
    if (!ready) return;
    setPicked(key);
    setFailedKey(null);
  };

  const save = async (resolve?: Resolve) => {
    if (!ready || pickedState === null || tab?.id === undefined || inFlight.current) return;
    const { key } = pickedState;
    inFlight.current = true;
    setSaving(true);
    setFailedKey(null);
    let reply: AssignPageReply;
    try {
      reply = await actions.assignPage({ key, tabId: tab.id, openMode, ...(resolve === undefined ? {} : { resolve }) });
    } catch (error) {
      console.error('SpeedLink: could not assign', key, error);
      reply = { kind: 'failed' };
    }
    if (reply.kind === 'saved') {
      actions.close();
      return;
    }
    inFlight.current = false;
    setSaving(false);
    // A conflict shows from the live keymap, which already has (or is about to get) the key's new holder.
    if (reply.kind !== 'conflict') setFailedKey(key);
  };

  const primaryResolve: Resolve | undefined = pickedState?.kind === 'conflict' ? 'replace' : undefined;
  const primaryEnabled = ready && pickedState !== null;

  const latest = useRef({ pick, save, primaryEnabled, primaryResolve });
  latest.current = { pick, save, primaryEnabled, primaryResolve };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const current = latest.current;
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.key === 'Enter') {
        if (onControl(event.target) || !current.primaryEnabled) return;
        event.preventDefault();
        void current.save(current.primaryResolve);
        return;
      }
      if (inSelect(event.target)) return;
      const key = keyFromCode(event.code);
      if (key !== null) current.pick(key);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const openKeymap = async () => {
    await actions.openOptions();
    actions.close();
  };

  if (tab === null || keymap === null || model === null) {
    return <main className="w-95 bg-background p-3" />;
  }

  const full = model.usable && model.full;
  const chips = model.usable ? model.chips : [];
  const pickedKey = pickedState?.key ?? null;
  const chord = pickedKey === null ? null : chordLabel(pickedKey, platform);
  const primaryLabel =
    chord === null
      ? i18n.t(full ? 'popup.replace' : 'popup.save')
      : i18n.t(primaryResolve === 'replace' ? 'popup.replaceKey' : 'popup.saveTo', [chord]);

  return (
    <main className="flex w-95 flex-col gap-2 bg-background p-3 text-foreground">
      <Header onOpenKeymap={() => void openKeymap()} />
      <PageCard tab={tab} model={model} platform={platform} />

      <section className="flex flex-col gap-1.5 rounded-xl border bg-card p-2.5">
        <p className="font-medium text-ui">{i18n.t(full ? 'popup.promptFull' : 'popup.prompt')}</p>
        <div
          data-testid="picked-key"
          className="flex h-13 items-center justify-center gap-2 rounded-lg border-2 border-primary/40 border-dashed bg-primary/7"
        >
          <span aria-hidden="true" className="font-semibold text-link text-md">
            {triggerPlus(platform)}
          </span>
          {pickedKey === null ? (
            <span aria-hidden="true" className="size-11 rounded-key border-2 border-input border-dashed" />
          ) : (
            <KeyCap
              size="xl"
              state="picked"
              label={pickedKey}
              platform={platform}
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none"
            />
          )}
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a fieldset of inputs */}
        <div
          role="group"
          aria-label={i18n.t('popup.fitting')}
          className={cn('flex items-center gap-1.5', chips.length === 0 && 'hidden')}
        >
          <span aria-hidden="true" className="text-2xs text-muted-foreground">
            {i18n.t('popup.fitting')}
          </span>
          {chips.map((key) => (
            <Button
              key={key}
              variant="outline"
              size="xs"
              aria-pressed={key === pickedKey}
              disabled={!ready}
              onMouseDown={keepFocus}
              onClick={() => pick(key)}
              className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {chordLabel(key, platform)}
            </Button>
          ))}
        </div>

        <KeyboardGrid
          size="sm"
          platform={platform}
          renderKey={(label) => (
            <KeyCap
              size="sm"
              label={label}
              platform={platform}
              state={miniKeyState(label, keymap, pickedKey)}
              name={isAssignable(label) ? keymap[label] && displayName(keymap[label]) : undefined}
              aria-pressed={isAssignable(label) ? label === pickedKey : undefined}
              disabled={!ready}
              onMouseDown={keepFocus}
              onClick={isAssignable(label) ? () => pick(label) : undefined}
            />
          )}
        />

        {pickedState?.kind === 'conflict' && chord !== null && (
          <Alert variant="warning" className="px-3 py-2 text-ui">
            <AlertDescription className="col-span-2 col-start-1 gap-1.5 text-ui">
              <ConflictText chord={chord} name={displayName(pickedState.existing)} />
              <div className="flex flex-wrap gap-1.5">
                <Button variant="warning-outline" size="xs" disabled={!ready} onClick={() => void save('replace')}>
                  {i18n.t('popup.replace')}
                </Button>
                {pickedState.moveTarget !== null && (
                  <Button variant="warning-outline" size="xs" disabled={!ready} onClick={() => void save('move')}>
                    {i18n.t('popup.moveTo', [chordLabel(pickedState.moveTarget, platform)])}
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </section>

      <div className="flex items-center justify-between gap-3">
        <span id="opens-as" className="font-medium text-ui">
          {i18n.t('popup.opensAs')}
        </span>
        <Select value={openMode} onValueChange={(value) => setOpenMode(value as OpenMode)} disabled={!ready}>
          <SelectTrigger size="sm" aria-labelledby="opens-as" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPEN_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {i18n.t(`options.openMode.${mode}.title`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          data-testid="primary"
          size="lg"
          variant={primaryResolve === 'replace' || full ? 'inverse' : 'default'}
          disabled={!primaryEnabled}
          onClick={() => void save(primaryResolve)}
          className="w-full font-semibold"
        >
          {primaryLabel}
        </Button>
        {failedKey !== null && (
          <Alert variant="destructive" className="px-3 py-2 text-ui">
            <AlertDescription className="col-span-2 col-start-1 text-ui">
              {i18n.t('pageToast.saveFailed', [chordLabel(failedKey, platform)])}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <footer className="text-center text-2xs text-muted-foreground">
        {i18n.t('popup.tip', [triggerSymbol(platform)])}
      </footer>
    </main>
  );
}
