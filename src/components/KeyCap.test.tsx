// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { validShortcut } from '@/domain/test-shortcut';
import { KeyCap } from './KeyCap';

const github = validShortcut({ link: 'https://github.com/', name: 'GitHub' });
const tileOf = (element: Element) => element.querySelector<HTMLElement>('[data-slot="monogram"]');
const nameLineOf = (element: Element) => element.querySelector('[data-slot="key-name"]');
const openDotOf = (element: Element) => element.querySelector('[data-slot="key-open"]');

describe('KeyCap accessible name', () => {
  it('names an assigned key "Option K: GitHub" on a Mac', () => {
    render(<KeyCap label="K" state="assigned" name="GitHub" shortcut={github} platform="mac" />);
    expect(screen.getByRole('button', { name: 'Option K: GitHub' })).toBeDefined();
  });

  it('names it "Alt K: GitHub" elsewhere', () => {
    render(<KeyCap label="K" state="assigned" name="GitHub" shortcut={github} platform="other" />);
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
    render(<KeyCap label="K" state="assigned" open name="GitHub" shortcut={github} platform="mac" />);
    expect(screen.getByRole('button', { name: 'Option K: GitHub, open in a tab' })).toBeDefined();
  });

  it('keeps ", open in a tab" when the open key is selected', () => {
    render(<KeyCap label="K" state="selected" open name="GitHub" shortcut={github} platform="other" />);
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

  it.each(['lg', 'compact', 'xl', 'md', 'sm'] as const)(
    'shows the reserved S disabled, with the lock, at %s',
    (size) => {
      render(<KeyCap label="S" state="reserved" size={size} platform="mac" />);
      const button = screen.getByRole('button', { name: 'Option S: reserved for the overlay' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.querySelector('svg')).not.toBeNull();
    },
  );

  it('keeps the accessible name at every size and on both platforms', () => {
    for (const size of ['lg', 'compact', 'xl', 'md', 'sm'] as const) {
      for (const [platform, trigger] of [
        ['mac', 'Option'],
        ['other', 'Alt'],
      ] as const) {
        const { unmount } = render(
          <KeyCap label="G" state="assigned" open size={size} shortcut={github} name="GitHub" platform={platform} />,
        );
        expect(screen.getByRole('button', { name: `${trigger} G: GitHub, open in a tab` })).toBeDefined();
        unmount();
      }
    }
  });

  it('passes button props through for click handlers', () => {
    let clicks = 0;
    render(<KeyCap label="K" state="free" platform="mac" onClick={() => clicks++} />);
    screen.getByRole('button').click();
    expect(clicks).toBe(1);
  });
});

describe('KeyCap face', () => {
  it('shows the label, the tile of its site, the name line and the open dot on a large key', () => {
    render(<KeyCap label="G" size="lg" state="assigned" open shortcut={github} name="GitHub" platform="mac" />);
    const key = screen.getByRole('button');
    expect(key.textContent).toContain('G');
    expect(tileOf(key)?.dataset.hue).toBe('amber');
    expect(tileOf(key)?.textContent).toBe('G');
    expect(nameLineOf(key)?.textContent).toBe('GitHub');
    expect(openDotOf(key)).not.toBeNull();
  });

  it('shows the tile and the open dot on a compact key, without the name line', () => {
    render(<KeyCap label="G" size="compact" state="assigned" open shortcut={github} name="GitHub" platform="mac" />);
    const key = screen.getByRole('button');
    expect(tileOf(key)?.dataset.hue).toBe('amber');
    expect(openDotOf(key)).not.toBeNull();
    expect(nameLineOf(key)).toBeNull();
  });

  it('shows only the label and the open marker on a small key', () => {
    render(<KeyCap label="G" size="sm" state="assigned" open shortcut={github} name="GitHub" platform="mac" />);
    const key = screen.getByRole('button');
    expect(tileOf(key)).toBeNull();
    expect(nameLineOf(key)).toBeNull();
    expect(openDotOf(key)).not.toBeNull();
    expect(key.textContent).toBe('G');
  });

  it.each(['lg', 'compact'] as const)('shows a free %s key as just its label', (size) => {
    render(<KeyCap label="Q" size={size} state="free" platform="mac" />);
    const key = screen.getByRole('button');
    expect(tileOf(key)).toBeNull();
    expect(nameLineOf(key)).toBeNull();
    expect(key.textContent).toBe('Q');
  });

  it('rings the tile on a selected key and keeps its colour', () => {
    render(<KeyCap label="G" state="selected" shortcut={github} name="GitHub" platform="mac" />);
    const tile = tileOf(screen.getByRole('button'));
    expect(tile?.dataset.ringed).toBe('true');
    expect(tile?.dataset.hue).toBe('amber');
  });

  it('does not ring the tile on an assigned key', () => {
    render(<KeyCap label="G" state="assigned" shortcut={github} name="GitHub" platform="mac" />);
    expect(tileOf(screen.getByRole('button'))?.dataset.ringed).toBeUndefined();
  });

  it('hides the tile, the name line and the open dot from assistive tech', () => {
    render(<KeyCap label="G" state="assigned" open shortcut={github} name="GitHub" platform="mac" />);
    const key = screen.getByRole('button');
    for (const part of [tileOf(key), nameLineOf(key), openDotOf(key)]) {
      expect(part?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('draws "Start here" as a free key with its label', () => {
    render(<KeyCap label="G" size="lg" state="start" platform="mac" />);
    const key = screen.getByRole('button', { name: 'Option G: free' });
    expect(key.dataset.state).toBe('start');
    expect(key.textContent).toBe('G');
  });

  it('draws the plain overlay keycap with no tile and no open dot', () => {
    const { container } = render(<KeyCap decorative label="G" size="md" state="plain" open shortcut={github} />);
    const cap = container.querySelector<HTMLElement>('[data-slot="key-cap"]');
    expect(cap?.dataset.state).toBe('plain');
    expect(cap?.textContent).toBe('G');
    expect(openDotOf(container)).toBeNull();
  });

  it.each(['lg', 'compact'] as const)('marks the drop target with ↔ at %s', (size) => {
    render(<KeyCap label="G" size={size} state="drop-target" shortcut={github} name="GitHub" platform="mac" />);
    expect(screen.getByRole('button').textContent).toContain('↔');
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
