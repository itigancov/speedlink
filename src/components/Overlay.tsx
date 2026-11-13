// The overlay (product spec §5.2, §5.4): the keymap over the page while ⌥ is held (the Peek), or pinned with a search.
// Our own non-modal dialog plus a scrim, in the HUD's shadow root next to the toasts: no Radix dialog, no focus trap
// (§12.3). The Peek never takes focus; the pinned overlay focuses its search, and a press on it keeps that focus.
// Only the scrim and the dialog catch pointer events. What shows comes from the content script through the slot.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ARROWS } from '@/domain/key-grid';
import type { Key } from '@/domain/keys';
import type { OverlayModel } from '@/domain/overlay-model';
import { searchTiles } from '@/domain/search';
import { highlightIn, moveHighlight } from '@/domain/tile-grid';
import { PLATFORM, type Platform, triggerSymbol } from '@/platform/platform-labels';
import { keepFocus, OverlayTile } from './OverlayTile';
import { type KeydownSource, windowKeydowns } from './ToastRegion';
import { Badge } from './ui/badge';
import { Kbd } from './ui/kbd';

/** `peek`: shown while ⌥ is held. `pinned`: open until closed, with a search (§5.2). */
export type OverlayMode = 'peek' | 'pinned';

/** What the overlay's actions do. Injected, so the overlay is testable without messaging. */
export interface OverlayActions {
  /** A tile click, or ↵ in the search; `force` on ⇧. */
  open(key: Key, force: boolean): void;
  /** The tile's pencil: Options on that key. */
  edit(key: Key): void;
  /** The empty state's link. */
  openKeymap(): void;
  /** A click on the scrim, or Esc on an empty search. */
  close(): void;
}

export interface OverlayProps {
  model: OverlayModel;
  /** Defaults to the Peek. */
  mode?: OverlayMode;
  actions: OverlayActions;
  /** Forces the trigger labels' platform; defaults to the running platform. */
  platform?: Platform;
  /**
   * The keys the pinned search handles (↵, the arrows, Esc). The HUD passes its own source: its key guard stops keys
   * inside the shadow root before React sees them. Defaults to every keydown on `window`.
   */
  keydowns?: KeydownSource;
}

/** Focuses the field now, or once the page gets focus back (⌥S from the omnibox); returns the cancel. */
function focusWhenPossible(field: HTMLInputElement): () => void {
  const page = field.ownerDocument;
  if (page.hasFocus()) {
    field.focus();
    return () => {};
  }
  const onFocus = () => field.focus();
  page.defaultView?.addEventListener('focus', onFocus, { once: true });
  return () => page.defaultView?.removeEventListener('focus', onFocus);
}

function Legend({ platform, mode }: { platform: Platform; mode: OverlayMode }) {
  const item = (kbd: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <Kbd>{kbd}</Kbd>
      <span>{text}</span>
    </span>
  );
  return (
    <div
      data-testid="overlay-legend"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-border border-t pt-3 text-2xs text-muted-foreground"
    >
      {item(i18n.t('overlay.legend.key'), i18n.t('overlay.legend.go'))}
      {item(i18n.t('overlay.legend.shiftKey'), i18n.t('overlay.legend.forceNew'))}
      {item(i18n.t('overlay.legend.type'), i18n.t('overlay.legend.search'))}
      <span className="inline-flex items-center gap-1.5">
        {mode === 'peek' && (
          <>
            <Kbd>{i18n.t('overlay.legend.release', [triggerSymbol(platform)])}</Kbd>
            <span>{i18n.t('overlay.legend.or')}</span>
          </>
        )}
        <Kbd>{i18n.t('overlay.legend.esc')}</Kbd>
        <span>{i18n.t('overlay.legend.close')}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
        <span>{i18n.t('overlay.legend.openNow')}</span>
      </span>
    </div>
  );
}

