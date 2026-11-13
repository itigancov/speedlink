// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
