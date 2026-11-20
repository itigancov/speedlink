// Options · Keymap (product spec §8): the `/` search, the Keyboard or List view and the selected key's editor dialog.
import { cn } from 'cn';
import { SearchIcon } from 'lucide-react';
import { type KeyboardEvent, type Ref, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Brand } from '@/components/Brand';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipProvider } from '@/components/ui/tooltip';
import { checkDraft } from '@/domain/key-draft';
import { pageKeyDecision } from '@/domain/keydown';
import { clear, dropChange, type Keymap } from '@/domain/keymap-ops';
import { KEYBOARD_ORDER, type Key } from '@/domain/keys';
import { enterTarget, searchKeymap } from '@/domain/search';
import { type Shortcut, validateShortcut } from '@/domain/shortcut';
import { isOpenNow, pageTitleFor } from '@/domain/tab-match';
import { useAutosave } from '@/hooks/use-autosave';
import { useFitsWidth } from '@/hooks/use-fits-width';
import { useKeymap } from '@/hooks/use-keymap';
import { lastWebTab, useOpenTabs } from '@/hooks/use-open-tabs';
import { useOverlayCommandBound } from '@/hooks/use-overlay-command-bound';
import { usePageKeys } from '@/hooks/use-page-keys';
import { openShortcutSettings, SEARCH_HASH, SHORTCUT_SETTINGS } from '@/platform/commands';
import { isEditableTarget, keyInput } from '@/platform/key-capture';
import { readKeymap, writeChange } from '@/platform/keymap-store';
import { sendMessage } from '@/platform/messaging';
import { chordLabel, triggerLabel, triggerPlusKey } from '@/platform/platform-labels';
import { KeyboardCard, type KeyCapsHandle, LG_KEYBOARD_CARD_WIDTH } from './KeyboardCard';
import { EDITOR_PANEL, KeyEditor } from './KeyEditor';
import { ListCard } from './ListCard';
import { hashFor, useKeyEditor } from './use-key-editor';

type View = 'keyboard' | 'list';

/** Where focus goes once the dialog, or its new key, has rendered. */
type FocusTo = 'link' | 'dialog';

interface SearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
}

/** `holdHint` is off in a narrow window, where the header has no room for it. */
function Header({ search, holdHint = true }: { search: SearchProps; holdHint?: boolean }) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b bg-card px-8 py-3.5">
      <Brand />
      <InputGroup className="h-11 max-w-md flex-1 basis-64">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={search.inputRef}
          type="search"
          aria-label={i18n.t('options.search.label')}
          placeholder={i18n.t('options.search.placeholder')}
          value={search.query}
          onChange={(event) => search.onQueryChange(event.target.value)}
          onKeyDown={search.onKeyDown}
        />
        <InputGroupAddon align="inline-end">
          <Kbd>/</Kbd>
        </InputGroupAddon>
      </InputGroup>
      {holdHint && (
        <p className="ml-auto flex items-center gap-1.5 text-muted-foreground text-ui">
          {i18n.t('options.holdHint.before')} <Kbd>{triggerLabel()}</Kbd> {i18n.t('options.holdHint.after')}
        </p>
      )}
    </header>
  );
}

function focusSearch(input: RefObject<HTMLInputElement | null>) {
  input.current?.focus();
  input.current?.select();
}

/**
 * `/` anywhere on the page, outside a field and without ⌘, Ctrl or ⌥, jumps to the search and selects its text. With
 * the dialog open it does nothing: the search is behind the scrim.
 */
function useSlashFocus(input: RefObject<HTMLInputElement | null>, dialogOpen: RefObject<boolean>) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        dialogOpen.current ||
        event.key !== '/' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.composedPath()[0])
      )
        return;
      event.preventDefault();
      focusSearch(input);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [input, dialogOpen]);
}

/**
 * `#search` (the page opened on it, or `toggle-overlay` sent this tab there, §5.3) focuses the search as `/` does,
 * without a reload, and gives the hash back to the selected key (or none), so the next `#search` is a hash change
 * again. With the dialog open, the search is behind the scrim, so focus stays in the dialog.
 */
