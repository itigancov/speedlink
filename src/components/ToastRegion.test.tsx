// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Key } from '@/domain/keys';
import { tileHue } from '@/domain/shortcut';
import { createToastSlot, ToastRegion, type ToastSlot } from './ToastRegion';

const GUIDE = 'https://docs.example.com/guide';
const YOUTUBE = 'https://www.youtube.com/';

let slot: ToastSlot;
let openNew: Mock<(key: Key) => void>;
let putPageOnKey: Mock<(key: Key) => void>;
let undo: Mock<(key: Key, undoId: string) => void>;

/** A stand-in for the content script's occupied keys: `assign` marks a key taken and tells subscribers. */
function fakeOccupied() {
  const taken = new Set<Key>();
  const listeners = new Set<() => void>();
  return {
    isAssigned: (key: Key) => taken.has(key),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    assign: (key: Key) =>
      act(() => {
        taken.add(key);
        for (const listener of listeners) listener();
      }),
  };
}
let occupied: ReturnType<typeof fakeOccupied>;

function renderRegion(platform: 'mac' | 'other' = 'mac') {
  render(<ToastRegion slot={slot} actions={{ openNew, putPageOnKey, undo }} occupied={occupied} platform={platform} />);
}

const show = (...args: Parameters<ToastSlot['show']>) => act(() => slot.show(...args));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const pill = () => screen.queryByTestId('page-toast');

beforeEach(() => {
  vi.useFakeTimers();
  slot = createToastSlot();
  openNew = vi.fn();
  putPageOnKey = vi.fn();
  undo = vi.fn();
  occupied = fakeOccupied();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the free-key toast', () => {
  it('reads "⌥K is free · Put this page on it" on a Mac', () => {
    renderRegion('mac');
    show({ kind: 'free', key: 'K' });

    expect(pill()?.textContent).toBe('⌥Kis freePut this page on it');
    expect(screen.getByText('⌥K')).toBeDefined();
    expect(screen.getByText('is free')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Put this page on it' })).toBeDefined();
  });

  it('reads "Alt+K" elsewhere', () => {
    renderRegion('other');
    show({ kind: 'free', key: 'K' });

    expect(screen.getByText('Alt+K')).toBeDefined();
  });

  it('never times out', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });

    advance(60_000);

    expect(pill()).not.toBeNull();
  });

  it('closes on ×', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(pill()).toBeNull();
  });

  it('closes on Esc, without taking Esc from the page', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });
    const pageSaw = vi.fn();
    document.addEventListener('keydown', pageSaw);

    const notCancelled = fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(pill()).toBeNull();
    expect(notCancelled).toBe(true);
    expect(pageSaw).toHaveBeenCalledOnce();
    document.removeEventListener('keydown', pageSaw);
  });

  it('ignores other keys', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });

    fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter' });

    expect(pill()).not.toBeNull();
  });

  it('calls putPageOnKey(key) from its action and stays up', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });

    fireEvent.click(screen.getByRole('button', { name: 'Put this page on it' }));

    expect(putPageOnKey).toHaveBeenCalledExactlyOnceWith('K');
    expect(pill()).not.toBeNull();
  });
});

describe('the free-key toast, when its key is taken meanwhile', () => {
  it('closes when its key becomes assigned (sync, Options, another tab)', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });

    occupied.assign('K');

    expect(pill()).toBeNull();
  });

  it('stays when another key does', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });

    occupied.assign('J');

    expect(pill()).not.toBeNull();
  });

  it('stays once its own action was clicked, until the saved or error toast replaces it', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });
    fireEvent.click(screen.getByRole('button', { name: 'Put this page on it' }));

    occupied.assign('K');

    expect(pill()).not.toBeNull();
  });

  it('leaves other toasts alone', () => {
    renderRegion();
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    occupied.assign('K');

    expect(pill()).not.toBeNull();
  });
});

describe('the saved toast', () => {
  it('reads "⌥K → The Guide saved · Undo", with no ×', () => {
    renderRegion('mac');
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    expect(pill()?.textContent).toBe('⌥KT→ The Guide savedUndo');
    expect(pill()?.dataset.tone).toBe('saved');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('closes at once on Undo, and asks to undo that assign', () => {
    renderRegion();
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(pill()).toBeNull();
    expect(undo).toHaveBeenCalledExactlyOnceWith('K', 'u1');
  });

  it('dismisses itself after 5 s', () => {
    renderRegion();
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    advance(4999);
    expect(pill()).not.toBeNull();
    advance(1);
    expect(pill()).toBeNull();
  });

  it('stays while hovered, so Undo is there as long as it shows', () => {
    renderRegion();
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });
    fireEvent.pointerEnter(pill() as HTMLElement);

    advance(60_000);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo).toHaveBeenCalledExactlyOnceWith('K', 'u1');
  });

  it('replaces the free-key toast it came from', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    expect(screen.getAllByTestId('page-toast')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
  });
});

