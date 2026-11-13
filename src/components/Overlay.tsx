// The overlay (product spec §5.4): the keymap over the page while ⌥ is held. Our own non-modal dialog plus a scrim, in
// the HUD's shadow root next to the toasts: no Radix dialog, no focus trap, and it never takes focus (§12.3). Only
// the scrim and the dialog catch pointer events. What shows comes from the content script through the slot.
import { useSyncExternalStore } from 'react';
import type { Key } from '@/domain/keys';
import type { OverlayModel } from '@/domain/overlay-model';
import { PLATFORM, type Platform, triggerSymbol } from '@/platform/platform-labels';
import { keepFocus, OverlayTile } from './OverlayTile';
import { Badge } from './ui/badge';
import { Kbd } from './ui/kbd';

/** What the overlay's mouse actions do. Injected, so the overlay is testable without messaging. */
export interface OverlayActions {
  /** A tile click; `force` on ⇧ + click. */
  open(key: Key, force: boolean): void;
  /** The tile's pencil: Options on that key. */
  edit(key: Key): void;
  /** The empty state's link. */
  openKeymap(): void;
  /** A click on the scrim. */
  close(): void;
}

export interface OverlayProps {
  model: OverlayModel;
  actions: OverlayActions;
  /** Forces the trigger labels' platform; defaults to the running platform. */
  platform?: Platform;
}

function Legend({ platform }: { platform: Platform }) {
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
        <Kbd>{i18n.t('overlay.legend.release', [triggerSymbol(platform)])}</Kbd>
        <span>{i18n.t('overlay.legend.or')}</span>
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

export function Overlay({ model, actions, platform = PLATFORM }: OverlayProps) {
  return (
    <div className="fixed inset-0 flex items-start justify-center px-4 pt-24">
      <div
        data-testid="overlay-scrim"
        aria-hidden="true"
        onMouseDown={keepFocus}
        onClick={actions.close}
        className="pointer-events-auto absolute inset-0 bg-foreground/30"
      />
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: a press anywhere on the dialog must not take focus from the page (§5.1); it is not an action */}
      <div
        role="dialog"
        aria-label={i18n.t('overlay.label')}
        onMouseDown={keepFocus}
        className="pointer-events-auto relative flex max-h-3/4 w-full max-w-3xl flex-col gap-4 rounded-2xl bg-card p-5 font-sans text-foreground shadow-lg"
      >
        <div className="flex items-center gap-3">
          <Badge variant="accent">{i18n.t('overlay.held', [triggerSymbol(platform)])}</Badge>
          <span className="text-muted-foreground text-ui">{i18n.t('overlay.hint')}</span>
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
        ) : (
          <div data-testid="overlay-tiles" className="grid min-h-0 grid-cols-4 gap-2 overflow-y-auto">
            {model.tiles.map((tile) => (
              <OverlayTile
                key={tile.key}
                tile={tile}
                platform={platform}
                onOpen={(force) => actions.open(tile.key, force)}
                onEdit={() => actions.edit(tile.key)}
              />
            ))}
          </div>
        )}
        <Legend platform={platform} />
      </div>
    </div>
  );
}

/** The overlay's one slot: the model showing, or nothing. Outside React, so the hold tracker can drive it. */
export interface OverlaySlot {
  show(model: OverlayModel): void;
  hide(): void;
  current(): OverlayModel | undefined;
  subscribe(listener: () => void): () => void;
}

export function createOverlaySlot(): OverlaySlot {
  let shown: OverlayModel | undefined;
  const listeners = new Set<() => void>();
  const set = (next: OverlayModel | undefined) => {
    shown = next;
    for (const listener of listeners) listener();
  };
  return {
    show: (model) => set(model),
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

/** The overlay while the slot holds a model; nothing otherwise, so no dialog is in the DOM. */
export function OverlayRegion({ slot, ...props }: Omit<OverlayProps, 'model'> & { slot: OverlaySlot }) {
  const model = useSyncExternalStore(slot.subscribe, slot.current);
  return model === undefined ? null : <Overlay model={model} {...props} />;
}
