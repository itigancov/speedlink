// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyCap } from './KeyCap';

describe('KeyCap accessible name', () => {
  it('names an assigned key "Option K: GitHub" on a Mac', () => {
    render(<KeyCap label="K" state="assigned" name="GitHub" monogram="GH" platform="mac" />);
    expect(screen.getByRole('button', { name: 'Option K: GitHub' })).toBeDefined();
  });

  it('names it "Alt K: GitHub" elsewhere', () => {
    render(<KeyCap label="K" state="assigned" name="GitHub" monogram="GH" platform="other" />);
    expect(screen.getByRole('button', { name: 'Alt K: GitHub' })).toBeDefined();
  });

  it('names a free key "Option K: free"', () => {
    render(<KeyCap label="K" state="free" platform="mac" />);
    expect(screen.getByRole('button', { name: 'Option K: free' })).toBeDefined();
  });

  it('names a free key by its state, even when a name is passed', () => {
    render(<KeyCap label="Q" state="free" name="GitHub" platform="mac" />);
    expect(screen.getByRole('button', { name: 'Option Q: free' })).toBeDefined();
  });

  it('adds ", open in a tab" when the link is open', () => {
    render(<KeyCap label="K" state="assigned" open name="GitHub" monogram="GH" platform="mac" />);
    expect(screen.getByRole('button', { name: 'Option K: GitHub, open in a tab' })).toBeDefined();
  });

  it('keeps ", open in a tab" when the open key is selected', () => {
    render(<KeyCap label="K" state="selected" open name="GitHub" monogram="GH" platform="other" />);
    expect(screen.getByRole('button', { name: 'Alt K: GitHub, open in a tab' })).toBeDefined();
  });
});

describe('KeyCap states', () => {
  it('is pressed only when selected', () => {
    const { rerender } = render(<KeyCap label="K" state="selected" name="GitHub" platform="mac" />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');

    for (const state of ['free', 'assigned', 'drop-target', 'taken', 'picked'] as const) {
      rerender(<KeyCap label="K" state={state} name="GitHub" platform="mac" />);
      expect(screen.getByRole('button').hasAttribute('aria-pressed')).toBe(false);
    }
  });

  it.each(['lg', 'xl', 'md', 'sm'] as const)('shows the reserved S disabled, with the lock, at %s', (size) => {
    render(<KeyCap label="S" state="reserved" size={size} platform="mac" />);
    const button = screen.getByRole('button', { name: 'Option S: reserved for the overlay' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('shows the monogram chip on an assigned key', () => {
    render(<KeyCap label="G" state="assigned" name="GitHub" monogram="GH" size="lg" platform="mac" />);
    expect(screen.getByText('GH')).toBeDefined();
    expect(screen.getByText('G')).toBeDefined();
  });

  it('passes button props through for click handlers', () => {
    let clicks = 0;
    render(<KeyCap label="K" state="free" platform="mac" onClick={() => clicks++} />);
    screen.getByRole('button').click();
    expect(clicks).toBe(1);
  });
});

describe('KeyCap dimmed', () => {
  it('keeps its state, accessible name and click when dimmed', () => {
    let clicks = 0;
    render(<KeyCap label="K" state="selected" dimmed open name="GitHub" platform="mac" onClick={() => clicks++} />);
    const button = screen.getByRole('button', { name: 'Option K: GitHub, open in a tab' });
    expect(button.dataset.dimmed).toBe('true');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(clicks).toBe(1);
  });

  it('is not dimmed by default', () => {
    render(<KeyCap label="K" state="free" platform="mac" />);
    expect(screen.getByRole('button').dataset.dimmed).toBeUndefined();
  });
});

describe('KeyCap decorative', () => {
  it('draws the keycap inside another control as no button of its own, hidden from assistive tech', () => {
    const { container } = render(<KeyCap decorative label="K" size="md" state="assigned" open />);
    expect(screen.queryByRole('button')).toBeNull();
    const cap = container.querySelector('[data-slot="key-cap"]');
    expect(cap?.getAttribute('aria-hidden')).toBe('true');
    expect(cap?.textContent).toBe('K');
  });
});
