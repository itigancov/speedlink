// Popup (product spec §7). On a page that can take a key: the tab's page card, the key picker, Opens as and the save.
// On one that can't (the new tab page, chrome://, the Web Store): a launcher, the overlay's tiles with a key press
// that opens. The popup never writes the keymap: the background assigns (§11.3) and opens (§4.1). Every view sits in
// the same frame: header bar, grey body, footer bar.
import { BanIcon, ChevronRightIcon } from 'lucide-react';
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/Brand';
import { KeyboardGrid } from '@/components/KeyboardGrid';
import { KeyCap, type KeyCapState } from '@/components/KeyCap';
import { Monogram } from '@/components/Monogram';
import { OverlayEmpty, OverlayTiles } from '@/components/OverlayTiles';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { keyFromCode, moveModel, type PickedKey, type PickerModel, pickerModel } from '@/domain/assign-picker';
import type { Keymap, Resolve } from '@/domain/keymap-ops';
import { isAssignable, type Key, type KeyLabel } from '@/domain/keys';
import { siteOf, withoutScheme } from '@/domain/link';
import type { OverlayModel } from '@/domain/overlay-model';
import { DEFAULT_OPEN_MODE, displayName, OPEN_MODES, type OpenMode } from '@/domain/shortcut';
import { tabMatches } from '@/domain/tab-match';
import { useKeymap } from '@/hooks/use-keymap';
import type { AssignPageReply, EditOp, EditShortcutReply, OpenKeyReply, UndoReply } from '@/platform/messaging';
import { chordLabel, PLATFORM, type Platform, triggerPlus, triggerSymbol } from '@/platform/platform-labels';
import type { PopupTab } from '@/platform/tabs';
import { usePopupTab } from './use-popup-tab';