function useSearchHash(input: RefObject<HTMLInputElement | null>, selected: Key | null) {
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // Read while rendering: the key editor's effect has rewritten the hash by the time effects run.
  const [openedOnSearch] = useState(() => window.location.hash === SEARCH_HASH);
  useEffect(() => {
    const go = () => {
      window.history.replaceState(window.history.state, '', hashFor(selectedRef.current));
      if (selectedRef.current === null) focusSearch(input);
    };
    if (openedOnSearch) go();
    const onHashChange = () => {
      if (window.location.hash === SEARCH_HASH) go();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [input, openedOnSearch]);
}

/** The quiet line while `toggle-overlay` has no key (an update from v1): where to set ⌥S (§5.3). */
function CommandHint() {
  const bound = useOverlayCommandBound();
  if (bound !== false) return null;
  return (
    <p className="text-muted-foreground text-ui">
      <a
        href={SHORTCUT_SETTINGS}
        onClick={(event) => {
          event.preventDefault();
          openShortcutSettings().catch((error: unknown) =>
            console.error('SpeedLink: could not open the shortcut settings', error),
          );
        }}
        className="rounded-sm text-link outline-none hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {i18n.t('options.commandHint', [chordLabel('S')])}
      </a>
    </p>
  );
}

function KeymapView({ keymap }: { keymap: Keymap }) {
  const [view, setView] = useState<View>('keyboard');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<KeyCapsHandle>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /** One measure of the keys card: the lg keyboard fits, or Options draws compact keys and drops the header hint. */
  const roomy = useFitsWidth(cardRef, LG_KEYBOARD_CARD_WIDTH);
  const listRef = useRef<KeyCapsHandle>(null);
  /**
   * Where focus goes once the dialog, or its new key, has rendered: Link after ↵ from the search, ⌥ + a free key or a
   * bare free key; the dialog after a bare assigned key or a ⌘V that opened it. Null: the dialog opens as on a click.
   */
  const focusNext = useRef<FocusTo | null>(null);
  const focusRef = (focus: FocusTo | undefined) =>
    focus === 'link' ? linkRef : focus === 'dialog' ? dialogRef : undefined;
  /** A keyboard drag is under way: bare keys leave it alone. */
  const dragging = useRef(false);
  /** The key the dialog was last open on: focus goes back to it on close. */
  const lastKey = useRef<Key | null>(null);
  const tabs = useOpenTabs();
  const editor = useKeyEditor(keymap);
  const { key, draft, stored } = editor;
  const dialogOpen = useRef(false);
  dialogOpen.current = key !== null;
  useSlashFocus(searchRef, dialogOpen);
  useSearchHash(searchRef, key);
  /**
   * Name from an open tab's title (§8.3), at the settle point so a link typed letter by letter fills it once: only
   * for a new link, while Name is empty and wasn't edited in the dialog session, and from tabs in normal,
   * non-incognito windows.
   */
  const fillNameFromTab = (written: Key, shortcut: Shortcut): Shortcut => {
    if (shortcut.name !== undefined || shortcut.link === keymap[written]?.link || editor.nameEdited(written))
      return shortcut;
    const title = pageTitleFor(tabs ?? [], shortcut.link);
    const named = title === undefined ? null : validateShortcut({ ...shortcut, name: title });
    if (named === null || !named.ok || named.value.name === undefined) return shortcut;
    editor.fillName(written, named.value.name);
    return named.value;
  };
  const autosave = useAutosave({ key, draft, stored, beforeWrite: fillNameFromTab });

  /**
   * Selects a key, which opens its dialog over the current view; a pending draft is settled as on any key switch.
   * Without `focus`, the dialog opens as on a click: Link for a free key, the dialog for an assigned one.
   */
  const openAt = (target: Key, focus?: FocusTo) => {
    editor.select(target);
    // The key already open renders nothing new, so no effect would move focus: move it now.
    if (target === key) focusRef(focus)?.current?.focus();
    else focusNext.current = focus ?? null;
  };
  usePageKeys({
    keymap,
    onFree: (free) => openAt(free, 'link'),
    onReserved: () => {
      if (!dialogOpen.current) focusSearch(searchRef);
    },
  });

  useEffect(() => {
    if (key !== null) lastKey.current = key;
  }, [key]);
  useEffect(() => {
    const target = focusRef(focusNext.current ?? undefined);
    if (target?.current == null) return;
    focusNext.current = null;
    target.current.focus();
  });

  // The page's keyboard (§8.2): on the document, so presses and pastes from inside the dialog reach it too.
  const latest = useRef({ key, keymap, view, openAt, pasteLink: editor.pasteLink });
  latest.current = { key, keymap, view, openAt, pasteLink: editor.pasteLink };
  useEffect(() => {
    // A bare letter or digit opens its key's dialog, or switches the open dialog to it.
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const { key: selected, keymap: live, openAt: open } = latest.current;
      const decision = pageKeyDecision(keyInput(event), { selected, dragActive: dragging.current });
      if (decision.kind === 'ignore') return;
      event.preventDefault();
      open(decision.key, live[decision.key] === undefined ? 'link' : 'dialog');
    };
    // ⌘V / Ctrl+V outside a field puts the copied link on the dialog's key, or on the focused key with the dialog
    // closed. Only plain text is read, from the event: no clipboard permission.
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.composedPath()[0])) return;
      const text = event.clipboardData?.getData('text/plain').trim() ?? '';
      if (text === '') return;
      const { key: selected, view: shown, pasteLink } = latest.current;
      const target = selected ?? (shown === 'list' ? listRef : keyboardRef).current?.focusedKey() ?? null;
      if (target === null) return;
      event.preventDefault();
      if (selected === null) focusNext.current = 'dialog';
      pasteLink(target, text);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  const openKeys = useMemo(() => {
    const urls = (tabs ?? []).map((tab) => tab.url);
    return new Set(
      KEYBOARD_ORDER.filter((k) => {
        const shortcut = keymap[k];
        return shortcut !== undefined && isOpenNow(shortcut, urls);
      }),
    );
  }, [keymap, tabs]);
  const matches = useMemo(
    () => (query.trim() === '' ? null : new Set(searchKeymap(keymap, query, 'options'))),
    [keymap, query],
  );
  const webTab = tabs === null ? undefined : lastWebTab(tabs);
  const used = Object.keys(keymap).length;

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = enterTarget(keymap, query, { assignedOnly: view === 'list' });
      if (target !== null) openAt(target, 'link');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (query === '') event.currentTarget.blur();
      else setQuery('');
    }
  };

  const onClear = (cleared: Key) => {
    autosave.cancel();
    const change = clear(keymap, cleared);
    const marked = editor.markCleared();
    void writeChange(change).then((result) => {
      if (result.ok) return;
      console.error('SpeedLink: could not clear', cleared, result.error);
      marked.failed();
    });
  };

  // A drop (product spec §8.7) happens with the dialog closed and leaves nothing selected. A draft is still settled
  // first, and the change is built from storage after that, since the rendered keymap may not have the flushed
  // write yet.
  const onDrop = async (from: Key, to: Key) => {
    if (key !== null && autosave.state === 'invalid') editor.reselect(key);
    await autosave.flush();
    const change = dropChange(await readKeymap(), from, to);
    if (change === null) return;
    const result = await writeChange(change);
    if (!result.ok) console.error('SpeedLink: could not drop', from, to, result.error);
  };

  const onTest = async (tested: Key) => {
    await autosave.flush();
    try {
      const reply = await sendMessage('tryKey', { key: tested });
      if (reply.kind === 'failed') console.error('SpeedLink: Test could not open', tested);
    } catch (error) {
      console.error('SpeedLink: Test could not reach the background', tested, error);
    }
  };

  const dirty = draft !== null && checkDraft(draft, stored).kind !== 'same';

  return (
    <>
      <Header
        search={{ query, onQueryChange: setQuery, onKeyDown: onSearchKeyDown, inputRef: searchRef }}
        holdHint={roomy}
      />
      <main className="mx-auto flex max-w-280 flex-col gap-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-bold text-3xl tracking-tight">{i18n.t('options.heading')}</h1>
            <p className="text-muted-foreground text-sm">
              {i18n.t('options.subline.before')} <strong className="text-foreground">{triggerPlusKey()}</strong>{' '}
              {i18n.t('options.subline.after')} {i18n.t('options.subline.used', [used])}
            </p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={i18n.t('options.view.label')}
            value={view}
            onValueChange={(value) => {
              if (value !== '') setView(value as View);
            }}
            className="bg-card"
          >
            <ToggleGroupItem value="keyboard">{i18n.t('options.view.keyboard')}</ToggleGroupItem>
            <ToggleGroupItem value="list">{i18n.t('options.view.list')}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div ref={cardRef}>
          {view === 'keyboard' ? (
            <KeyboardCard
              ref={keyboardRef}
              size={roomy ? 'lg' : 'compact'}
              keymap={keymap}
              openKeys={openKeys}
              selected={key}
              matches={matches}
              onSelect={(clicked) => openAt(clicked)}
              onDrop={(from, to) => void onDrop(from, to)}
              onDragActiveChange={(active) => {
                dragging.current = active;
              }}
            />
          ) : (
            <ListCard
              ref={listRef}
              keymap={keymap}
              openKeys={openKeys}
              selected={key}
              matches={matches}
              onSelect={(row) => openAt(row)}
            />
          )}
        </div>
        <CommandHint />
      </main>
      {/* The key editor (§8.3): modal, so a key is chosen with the dialog closed and the page waits behind it. */}
      <Dialog
        open={key !== null}
        onOpenChange={(open) => {
          if (!open) editor.close();
        }}
      >
        <DialogContent
          ref={dialogRef}
          aria-modal="true"
          aria-describedby={undefined}
          className={cn(EDITOR_PANEL, 'w-md')}
          // A free key is there to be filled: Link. An assigned one opens quiet, so Esc closes and nothing types. A ⌘V
          // that opened the dialog has filled Link already: the dialog, so the next key or paste acts on the keymap.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const next = focusNext.current;
            focusNext.current = null;
            if (next === 'link' || (next === null && stored === undefined)) linkRef.current?.focus();
            else dialogRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (lastKey.current !== null) (view === 'list' ? listRef : keyboardRef).current?.focusKey(lastKey.current);
          }}
          // In Link or Name with an unsaved change, the first Esc only leaves the field; nothing is reverted.
          onEscapeKeyDown={(event) => {
            if (!dirty || !isEditableTarget(event.target ?? undefined)) return;
            event.preventDefault();
            dialogRef.current?.focus();
          }}
        >
          {/* The accessible name; the visible header stays as drawn, the key chip and the shortcut's title. */}
          <DialogTitle asChild>
            <span className="sr-only">{i18n.t('options.editor.label')}</span>
          </DialogTitle>
          {key !== null && draft !== null && (
            <KeyEditor
              keyLabel={key}
              stored={stored}
              draft={draft}
              onDraftChange={editor.setDraft}
              openNow={openKeys.has(key) && stored !== undefined}
              webPage={webTab}
              saveState={autosave.state}
              onClear={() => onClear(key)}
              onTest={() => void onTest(key)}
              onClose={editor.close}
              linkRef={linkRef}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OptionsPage() {
  const keymap = useKeymap();
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {keymap === null ? (
          <>
            <Header search={{ query: '', onQueryChange: () => {} }} />
            <p role="status" className="p-8 text-muted-foreground text-sm">
              {i18n.t('options.loading')}
            </p>
          </>
        ) : (
          <KeymapView keymap={keymap} />
        )}
      </div>
    </TooltipProvider>
  );
}
