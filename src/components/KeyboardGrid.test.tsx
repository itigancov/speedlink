// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { KeyLabel } from '@/domain/keys';
import { KeyboardGrid } from './KeyboardGrid';

const renderKey = (label: KeyLabel) => <button type="button">{label}</button>;

describe('KeyboardGrid', () => {
  it('renders the 35 keys and S in keyboard order, across four rows', () => {
    const seen: KeyLabel[] = [];
    const { container } = render(
      <KeyboardGrid
        size="lg"
        renderKey={(label) => {
          seen.push(label);
          return renderKey(label);
        }}
      />,
    );

    const rows = Array.from(container.querySelectorAll('[data-slot="keyboard-row"]')).map((row) =>
      within(row as HTMLElement)
        .getAllByRole('button')
        .map((b) => b.textContent)
        .join(''),
    );
    expect(rows).toEqual(['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']);
    expect(seen.join('')).toBe('1234567890QWERTYUIOPASDFGHJKLZXCVBNM');
  });

  it.each(['lg', 'compact', 'sm'] as const)('draws no modifier row at %s: only the 36 keys', (size) => {
    const { container } = render(<KeyboardGrid size={size} renderKey={renderKey} />);
    expect(container.querySelectorAll('[data-slot="keyboard-row"]')).toHaveLength(4);
    expect(container.querySelector('[data-slot="keyboard-modifiers"]')).toBeNull();
    expect(screen.queryByText('⌥ option')).toBeNull();
    expect(screen.queryByText('space')).toBeNull();
    expect(container.textContent).toBe('1234567890QWERTYUIOPASDFGHJKLZXCVBNM');
  });
});