export interface PopupActions {
  assignPage(request: { key: Key; tabId: number; openMode: OpenMode; resolve?: Resolve }): Promise<AssignPageReply>;
  /** The key card's edits of the shortcut on `key`: Opens as, Remove, Move, Use this exact page. */
  editShortcut(request: { key: Key; tabId: number; op: EditOp }): Promise<EditShortcutReply>;
  /** The inline Undo after a Remove. */
  undo(id: string): Promise<UndoReply>;
  openOptions(): Promise<void>;
  close(): void;
  /** The launcher: open a key from the tab the popup came from; `force` is Force new tab. */
  openKey(request: { key: Key; tabId: number; force: boolean }): Promise<OpenKeyReply>;
  /** The launcher's tiles, for that tab. */
  getOverlayModel(tabId: number): Promise<OverlayModel>;
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

// A private-use character stands in for a node inside a message; Chrome's getMessage drops a NUL.
const MARK = '\uE000';

/** A message built with `MARK` as one argument, split around it so a node can sit inside the sentence. */
function splitAround(message: string): [string, string] {
  const [before = '', after = ''] = message.split(MARK);
  return [before, after];
}

/** "⌥K already opens **Name**.", with the name in bold. */
function ConflictText({ chord, name }: { chord: string; name: string }) {
  const [before, after] = splitAround(i18n.t('popup.conflict', [chord, MARK]));
  return (
    <p>
      {before}
      <strong className="font-semibold">{name}</strong>
      {after}
    </p>
  );
}

async function openKeymap(actions: PopupActions) {
  await actions.openOptions();
  actions.close();
}

/** The footer's link to the full keymap. */
function OpenKeymapLink({ actions }: { actions: PopupActions }) {
  return (
    <Button variant="link" size="xs" className="ml-auto px-0" onClick={() => void openKeymap(actions)}>
      {i18n.t('popup.openKeymapLink')}
    </Button>
  );
}

/** "Hold ⌥ to see all keys", with the ⌥ as a key. */
function PeekTip({ platform }: { platform: Platform }) {
  const [before, after] = splitAround(i18n.t('popup.tip', [MARK]));
  return (
    <p className="text-2xs text-muted-foreground">
      {before}
      <Kbd>{triggerSymbol(platform)}</Kbd>
      {after}
    </p>
  );
}

/** The assign view's footer, also drawn while it loads. */
function AssignFooter({ actions, platform }: { actions: PopupActions; platform: Platform }) {
  return (
    <>
      <PeekTip platform={platform} />
      <OpenKeymapLink actions={actions} />
    </>
  );
}

/**
 * The frame of every popup view: a white header bar with the brand, the grey scrolling body and a white footer bar.
 * `footer` is what the view puts in the bar.
 */
function PopupShell({ footer, children }: { footer: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex w-95 flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-border-subtle border-b bg-card px-4 py-3">
        <BrandMark />
        <h1 className="font-bold text-md">{i18n.t('extName')}</h1>
      </header>
      <div className="flex max-h-125 min-h-24 flex-col gap-2 overflow-y-auto p-3">{children}</div>
      <footer className="flex items-center gap-2 border-border-subtle border-t bg-card px-4 py-2">{footer}</footer>
    </main>
  );
}

function PageCard({
  tab,
  model,
  platform,
  showAlreadyOn,
}: {
  tab: PopupTab;
  model: PickerModel;
  platform: Platform;
  /** The line is for the picker only: the key card says which key the page is on. */
  showAlreadyOn: boolean;
}) {
  return (
    <section className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
      {model.usable ? (
        <Monogram shortcut={model.shortcut} size="md" />
      ) : (
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <BanIcon aria-hidden="true" className="size-4" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate font-semibold text-ui">{tab.title}</p>
        <p className="truncate text-2xs text-muted-foreground">{withoutScheme(tab.url)}</p>
        {!model.usable && <p className="text-2xs text-warning-foreground">{i18n.t('popup.unusable')}</p>}
        {showAlreadyOn && model.usable && model.alreadyOn.length > 0 && (
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

interface ViewProps {
  actions: PopupActions;
  tab: PopupTab;
  keymap: Keymap;
  platform: Platform;
}

interface AssignViewProps extends ViewProps {
  /** Move mode: the picker looks for a new key for the shortcut on `from`, instead of assigning the page. */
  move?: { from: Key };
  /** Back to the key card (move mode, and "Put it on another key too"). */
  onCancel?: () => void;
}

/** The picker: the prompt, drop zone, chips or keyboard, conflict alert and the save row. The body of the popup shell. */
function AssignView({ actions, tab, keymap, platform, move, onCancel }: AssignViewProps) {
  const [picked, setPicked] = useState<Key | null | undefined>(undefined);
  const [openMode, setOpenMode] = useState<OpenMode>(DEFAULT_OPEN_MODE);
  const [saving, setSaving] = useState(false);
  const [failedKey, setFailedKey] = useState<Key | null>(null);
  // A second ↵ can land before the re-render that disables everything.
  const inFlight = useRef(false);

  const model = pickerModel(keymap, tab, picked ?? null);
  const moving = move === undefined ? null : moveModel(keymap, move.from, picked ?? null);
  const chips = moving !== null ? moving.chips : model.usable ? model.chips : [];
  // The mini keyboard shows from the start only when there are no chips; after that only the toggle changes it.
  const [keyboardChosen, setKeyboardChosen] = useState(chips.length === 0);
  const defaultKey = moving !== null ? moving.defaultKey : model.usable ? model.defaultKey : null;

  // The default pick is made once, on the first render; after that only the user picks.
  useEffect(() => {
    if (picked === undefined) setPicked(defaultKey);
  }, [picked, defaultKey]);

  const ready = (move === undefined ? model.usable : moving !== null) && !saving;
  const pickedState: PickedKey | null = moving !== null ? moving.picked : model.usable ? model.picked : null;

  const pick = (key: Key) => {
    // The source of a move is taken: a press on it is ignored.
    if (!ready || key === move?.from) return;
    setPicked(key);
    setFailedKey(null);
  };

  const save = async (resolve?: Resolve) => {
    if (!ready || pickedState === null || tab.id === undefined || inFlight.current) return;
    const { key } = pickedState;
    inFlight.current = true;
    setSaving(true);
    setFailedKey(null);
    let reply: AssignPageReply | EditShortcutReply;
    try {
      reply =
        move === undefined
          ? await actions.assignPage({
              key,
              tabId: tab.id,
              openMode,
              ...(resolve === undefined ? {} : { resolve }),
            })
          : await actions.editShortcut({
              key: move.from,
              tabId: tab.id,
              op: { kind: 'move', to: key, ...(resolve === 'replace' ? { resolve } : {}) },
            });
    } catch (error) {
      console.error('SpeedLink: could not save', key, error);
      reply = { kind: 'failed' };
    }
    if (reply.kind === 'saved') {
      actions.close();
      return;
    }
    inFlight.current = false;
    setSaving(false);
    // A conflict shows from the live keymap, which already has (or is about to get) the key's new holder; a free
    // source key redraws from it too.
    if (reply.kind !== 'conflict' && reply.kind !== 'missing') setFailedKey(key);
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

  const full = moving !== null ? moving.defaultKey === null : model.usable && model.full;
  // Chips that vanish (the keymap filled up) leave nothing to toggle back to.
  const showKeyboard = keyboardChosen || chips.length === 0;
  const pickedKey = pickedState?.key ?? null;
  const chord = pickedKey === null ? null : chordLabel(pickedKey, platform);
  const primaryLabel =
    chord === null
      ? i18n.t(full ? 'popup.replace' : 'popup.save')
      : i18n.t(
          primaryResolve === 'replace' ? 'popup.replaceKey' : move === undefined ? 'popup.saveTo' : 'popup.moveKey',
          [chord],
        );

  return (
    <>
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-ui">
            {full
              ? i18n.t('popup.promptFull')
              : move === undefined
                ? i18n.t('popup.prompt')
                : i18n.t('popup.promptMove', [chordLabel(move.from, platform)])}
          </p>
          {onCancel !== undefined && (
            <Button variant="link" size="xs" className="px-0" onClick={onCancel}>
              {i18n.t('popup.cancel')}
            </Button>
          )}
        </div>
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

        {chips.length > 0 && (
          <div className="flex items-center gap-1.5">
            {!showKeyboard && (
              // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a fieldset of inputs
              <div role="group" aria-label={i18n.t('popup.fitting')} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="text-2xs text-muted-foreground">
                  {i18n.t('popup.fitting')}
                </span>
                {chips.map((key) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="xs"
                    aria-label={chordLabel(key, platform)}
                    aria-pressed={key === pickedKey}
                    disabled={!ready}
                    onMouseDown={keepFocus}
                    onClick={() => pick(key)}
                    className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                  >
                    {key}
                  </Button>
                ))}
              </div>
            )}
            <Button
              variant="link"
              size="xs"
              aria-expanded={showKeyboard}
              onMouseDown={keepFocus}
              onClick={() => setKeyboardChosen(!showKeyboard)}
              className="ml-auto px-0"
            >
              {i18n.t(showKeyboard ? 'popup.hideKeyboard' : 'popup.showKeyboard')}
            </Button>
          </div>
        )}

        {showKeyboard && (
          <KeyboardGrid
            size="sm"
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
        )}

        {pickedState?.kind === 'conflict' && chord !== null && (
          <Alert variant="warning" className="px-3 py-2 text-ui">
            <AlertDescription className="col-span-2 col-start-1 gap-1.5 text-ui">
              <ConflictText chord={chord} name={displayName(pickedState.existing)} />
              {pickedState.moveTarget !== null && (
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="warning-outline"
                    size="xs"
                    disabled={!ready}
                    onMouseDown={keepFocus}
                    onClick={() => void save('move')}
                  >
                    {i18n.t('popup.moveTo', [chordLabel(pickedState.moveTarget, platform)])}
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {move === undefined && (
            <Select value={openMode} onValueChange={(value) => setOpenMode(value as OpenMode)} disabled={!ready}>
              <SelectTrigger
                size="lg"
                aria-label={i18n.t('popup.opensAsMode', [i18n.t(`options.openMode.${openMode}.title`)])}
                className="rounded-key bg-card font-medium text-ui"
              >
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
          )}
          <Button
            data-testid="primary"
            size="xl"
            variant={primaryResolve === 'replace' || full ? 'inverse' : 'default'}
            disabled={!primaryEnabled}
            onClick={() => void save(primaryResolve)}
            className="flex-1 font-semibold"
          >
            {primaryLabel}
          </Button>
        </div>
        {failedKey !== null && (
          <Alert variant="destructive" className="px-3 py-2 text-ui">
            <AlertDescription className="col-span-2 col-start-1 text-ui">
              {i18n.t('pageToast.saveFailed', [chordLabel(failedKey, platform)])}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}

/** A card's action row: full width, label left, whatever trails it right. */
const ROW = 'h-auto w-full justify-between rounded-none border-border-subtle border-t px-3 py-2.5 font-medium text-ui';

interface KeyCardProps extends ViewProps {
  /** The key whose card shows; it holds a shortcut matching this tab. */
  cardKey: Key;
  onMove(): void;
  onAlsoOnAnother(): void;
  /** A Remove was saved; `undo` is the record to offer inline. */
  onRemoved(key: Key, undo: { id: string; expiresAt: number }): void;
  /** Another write from the popup was saved, so an earlier inline Undo no longer applies. */
  onWrote(): void;
}

/**
 * The key card (product spec §7): the page is already on `cardKey`, so the popup manages that key instead of adding
 * another. Every action is an `editShortcut` to the background; the card itself follows the live keymap.
 */
function KeyCard({
  actions,
  tab,
  keymap,
  platform,
  cardKey,
  onMove,
  onAlsoOnAnother,
  onRemoved,
  onWrote,
}: KeyCardProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const shortcut = keymap[cardKey];
  if (shortcut === undefined) return null;
  const chord = chordLabel(cardKey, platform);

  const run = async (op: EditOp): Promise<EditShortcutReply | null> => {
    if (inFlight.current || tab.id === undefined) return null;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    let reply: EditShortcutReply;
    try {
      reply = await actions.editShortcut({ key: cardKey, tabId: tab.id, op });
    } catch (error) {
      console.error('SpeedLink: could not edit', cardKey, error);
      reply = { kind: 'failed' };
    }
    inFlight.current = false;
    setBusy(false);
    // A key that is free now redraws from the live keymap, without a message.
    if (reply.kind !== 'saved' && reply.kind !== 'missing') setFailed(true);
    return reply;
  };

  const write = async (op: EditOp) => {
    const reply = await run(op);
    if (reply?.kind === 'saved') onWrote();
  };

  const remove = async () => {
    const reply = await run({ kind: 'remove' });
    if (reply?.kind === 'saved' && reply.undo !== undefined) onRemoved(cardKey, reply.undo);
  };

  const exact = !tabMatches(tab.url, shortcut.link, 'exact');
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 p-3">
        <span
          aria-hidden="true"
          data-slot="key-tile"
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-key border border-primary/20 bg-primary/7 font-bold text-link text-md"
        >
          {chord}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-semibold text-md">{i18n.t('popup.thisPageOn', [chord])}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {i18n.t('popup.savedAs', [displayName(shortcut), siteOf(shortcut.link)])}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-border-subtle border-t px-3 py-2">
        <span aria-hidden="true" className="font-medium text-ui">
          {i18n.t('popup.opensAs')}
        </span>
        <Select
          value={shortcut.openMode}
          onValueChange={(value) => void write({ kind: 'openMode', openMode: value as OpenMode })}
          disabled={busy}
        >
          <SelectTrigger
            size="sm"
            aria-label={i18n.t('popup.opensAsMode', [i18n.t(`options.openMode.${shortcut.openMode}.title`)])}
            className="bg-card font-medium text-ui"
          >
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

      <Button variant="ghost" className={ROW} disabled={busy} onClick={onMove}>
        {i18n.t('popup.moveToAnother')}
        <ChevronRightIcon aria-hidden="true" className="text-muted-foreground" />
      </Button>
      {exact && (
        <Button variant="ghost" className={ROW} disabled={busy} onClick={() => void write({ kind: 'exactPage' })}>
          {i18n.t('popup.useExactPage')}
          <span className="min-w-0 truncate font-normal text-2xs text-muted-foreground">{withoutScheme(tab.url)}</span>
        </Button>
      )}
      <Button variant="destructive-ghost" className={ROW} disabled={busy} onClick={() => void remove()}>
        {i18n.t('popup.removeFrom', [chord])}
      </Button>

      {failed && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-b-0 px-3 py-2 text-ui">
          <AlertDescription className="col-span-2 col-start-1 text-ui">
            {i18n.t('pageToast.saveFailed', [chord])}
          </AlertDescription>
        </Alert>
      )}
      <div className="border-border-subtle border-t px-3 py-1.5">
        <Button variant="link" size="xs" className="px-0" disabled={busy} onClick={onAlsoOnAnother}>
          {i18n.t('popup.putOnAnother')}
        </Button>
      </div>
    </section>
  );
}

/** The keys a page is on, to switch between their cards; named by their chord, the shown one pressed. */
function KeyChips({
  keys,
  current,
  platform,
  onPick,
}: {
  keys: readonly Key[];
  current: Key;
  platform: Platform;
  onPick: (key: Key) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a fieldset of inputs
    <div role="group" aria-label={i18n.t('popup.keysForThisPage')} className="flex items-center gap-1.5">
      {keys.map((key) => (
        <Button
          key={key}
          variant="outline"
          size="xs"
          aria-label={chordLabel(key, platform)}
          aria-pressed={key === current}
          onClick={() => onPick(key)}
          className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {chordLabel(key, platform)}
        </Button>
      ))}
    </div>
  );
}

/** The inline Undo after a Remove: "Removed from ⌥G · Undo", or why the Undo was refused. */
interface RemovedLine {
  key: Key;
  undo: { id: string; expiresAt: number };
  status: 'ready' | 'working' | 'refused';
}

/** Which part of the popup the user is in; the key card is the default whenever the page is on a key. */
type Mode = { kind: 'auto' } | { kind: 'too' } | { kind: 'move'; from: Key };

/**
 * The popup on a page that can take a key. On a page already on a key it shows the key card (`auto`), and from
 * there move mode or the picker for "Put it on another key too"; on one that is on no key, the picker. All of it is
 * local view state over the live keymap, never stored.
 */
function KeyFlow({ actions, tab, keymap, platform }: ViewProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'auto' });
  const [chosen, setChosen] = useState<Key | null>(null);
  const [removed, setRemoved] = useState<RemovedLine | null>(null);

  const model = pickerModel(keymap, tab, null);
  const alreadyOn = model.usable ? model.alreadyOn : [];
  const cardKey = chosen !== null && alreadyOn.includes(chosen) ? chosen : (alreadyOn[0] ?? null);
  const view =
    cardKey === null
      ? 'picker'
      : mode.kind === 'move' && keymap[mode.from] !== undefined
        ? 'move'
        : mode.kind === 'too'
          ? 'too'
          : 'card';

  const expiresAt = removed?.undo.expiresAt;
  // The record lapses at `expiresAt`: from then on the line would offer an Undo that comes back stale.
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = setTimeout(() => setRemoved(null), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const undoRemove = async () => {
    if (removed === null || removed.status !== 'ready') return;
    const { id } = removed.undo;
    setRemoved({ ...removed, status: 'working' });
    let reply: UndoReply;
    try {
      reply = await actions.undo(id);
    } catch (error) {
      console.error('SpeedLink: could not undo', error);
      reply = { kind: 'failed' };
    }
    if (reply.kind === 'undone') {
      setChosen(removed.key);
      setRemoved(null);
      setMode({ kind: 'auto' });
    } else {
      setRemoved((current) => (current?.undo.id === id ? { ...current, status: 'refused' } : current));
    }
  };

  const back = () => setMode({ kind: 'auto' });
  return (
    <PopupShell footer={<AssignFooter actions={actions} platform={platform} />}>
      <PageCard tab={tab} model={model} platform={platform} showAlreadyOn={view === 'too'} />

      {removed !== null && (
        <p role="status" className="flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-ui">
          {removed.status === 'refused' ? (
            i18n.t('pageToast.undoStale')
          ) : (
            <>
              {i18n.t('popup.removedFrom', [chordLabel(removed.key, platform)])}
              {' · '}
              <Button
                variant="link"
                size="xs"
                className="px-0"
                disabled={removed.status === 'working'}
                onClick={() => void undoRemove()}
              >
                {i18n.t('popup.undo')}
              </Button>
            </>
          )}
        </p>
      )}

      {view === 'card' && cardKey !== null && (
        <>
          {alreadyOn.length > 1 && (
            <KeyChips keys={alreadyOn} current={cardKey} platform={platform} onPick={setChosen} />
          )}
          <KeyCard
            key={cardKey}
            actions={actions}
            tab={tab}
            keymap={keymap}
            platform={platform}
            cardKey={cardKey}
            onMove={() => setMode({ kind: 'move', from: cardKey })}
            onAlsoOnAnother={() => setMode({ kind: 'too' })}
            onRemoved={(key, undo) => {
              setRemoved({ key, undo, status: 'ready' });
              setMode({ kind: 'auto' });
            }}
            onWrote={() => setRemoved(null)}
          />
        </>
      )}
      {view === 'move' && mode.kind === 'move' && (
        <AssignView
          key={`move-${mode.from}`}
          actions={actions}
          tab={tab}
          keymap={keymap}
          platform={platform}
          move={{ from: mode.from }}
          onCancel={back}
        />
      )}
      {(view === 'picker' || view === 'too') && (
        <AssignView
          key={view}
          actions={actions}
          tab={tab}
          keymap={keymap}
          platform={platform}
          onCancel={view === 'too' ? back : undefined}
        />
      )}
    </PopupShell>
  );
}

/** What the launcher says about the key it just tried: it holds nothing, or opening it failed. */
interface LauncherNotice {
  kind: 'free' | 'failed';
  key: Key;
}

/**
 * The popup on a page that can't take a key (§7): the overlay's tiles for that tab, and a key press opens. A bare key,
 * ⌥ + key (muscle memory) and a click all open; ⇧ is Force new tab. `event.code`, so the layout doesn't matter.
 */
function Launcher({ actions, tab, keymap, platform }: ViewProps) {
  const [model, setModel] = useState<OverlayModel | null>(null);
  const [notice, setNotice] = useState<LauncherNotice | null>(null);
  const inFlight = useRef(false);
  const tabId = tab.id;

  // The keymap is a dependency only to read the tiles again when it changes while the popup is open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (tabId === undefined) return;
    let live = true;
    actions
      .getOverlayModel(tabId)
      .then((read) => {
        if (live) setModel(read);
      })
      .catch((error: unknown) => console.error('SpeedLink: no keys for the popup', error));
    return () => {
      live = false;
    };
  }, [actions, tabId, keymap]);

  const open = async (key: Key, force: boolean) => {
    if (tabId === undefined || inFlight.current) return;
    inFlight.current = true;
    setNotice(null);
    let reply: OpenKeyReply;
    try {
      reply = await actions.openKey({ key, tabId, force });
    } catch (error) {
      console.error('SpeedLink: could not open', key, error);
      reply = { kind: 'failed' };
    }
    inFlight.current = false;
    if (reply.kind === 'opened' || reply.kind === 'noop') return actions.close();
    setNotice({ kind: reply.kind, key });
  };

  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.isComposing) return;
      const key = keyFromCode(event.code);
      if (key === null) return;
      event.preventDefault();
      void latest.current(key, event.shiftKey);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const empty = model !== null && model.tiles.length === 0;
  return (
    <PopupShell footer={<OpenKeymapLink actions={actions} />}>
      <section className="rounded-xl border bg-card p-2.5">
        <p className="text-2xs text-warning-foreground">{i18n.t('popup.unusable')}</p>
      </section>
      {model !== null &&
        (empty ? (
          <OverlayEmpty onOpenKeymap={() => void openKeymap(actions)} />
        ) : (
          <OverlayTiles
            tiles={model.tiles}
            platform={platform}
            onOpen={(key, force) => void open(key, force)}
            className="max-h-96 grid-cols-2"
          />
        ))}
      {notice?.kind === 'free' && (
        <p role="status" className="text-center text-muted-foreground text-ui">
          {i18n.t('popup.keyFree', [chordLabel(notice.key, platform)])}
        </p>
      )}
      {notice?.kind === 'failed' && (
        <Alert variant="destructive" className="px-3 py-2 text-ui">
          <AlertDescription className="col-span-2 col-start-1 text-ui">
            {i18n.t('popup.openFailed', [chordLabel(notice.key, platform)])}
          </AlertDescription>
        </Alert>
      )}
    </PopupShell>
  );
}

export function PopupPage({ actions, tabId, platform = PLATFORM }: PopupPageProps) {
  const tab = usePopupTab(tabId);
  const keymap = useKeymap();
  if (tab === null || keymap === null) {
    return <PopupShell footer={<AssignFooter actions={actions} platform={platform} />} />;
  }

  // A page that can't go on a key has nothing to assign; it gets the launcher (§7).
  const View = pickerModel(keymap, tab, null).usable ? KeyFlow : Launcher;
  return <View actions={actions} tab={tab} keymap={keymap} platform={platform} />;
}
