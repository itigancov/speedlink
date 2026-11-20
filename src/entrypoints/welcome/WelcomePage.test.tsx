// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { WelcomePage } from './WelcomePage';

describe('WelcomePage', () => {
  it('leads with the one-line idea', () => {
    render(<WelcomePage platform="mac" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hold ⌥ and press a key to jump to a site');
  });

  it('shows the SpeedLink name in the header', () => {
    render(<WelcomePage platform="mac" />);
    expect(screen.getByText('SpeedLink')).toBeDefined();
  });

  it('lists the three steps in the order they are used', () => {
    render(<WelcomePage platform="mac" />);
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      '1Put a page on a keyClick the SpeedLink icon, or press ⌥ + a free key on the page.',
      '2Press ⌥ + key anywhereSpeedLink opens that key’s link, or switches to it if it’s already open.',
      '3Hold ⌥ to see your keysYour keymap appears over the page while you hold it.',
    ]);
  });

  it('draws the steps as step cards, none of them current', () => {
    render(<WelcomePage platform="mac" />);
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps.map((step) => step.querySelector('[data-slot="step-title"]')?.textContent)).toEqual([
      'Put a page on a key',
      'Press ⌥ + key anywhere',
      'Hold ⌥ to see your keys',
    ]);
    expect(steps.some((step) => step.hasAttribute('aria-current'))).toBe(false);
  });

  it('draws the trigger as a keycap', () => {
    render(<WelcomePage platform="mac" />);
    const keycaps = [...document.querySelectorAll('kbd')];
    // Once in the heading and once in each step's title or body.
    expect(keycaps.length).toBeGreaterThanOrEqual(4);
    expect(keycaps.every((keycap) => keycap.textContent === '⌥')).toBe(true);
  });

  it('tells how to pin the icon to the toolbar', () => {
    render(<WelcomePage platform="mac" />);
    expect(
      screen.getByText('Pin SpeedLink to the toolbar: click the puzzle icon, then the pin next to SpeedLink.'),
    ).toBeDefined();
  });

  it('reads "Alt" everywhere on Windows and Linux, with no ⌥ left', () => {
    render(<WelcomePage platform="other" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hold Alt and press a key to jump to a site');
    expect(within(screen.getByRole('list')).getAllByRole('listitem')[1]?.textContent).toContain('Press Alt + key');
    expect(document.body.textContent).not.toContain('⌥');
  });

  it('replaces the welcome page with Options when "Open keymap" is pressed', () => {
    const navigate = vi.fn();
    render(<WelcomePage platform="mac" navigate={navigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open keymap' }));

    expect(navigate).toHaveBeenCalledExactlyOnceWith(browser.runtime.getURL('/options.html'));
  });
});

describe('⌥ + key on the welcome page', () => {
  let sent: { type: string; data: unknown }[];

  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  const altKey = (code: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { code, altKey: true, bubbles: true, cancelable: true, ...init });
    act(() => {
      document.body.dispatchEvent(event);
    });
    return event;
  };

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    sent = [];
    // happy-dom reports AltGraph whenever Alt is held; Chrome reports it only for a real AltGr.
    const ownState = KeyboardEvent.prototype.getModifierState;
    vi.spyOn(KeyboardEvent.prototype, 'getModifierState').mockImplementation(function (this: KeyboardEvent, key) {
      return key === 'AltGraph' ? false : ownState.call(this, key);
    });
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation((async (message: { type: string; data: unknown }) => {
      sent.push(message);
      return { res: { kind: 'opened', tabId: 9, switched: false } };
    }) as never);
    await browser.storage.sync.set({
      'key.G': { link: 'https://github.com/', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
    });
    render(<WelcomePage platform="mac" />);
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens an assigned key as Try does, without leaving the page', async () => {
    const event = altKey('KeyG');
    await settle();

    expect(sent).toEqual([expect.objectContaining({ type: 'tryKey', data: { key: 'G', force: false } })]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('⌥⇧+key forces a new tab', async () => {
    altKey('KeyG', { shiftKey: true });
    await settle();

    expect(sent).toEqual([expect.objectContaining({ type: 'tryKey', data: { key: 'G', force: true } })]);
  });

  it('takes a free key to Options on that key', async () => {
    altKey('KeyK');
    await settle();

    expect(sent).toEqual([expect.objectContaining({ type: 'openOptions', data: { key: 'K' } })]);
  });

  it('⌥S opens Options', async () => {
    altKey('KeyS');
    await settle();

    expect(sent).toEqual([expect.objectContaining({ type: 'openOptions', data: undefined })]);
  });
});
