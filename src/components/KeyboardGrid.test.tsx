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
        platform="mac"
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

  it('shows the Mac modifier row with ⌥ highlighted', () => {
    render(<KeyboardGrid size="lg" platform="mac" renderKey={renderKey} />);
    expect(screen.getByText('fn')).toBeDefined();
    expect(screen.getByText('⌥ option').getAttribute('data-highlighted')).toBe('true');
    expect(screen.queryByText('Ctrl')).toBeNull();
  });

  it('shows the non-Mac modifier row with the first Alt highlighted', () => {
    render(<KeyboardGrid size="sm" platform="other" renderKey={renderKey} />);
    const [left, right] = screen.getAllByText('Alt');
    expect(left?.getAttribute('data-highlighted')).toBe('true');
    expect(right?.getAttribute('data-highlighted')).toBe('false');
    expect(screen.getAllByText('Ctrl')).toHaveLength(2);
    expect(screen.queryByText('fn')).toBeNull();
  });

  it('hides the modifier row from the accessibility tree', () => {
    render(<KeyboardGrid size="lg" platform="other" renderKey={renderKey} />);
    expect(screen.getByText('space').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Ctrl' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(36);
  });
});
