// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { validShortcut } from '@/domain/test-shortcut';
import { Monogram } from './Monogram';

const tile = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-slot="monogram"]');

describe('Monogram', () => {
  it('draws one letter of the name on the tile of its site', () => {
    const { container } = render(<Monogram shortcut={validShortcut({ link: 'https://github.com/x', name: 'Code' })} />);
    expect(tile(container)?.textContent).toBe('C');
    expect(tile(container)?.dataset.hue).toBe('amber');
  });

  it('falls back to the site for the letter', () => {
    const { container } = render(<Monogram shortcut={validShortcut({ link: 'https://youtube.com/' })} />);
    expect(tile(container)?.textContent).toBe('Y');
    expect(tile(container)?.dataset.hue).toBe('purple');
  });

  it('renders from a name and link alone, as from the full shortcut', () => {
    const full = validShortcut({ link: 'https://github.com/x', name: 'Code' });
    const { container } = render(<Monogram shortcut={{ name: 'Code', link: 'https://github.com/x' }} />);
    const { container: fullContainer } = render(<Monogram shortcut={full} />);
    expect(tile(container)?.textContent).toBe(tile(fullContainer)?.textContent);
    expect(tile(container)?.dataset.hue).toBe(tile(fullContainer)?.dataset.hue);
  });

  it('draws no image, at every size', () => {
    for (const size of ['2xs', 'xs', 'sm', 'default', 'md', 'lg'] as const) {
      const { container, unmount } = render(
        <Monogram shortcut={validShortcut({ link: 'https://mail.google.com/' })} size={size} />,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(tile(container)?.dataset.hue).toBe('red');
      unmount();
    }
  });

  it('is decoration: hidden from assistive tech', () => {
    const { container } = render(<Monogram shortcut={validShortcut({ link: 'https://github.com/' })} />);
    expect(tile(container)?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the ringed variant', () => {
    const { container } = render(<Monogram shortcut={validShortcut({ link: 'https://github.com/' })} ringed />);
    expect(tile(container)?.dataset.ringed).toBe('true');
  });
});