describe('the error toast', () => {
  it.each([
    ['undo-stale', '⌥KCouldn’t undo — your keys changed'],
    ['save-failed', '⌥KCouldn’t save ⌥K'],
  ] as const)('%s reads %j, with no action and no ×', (reason, text) => {
    renderRegion('mac');
    show({ kind: 'error', key: 'K', reason });

    expect(pill()?.textContent).toBe(text);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the key the platform way', () => {
    renderRegion('other');
    show({ kind: 'error', key: 'K', reason: 'save-failed' });

    expect(screen.getByText('Couldn’t save Alt+K')).toBeDefined();
  });

  it('dismisses itself after 5 s, held while hovered', () => {
    renderRegion();
    show({ kind: 'error', key: 'K', reason: 'undo-stale' });
    fireEvent.pointerEnter(pill() as HTMLElement);
    advance(10_000);
    expect(pill()).not.toBeNull();

    fireEvent.pointerLeave(pill() as HTMLElement);
    advance(4999);
    expect(pill()).not.toBeNull();
    advance(1);
    expect(pill()).toBeNull();
  });
});

describe('the switched toast', () => {
  it('reads "⌥Y Switched to your open YouTube tab · Open new", with no ×', () => {
    renderRegion('mac');
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });

    expect(pill()?.textContent).toBe('⌥YYSwitched to your open YouTube tabOpen new');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('dismisses itself after 3 s', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });

    advance(2999);
    expect(pill()).not.toBeNull();
    advance(1);
    expect(pill()).toBeNull();
  });

  it('stays while hovered, then restarts the full 3 s on leave', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });
    advance(2000);

    fireEvent.pointerEnter(pill() as HTMLElement);
    advance(10_000);
    expect(pill()).not.toBeNull();

    fireEvent.pointerLeave(pill() as HTMLElement);
    advance(2999);
    expect(pill()).not.toBeNull();
    advance(1);
    expect(pill()).toBeNull();
  });

  it('a toast that replaces one under the pointer is held too', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });
    fireEvent.pointerEnter(pill() as HTMLElement);

    show({ kind: 'switched', key: 'G', name: 'GitHub', link: 'https://github.com/' });
    advance(10_000);
    expect(screen.getByText('⌥G')).toBeDefined();

    fireEvent.pointerLeave(pill() as HTMLElement);
    advance(3000);
    expect(pill()).toBeNull();
  });

  it('after a hovered toast is closed, the next one times out again', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });
    fireEvent.pointerEnter(pill() as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });
    advance(3000);

    expect(pill()).toBeNull();
  });

  it('is not closed by Esc', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(pill()).not.toBeNull();
  });

  it('calls openNew(key) from Open new', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });

    fireEvent.click(screen.getByRole('button', { name: 'Open new' }));

    expect(openNew).toHaveBeenCalledExactlyOnceWith('Y');
  });
});

describe('one slot', () => {
  it('a new toast replaces the one showing', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });
    show({ kind: 'free', key: 'J' });

    expect(screen.getAllByTestId('page-toast')).toHaveLength(1);
    expect(screen.getByText('⌥J')).toBeDefined();
    expect(screen.queryByText('⌥K')).toBeNull();
  });

  it('a free toast replaces a switched one, and is then untimed', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });
    advance(2000);
    show({ kind: 'free', key: 'K' });

    advance(5000);

    expect(screen.getByText('⌥K')).toBeDefined();
  });

  it('the same toast again restarts its lifetime', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });
    advance(2000);
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });

    advance(2999);
    expect(pill()).not.toBeNull();
    advance(1);
    expect(pill()).toBeNull();
  });
});

describe('accessibility', () => {
  it('announces toasts politely from a status region that exists before the first toast', () => {
    renderRegion();
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');

    show({ kind: 'free', key: 'K' });

    expect(region.contains(pill())).toBe(true);
  });

  it('never moves focus: not on show, and not on pressing its controls', () => {
    renderRegion();
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();

    show({ kind: 'free', key: 'K' });

    expect(document.activeElement).toBe(field);
    for (const name of ['Put this page on it', 'Close']) {
      // A pointer press whose default is prevented doesn't move focus to the button.
      expect(fireEvent.mouseDown(screen.getByRole('button', { name }))).toBe(false);
    }
    field.remove();
  });
});

describe("the shortcut's tile", () => {
  const tiles = () => [...document.querySelectorAll<HTMLElement>('[data-slot="monogram"]')];

  it('sits in the saved toast, with the hue of the link and the first letter of the name', () => {
    renderRegion();
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.dataset.hue).toBe(tileHue(GUIDE));
    expect(tiles()[0]?.textContent).toBe('T');
  });

  it('sits in the switched toast, with the hue of the link and the first letter of the name', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube', link: YOUTUBE });

    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.dataset.hue).toBe(tileHue(YOUTUBE));
    expect(tiles()[0]?.textContent).toBe('Y');
  });

  it('sits between the key chip and the message', () => {
    renderRegion();
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    const parts = [...(pill()?.children ?? [])].map((part) => part.getAttribute('data-slot') ?? part.textContent);
    expect(parts.slice(0, 3)).toEqual(['⌥K', 'monogram', '→ The Guide saved']);
  });

  it('is absent from the free-key toast', () => {
    renderRegion();
    show({ kind: 'free', key: 'K' });

    expect(tiles()).toHaveLength(0);
  });

  it.each(['undo-stale', 'save-failed'] as const)('is absent from the %s error toast', (reason) => {
    renderRegion();
    show({ kind: 'error', key: 'K', reason });

    expect(tiles()).toHaveLength(0);
  });

  it('is decoration: hidden from assistive technology', () => {
    renderRegion();
    show({ kind: 'saved', key: 'K', name: 'The Guide', link: GUIDE, undoId: 'u1' });

    expect(tiles()[0]?.getAttribute('aria-hidden')).toBe('true');
  });
});
