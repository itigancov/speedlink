// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Key } from '@/domain/keys';
import { createKeyCapture, type HoldTracker, type KeyCaptureOptions } from './key-capture';

let opened: { key: Key; force: boolean }[];
let toggles: number;
/** What the page's own listeners saw: a capture listener on window registered after ours, and a bubble one. */
let pageSaw: string[];
let controller: AbortController;
let options: KeyCaptureOptions;
/** Whether the AltGr key is down, as Chrome reports it. */
let altGraph: boolean;

function install(overrides: Partial<KeyCaptureOptions> = {}) {
  options = {
    os: 'windows',
    isAssigned: (key) => key === 'K',
    holdTracker: { keydown: () => undefined, keyup: () => undefined, cancel: () => {}, dispose: () => {} },
    isInvalid: () => false,
    openKey: async (request) => {
      opened.push(request);
    },
    toggle: () => {
      toggles += 1;
    },
    ...overrides,
  };
  const capture = createKeyCapture(options);
  const { signal } = controller;
  window.addEventListener('keydown', capture.keydown, { capture: true, signal });
  window.addEventListener('keyup', capture.keyup, { capture: true, signal });
  window.addEventListener('keydown', (e) => pageSaw.push(`capture ${e.code}`), { capture: true, signal });
  document.addEventListener('keydown', (e) => pageSaw.push(`bubble ${e.code}`), { signal });
}

/** Dispatches ⌥ + key (by default ⌥K) on `target`; returns whether the default was prevented. */
function press(target: EventTarget, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    code: 'KeyK',
    altKey: true,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

const mount = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};

beforeEach(() => {
  opened = [];
  toggles = 0;
  pageSaw = [];
  controller = new AbortController();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  // happy-dom reports AltGraph whenever Alt is held; Chrome reports it only for a real AltGr.
  altGraph = false;
  const ownState = KeyboardEvent.prototype.getModifierState;
  vi.spyOn(KeyboardEvent.prototype, 'getModifierState').mockImplementation(function (this: KeyboardEvent, key) {
    return key === 'AltGraph' ? altGraph : ownState.call(this, key);
  });
});

afterEach(() => {
  controller.abort();
  document.body.innerHTML = '';
  document.designMode = 'off';
  vi.restoreAllMocks();
});

describe('key capture: what reaches the page', () => {
  it('swallows ⌥ + an assigned key before the page sees it, and asks the background to open it', () => {
    install();

    expect(press(document.body)).toBe(true);
    expect(pageSaw).toEqual([]);
    expect(opened).toEqual([{ key: 'K', force: false }]);
  });

  it('⌥⇧ + key asks for Force new tab', () => {
    install();

    press(document.body, { shiftKey: true });

    expect(opened).toEqual([{ key: 'K', force: true }]);
  });

  it('swallows a free key that the browser does not use, and still asks the background', () => {
    install();

    expect(press(document.body, { code: 'KeyJ' })).toBe(true);
    expect(pageSaw).toEqual([]);
    expect(opened).toEqual([{ key: 'J', force: false }]);
  });

  it('lets a free browser key through untouched', () => {
    install({ os: 'windows' });

    expect(press(document.body, { code: 'KeyD' })).toBe(false);
    expect(pageSaw).toEqual(['capture KeyD', 'bubble KeyD']);
    expect(opened).toEqual([]);
  });

  it('swallows the repeats of a held key without opening it again', () => {
    install();

    expect(press(document.body, { repeat: true })).toBe(true);
    expect(pageSaw).toEqual([]);
    expect(opened).toEqual([]);
  });

  it('swallows ⌥S and toggles the pinned overlay, opening nothing', () => {
    install();

    expect(press(document.body, { code: 'KeyS' })).toBe(true);
    expect(pageSaw).toEqual([]);
    expect(opened).toEqual([]);
    expect(toggles).toBe(1);
  });

  it('toggles once for a held ⌥S', () => {
    install();

    press(document.body, { code: 'KeyS' });
    press(document.body, { code: 'KeyS', repeat: true });

    expect(toggles).toBe(1);
  });

  it('leaves a key without ⌥ alone', () => {
    install();

    expect(press(document.body, { altKey: false })).toBe(false);
    expect(pageSaw).toEqual(['capture KeyK', 'bubble KeyK']);
  });

  it('leaves AltGr + key to the layout', () => {
    install();
    altGraph = true;

    expect(press(document.body)).toBe(false);
    expect(opened).toEqual([]);
  });

  it('ignores a press during IME composition', () => {
    install();

    expect(press(document.body, { isComposing: true })).toBe(false);
    expect(opened).toEqual([]);
  });

  it('ignores the IME keyCode 229', () => {
    install();

    expect(press(document.body, { keyCode: 229 } as KeyboardEventInit)).toBe(false);
    expect(opened).toEqual([]);
  });

  it('catches a rejected send, and the page still never sees the key', async () => {
    install({ openKey: () => Promise.reject(new Error('Extension context invalidated.')) });

    expect(press(document.body)).toBe(true);
    await vi.waitFor(() => expect(console.debug).toHaveBeenCalled());
    expect(pageSaw).toEqual([]);
  });
});

