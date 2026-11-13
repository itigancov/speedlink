// The HUD's shadow-root mount (product spec §12.3, the HUD spike's config). One per top frame, created lazily the
// first time something shows: a page nobody presses a key on gets no extra DOM. The toasts and the overlay render
// into the same root.

import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from '#imports';
import hudCss from '@/assets/hud.css?inline';
import type { KeydownSource } from '@/components/ToastRegion';
import { injectHudFont } from '@/platform/hud-font';

/** The fixed container's stacking order: above every page element. */
const TOP_Z_INDEX = '2147483647';

export interface HudMount {
  /**
   * The key guard, for `keydown`, `keyup` and `keypress` on `window` in the capture phase. The entrypoint registers
   * it synchronously, after key capture, so ⌥ + key is still handled first. A key typed inside the HUD stops here,
   * so the page's own capture listeners never see it (`isolateEvents` only stops bubbling at the host). With no
   * HUD mounted it does nothing but feed `keydowns`.
   */
  guard(event: KeyboardEvent): void;
  /**
   * Every keydown the guard sees, from the page and from inside the HUD, before the page's listeners. Never
   * suppresses: the page still gets keys typed outside the HUD.
   */
  keydowns: KeydownSource;
  /** Whether the event happened inside the HUD (a press on the overlay, which must not cancel it). */
  contains(event: Event): boolean;
  /** Whether a key event's real target is in the HUD's shadow root: the pinned search, where ⌥ + key is ours. */
  isHudField(target: EventTarget): boolean;
  /** Creates the shadow root and renders the HUD into it, once; later calls return the same promise. */
  mount(): Promise<void>;
}

const domReady = () =>
  document.readyState === 'loading'
    ? new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }))
    : Promise.resolve();

/** `render` is the HUD's whole tree; it gets the HUD's keydown source. */
export function createHudMount(
  ctx: ContentScriptContext,
  render: (hud: { keydowns: KeydownSource }) => ReactNode,
): HudMount {
  let host: HTMLElement | undefined;
  let shadow: ShadowRoot | undefined;
  let mounting: Promise<void> | undefined;
  const keydownListeners = new Set<(event: KeyboardEvent) => void>();

  const keydowns: KeydownSource = (listener) => {
    keydownListeners.add(listener);
    return () => keydownListeners.delete(listener);
  };

  const contains = (event: Event) => host !== undefined && event.composedPath().includes(host);
  const isHudField = (target: EventTarget) =>
    shadow !== undefined && target instanceof Node && target.getRootNode() === shadow;

  const guard = (event: KeyboardEvent) => {
    if (contains(event)) event.stopImmediatePropagation();
    if (event.type === 'keydown') for (const listener of keydownListeners) listener(event);
  };

  const mountOnce = async () => {
    // `createShadowRootUi` appends to <body> and its hoisted styles to <head>: neither exists early at
    // document_start (a switched-to tab still loading).
    await domReady();
    if (ctx.isInvalid) return;
    injectHudFont(document);
    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'speedlink-hud',
      position: 'modal',
      isolateEvents: true,
      // Inlined rather than WXT's `cssInjectionMode: 'ui'`, which fetches it and so needs a web-accessible file.
      // WXT rewrites :root to :host only in that mode; done here instead.
      css: hudCss.replaceAll(':root', ':host'),
      onMount(container) {
        // WXT's `:host{all:initial}` wipes a z-index on the host, so the fixed container carries it. The container
        // covers the viewport: it lets clicks through, and only the toast pill and the overlay take them.
        container.style.zIndex = TOP_Z_INDEX;
        container.style.pointerEvents = 'none';
        const app = document.createElement('div');
        app.className = 'font-sans text-foreground';
        container.append(app);
        const root = createRoot(app);
        root.render(render({ keydowns }));
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
    host = ui.shadowHost;
    shadow = ui.shadow;
    ctx.onInvalidated(() => {
      host = undefined;
      shadow = undefined;
      keydownListeners.clear();
    });
  };

  return {
    guard,
    keydowns,
    contains,
    isHudField,
    mount() {
      // A failed mount (an exotic page) is tried again on the next toast.
      mounting ??= mountOnce().catch((error: unknown) => {
        mounting = undefined;
        throw error;
      });
      return mounting;
    },
  };
}
