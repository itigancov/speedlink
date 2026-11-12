// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Key } from '@/domain/keys';
import { createToastSlot, ToastRegion, type ToastSlot } from './ToastRegion';

let slot: ToastSlot;
let openNew: Mock<(key: Key) => void>;
let putPageOnKey: Mock<(key: Key) => void>;

function renderRegion(platform: 'mac' | 'other' = 'mac') {
  render(<ToastRegion slot={slot} actions={{ openNew, putPageOnKey }} platform={platform} />);
}

const show = (...args: Parameters<ToastSlot['show']>) => act(() => slot.show(...args));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const pill = () => screen.queryByTestId('page-toast');

beforeEach(() => {
  vi.useFakeTimers();
  slot = createToastSlot();
  openNew = vi.fn();
  putPageOnKey = vi.fn();
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

describe('the switched toast', () => {
  it('reads "⌥Y Switched to your open YouTube tab · Open new", with no ×', () => {
    renderRegion('mac');
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });

    expect(pill()?.textContent).toBe('⌥YSwitched to your open YouTube tabOpen new');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('dismisses itself after 3 s', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });

    advance(2999);
    expect(pill()).not.toBeNull();
    advance(1);
    expect(pill()).toBeNull();
  });

  it('stays while hovered, then restarts the full 3 s on leave', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });
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
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });
    fireEvent.pointerEnter(pill() as HTMLElement);

    show({ kind: 'switched', key: 'G', name: 'GitHub' });
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

    show({ kind: 'switched', key: 'Y', name: 'YouTube' });
    advance(3000);

    expect(pill()).toBeNull();
  });

  it('is not closed by Esc', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(pill()).not.toBeNull();
  });

  it('calls openNew(key) from Open new', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });

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
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });
    advance(2000);
    show({ kind: 'free', key: 'K' });

    advance(5000);

    expect(screen.getByText('⌥K')).toBeDefined();
  });

  it('the same toast again restarts its lifetime', () => {
    renderRegion();
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });
    advance(2000);
    show({ kind: 'switched', key: 'Y', name: 'YouTube' });

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