describe('key capture: editable targets', () => {
  it.each([
    '<input>',
    '<input type="text">',
    '<input type="search">',
    '<input type="email">',
    '<input type="password">',
    '<input type="number">',
    '<textarea></textarea>',
    '<select><option>a</option></select>',
    '<div contenteditable="true"></div>',
  ])('leaves ⌥ + key in %s to the field', (html) => {
    install();

    expect(press(mount(html))).toBe(false);
    expect(opened).toEqual([]);
  });

  it('leaves ⌥ + key alone inside a rich editor’s nested element', () => {
    install();
    const editor = mount('<div contenteditable="true"><p><b>bold</b></p></div>');

    expect(press(editor.querySelector('b') as HTMLElement)).toBe(false);
  });

  it.each(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'])(
    'still captures ⌥ + key on an <input type="%s">',
    (type) => {
      install();

      expect(press(mount(`<input type="${type}">`))).toBe(true);
      expect(opened).toEqual([{ key: 'K', force: false }]);
    },
  );

  it('leaves ⌥ + key alone in a designMode document', () => {
    install();
    document.designMode = 'on';

    expect(press(mount('<p>text</p>'))).toBe(false);
  });

  it('sees through a shadow root to the real field', () => {
    install();
    const host = mount('<div></div>');
    const input = document.createElement('input');
    host.attachShadow({ mode: 'open' }).append(input);

    expect(press(input)).toBe(false);
    expect(opened).toEqual([]);
  });

  it('captures ⌥ + key and ⌥S in the HUD’s own search field', () => {
    const host = mount('<div></div>');
    const search = document.createElement('input');
    search.type = 'search';
    host.attachShadow({ mode: 'open' }).append(search);
    install({ isHudField: (target) => target === search });

    expect(press(search)).toBe(true);
    expect(press(search, { code: 'KeyS' })).toBe(true);
    expect(opened).toEqual([{ key: 'K', force: false }]);
    expect(toggles).toBe(1);
  });

  it('captures ⌥ + key on a plain element inside a shadow root', () => {
    install();
    const host = mount('<div></div>');
    const button = document.createElement('button');
    host.attachShadow({ mode: 'open' }).append(button);

    expect(press(button)).toBe(true);
  });
});

describe('key capture: the hold tracker and teardown', () => {
  it('hands every keydown and keyup to the hold tracker first', () => {
    const seen: string[] = [];
    const holdTracker: HoldTracker = {
      keydown: (e) => {
        seen.push(`down ${e.code} opened=${opened.length}`);
        return undefined;
      },
      keyup: (e) => {
        seen.push(`up ${e.code}`);
        return undefined;
      },
      cancel: () => {},
      dispose: () => {},
    };
    install({ holdTracker });

    press(document.body);
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'AltLeft', bubbles: true }));

    expect(seen).toEqual(['down KeyK opened=0', 'up AltLeft']);
    expect(opened).toHaveLength(1);
  });

  it('stops the pipeline when the hold tracker consumes the event', () => {
    install({
      holdTracker: { keydown: () => 'consumed', keyup: () => 'consumed', cancel: () => {}, dispose: () => {} },
    });

    expect(press(document.body)).toBe(false);
    expect(opened).toEqual([]);
  });

  it('does nothing once its context is gone, so a newer copy handles the press', () => {
    const keydown = vi.fn(() => undefined);
    install({
      isInvalid: () => true,
      holdTracker: { keydown, keyup: () => undefined, cancel: () => {}, dispose: () => {} },
    });

    expect(press(document.body)).toBe(false);
    expect(pageSaw).toEqual(['capture KeyK', 'bubble KeyK']);
    expect(opened).toEqual([]);
    expect(keydown).not.toHaveBeenCalled();
  });
});