export function Overlay({
  model,
  mode = 'peek',
  actions,
  platform = PLATFORM,
  keydowns = windowKeydowns,
}: OverlayProps) {
  const pinned = mode === 'pinned';
  const [query, setQuery] = useState('');
  // The highlight's place among the visible tiles; every query change puts it back on the top result.
  const [cursor, setCursor] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => (pinned ? searchTiles(model.tiles, query) : model.tiles), [model, pinned, query]);
  const highlight = pinned ? highlightIn(cursor, visible.length) : null;
  const highlighted = highlight === null ? undefined : visible[highlight];

  const search = (next: string) => {
    setQuery(next);
    setCursor(0);
  };

  useEffect(() => {
    if (pinned && field.current !== null) return focusWhenPossible(field.current);
  }, [pinned]);

  // Subscribed again on every render, so the listener reads this render's query and highlight.
  useEffect(() => {
    if (!pinned) return;
    return keydowns((event) => {
      // Only keys typed in the search: read from the real target, which the shadow root hides from `target`.
      if (event.composedPath()[0] !== field.current) return;
      if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
      const direction = ARROWS[event.key];
      if (direction !== undefined) {
        event.preventDefault();
        if (highlight !== null) setCursor(moveHighlight(highlight, visible.length, direction));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (highlighted !== undefined) actions.open(highlighted.key, event.shiftKey);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (query === '') actions.close();
        else search('');
      }
    });
  });

  return (
    <div className="fixed inset-0 flex items-start justify-center px-4 pt-24">
      <div
        data-testid="overlay-scrim"
        aria-hidden="true"
        onMouseDown={keepFocus}
        onClick={actions.close}
        className="pointer-events-auto absolute inset-0 bg-foreground/30"
      />
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: a press anywhere on the dialog must not move focus (§5.1, §5.2); it is not an action */}
      <div
        role="dialog"
        aria-label={i18n.t('overlay.label')}
        onMouseDown={keepFocus}
        className="pointer-events-auto relative flex max-h-3/4 w-full max-w-3xl flex-col gap-4 rounded-2xl bg-card p-5 font-sans text-foreground shadow-lg"
      >
        <div className="flex items-center gap-3">
          <Badge variant="accent">
            {pinned ? i18n.t('overlay.pinned') : i18n.t('overlay.held', [triggerSymbol(platform)])}
          </Badge>
          {pinned ? (
            <input
              ref={field}
              type="search"
              aria-label={i18n.t('overlay.search')}
              placeholder={i18n.t('overlay.hint')}
              value={query}
              onChange={(event) => search(event.target.value)}
              // The dialog keeps a press from moving focus; a press on the search may focus it.
              onMouseDown={(event) => event.stopPropagation()}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-foreground text-ui outline-none placeholder:text-muted-foreground"
            />
          ) : (
            <span className="text-muted-foreground text-ui">{i18n.t('overlay.hint')}</span>
          )}
        </div>
        {model.tiles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-ui">
            <span className="font-semibold">{i18n.t('overlay.empty')}</span>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={actions.openKeymap}
              className="cursor-pointer rounded-sm font-semibold text-link outline-none hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {i18n.t('overlay.openKeymap')}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center font-semibold text-ui">{i18n.t('overlay.noMatch', [query.trim()])}</p>
        ) : (
          <div data-testid="overlay-tiles" className="grid min-h-0 grid-cols-4 gap-2 overflow-y-auto">
            {visible.map((tile) => (
              <OverlayTile
                key={tile.key}
                tile={tile}
                highlighted={tile === highlighted}
                platform={platform}
                onOpen={(force) => actions.open(tile.key, force)}
                onEdit={() => actions.edit(tile.key)}
              />
            ))}
          </div>
        )}
        <Legend platform={platform} mode={mode} />
      </div>
    </div>
  );
}

/** What the slot shows. */
export interface OverlayShown {
  model: OverlayModel;
  mode: OverlayMode;
}

/** The overlay's one slot: the model showing and how, or nothing. Outside React, so the hold tracker can drive it. */
export interface OverlaySlot {
  show(model: OverlayModel, mode: OverlayMode): void;
  hide(): void;
  current(): OverlayShown | undefined;
  subscribe(listener: () => void): () => void;
}

export function createOverlaySlot(): OverlaySlot {
  let shown: OverlayShown | undefined;
  const listeners = new Set<() => void>();
  const set = (next: OverlayShown | undefined) => {
    shown = next;
    for (const listener of listeners) listener();
  };
  return {
    show: (model, mode) => set({ model, mode }),
    hide: () => {
      if (shown !== undefined) set(undefined);
    },
    current: () => shown,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The overlay while the slot holds a model; nothing otherwise, so no dialog is in the DOM. A Peek that pins stays the
 * same overlay; each new showing starts with an empty search.
 */
export function OverlayRegion({ slot, ...props }: Omit<OverlayProps, 'model' | 'mode'> & { slot: OverlaySlot }) {
  const shown = useSyncExternalStore(slot.subscribe, slot.current);
  return shown === undefined ? null : <Overlay model={shown.model} mode={shown.mode} {...props} />;
}
