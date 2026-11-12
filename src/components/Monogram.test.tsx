// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validShortcut } from '@/domain/test-shortcut';
import { Monogram } from './Monogram';

/** happy-dom never loads images: stand in for one that has already loaded (or failed, with no pixels). */
function stubImages(naturalWidth: number) {
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      complete = true;
      naturalWidth = naturalWidth;
      src = '';
      crossOrigin: string | null = null;
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const github = validShortcut({ link: 'https://github.com/acme/speedlink/pulls', name: 'GitHub pulls' });

describe('Monogram', () => {
  it('shows the shortcut monogram', () => {
    render(<Monogram shortcut={github} />);
    expect(screen.getByText('GP')).toBeDefined();
  });

  it('falls back to the site when there is no name', () => {
    render(<Monogram shortcut={validShortcut({ link: 'https://youtube.com/' })} />);
    expect(screen.getByText('YO')).toBeDefined();
  });

  it('renders no image without a favicon', () => {
    const { container } = render(<Monogram shortcut={github} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('GP')).toBeDefined();
  });

  it('renders the favicon once it loads', async () => {
    stubImages(16);
    const { container } = render(<Monogram shortcut={github} src="https://github.com/favicon.ico" />);
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe('https://github.com/favicon.ico'),
    );
  });

  it('keeps the monogram when the favicon fails to load', () => {
    stubImages(0);
    const { container } = render(<Monogram shortcut={github} src="https://github.com/missing.ico" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('GP')).toBeDefined();
  });
});
