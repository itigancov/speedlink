// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { KEYBOARD_ORDER, type Key } from '@/domain/keys';
import type { OverlayModel, OverlayTile } from '@/domain/overlay-model';
import { Overlay, type OverlayMode } from './Overlay';

let open: Mock<(key: Key, force: boolean) => void>;
let edit: Mock<(key: Key) => void>;
let openKeymap: Mock<() => void>;
let close: Mock<() => void>;

const tile = (key: Key, name: string, subline: OverlayTile['subline']): OverlayTile => ({
  key,
  name,
  link: `https://${name.toLowerCase()}.example/`,
  subline,
});

const FOUR: OverlayModel = {
  tiles: [
    tile('1', 'Docs', { kind: 'tab', index: 3 }),
    tile('G', 'GitHub', { kind: 'other-window' }),
    tile('K', 'Calendar', { kind: 'mode', mode: 'smart', site: 'calendar.example.com' }),
    tile('Y', 'YouTube', { kind: 'mode', mode: 'new', site: 'youtube.com' }),
  ],
};

function renderOverlay(model: OverlayModel = FOUR, platform: 'mac' | 'other' = 'mac', mode: OverlayMode = 'peek') {
  return render(<Overlay model={model} mode={mode} actions={{ open, edit, openKeymap, close }} platform={platform} />);
}

const dialog = () => screen.getByRole('dialog');
const tileButton = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  open = vi.fn();
  edit = vi.fn();
  openKeymap = vi.fn();
  close = vi.fn();
});

describe('the overlay: what it shows', () => {
  it('is a labelled, non-modal dialog', () => {
    renderOverlay();
    expect(dialog().getAttribute('aria-label')).toBe('Your keys');
    expect(dialog().hasAttribute('aria-modal')).toBe(false);
  });

  it('shows one tile per key, with its keycap, name, subline and monogram, in the given order', () => {
    renderOverlay();
    const tiles = within(dialog()).getAllByTestId('overlay-tile');
    expect(tiles.map((element) => element.textContent)).toEqual([
      '1DocsOpen · tab 3D',
      'GGitHubOpen · other windowG',
      'KCalendarcalendar.example.comC',
      'YYouTubenew tabY',
    ]);
  });

  it('names each tile button by its chord, name and subline', () => {
    renderOverlay();
    expect(tileButton(/^Option 1: Docs, Open · tab 3$/)).toBeDefined();
  });

  it('shows "this tab" and "background" for those open modes', () => {
    renderOverlay({
      tiles: [
        tile('T', 'Tracker', { kind: 'mode', mode: 'this', site: 'tracker.example' }),
        tile('B', 'Board', { kind: 'mode', mode: 'bg', site: 'board.example' }),
      ],
    });
    expect(screen.getByText('this tab')).toBeDefined();
    expect(screen.getByText('background')).toBeDefined();
  });

  it('shows both "Open" sublines in green', () => {
    renderOverlay();
    expect(screen.getByText('Open · other window').className).toContain('text-success-foreground');
    expect(screen.getByText('Open · tab 3').className).toContain('text-success-foreground');
  });

  it('keeps the sublines of site, new tab, this tab and background muted', () => {
    renderOverlay({
      tiles: [
        tile('K', 'Calendar', { kind: 'mode', mode: 'smart', site: 'calendar.example.com' }),
        tile('Y', 'YouTube', { kind: 'mode', mode: 'new', site: 'youtube.com' }),
        tile('T', 'Tracker', { kind: 'mode', mode: 'this', site: 'tracker.example' }),
        tile('B', 'Board', { kind: 'mode', mode: 'bg', site: 'board.example' }),
      ],
    });
    for (const text of ['calendar.example.com', 'new tab', 'this tab', 'background']) {
      expect(screen.getByText(text).className).toContain('text-muted-foreground');
      expect(screen.getByText(text).className).not.toContain('text-success-foreground');
    }
  });

  it('draws each tile’s monogram: the letter of its name, on the colour of its site', () => {
    renderOverlay({
      tiles: [
        tile('G', 'Code', { kind: 'mode', mode: 'new', site: 'github.com' }),
        tile('Y', 'YouTube', { kind: 'mode', mode: 'new', site: 'youtube.com' }),
      ],
    });
    // The links are the fixtures' own; the hues are those of the same sites in Options (Monogram.test).
    const [github, youtube] = within(dialog())
      .getAllByTestId('overlay-tile')
      .map((element) => element.querySelector<HTMLElement>('[data-slot="monogram"]'));
    expect(github?.textContent).toBe('C');
    expect(youtube?.textContent).toBe('Y');
  });

  it('draws the monogram with the hue of the tile’s link, hidden from assistive tech', () => {
    renderOverlay({
      tiles: [
        { ...tile('G', 'Code', { kind: 'mode', mode: 'new', site: 'github.com' }), link: 'https://github.com/x' },
      ],
    });
    const monogram = screen.getByTestId('overlay-tile').querySelector<HTMLElement>('[data-slot="monogram"]');
    expect(monogram?.dataset.hue).toBe('amber');
    expect(monogram?.getAttribute('aria-hidden')).toBe('true');
  });

  it('turns a tile green when its page is open, in this window or another', () => {
    renderOverlay();
    for (const name of [/^Option 1:/, /^Option G:/]) {
      expect(tileButton(name).className).toContain('bg-success-tile');
      expect(tileButton(name).className).toContain('border-success-border');
    }
    for (const name of [/^Option K:/, /^Option Y:/]) {
      expect(tileButton(name).className).not.toContain('bg-success-tile');
    }
  });

  it('keeps an open tile’s monogram on its site colour', () => {
    renderOverlay({
      tiles: [{ ...tile('G', 'Code', { kind: 'other-window' }), link: 'https://github.com/x' }],
    });
    const monogram = screen.getByTestId('overlay-tile').querySelector<HTMLElement>('[data-slot="monogram"]');
    expect(monogram?.dataset.hue).toBe('amber');
    expect(monogram?.className).not.toContain('bg-success');
  });

  it('draws a plain keycap with the key, and no open dot, even on an open tile', () => {
    renderOverlay();
    const [docs] = within(dialog()).getAllByTestId('overlay-tile');
    const cap = docs?.querySelector('[data-slot="key-cap"]');
    expect(cap?.getAttribute('data-state')).toBe('plain');
    expect(cap?.textContent).toBe('1');
    for (const element of within(dialog()).getAllByTestId('overlay-tile')) {
      expect(element.querySelector('[data-slot="key-open"]')).toBeNull();
    }
  });

  it('shows the held badge, the hint and the legend with ⌥ on a Mac', () => {
    renderOverlay();
    expect(screen.getByText('⌥ held')).toBeDefined();
    expect(screen.getByText('Press a key — S to search')).toBeDefined();
    expect(screen.getByTestId('overlay-legend').textContent).toBe(
      'keygo⇧ + keyforce new tab⌥ releaseorEscclose' + 'open now — will switch, not reopen',
    );
  });

  it('has no text field in the Peek: ⌥ is held, so every letter is a key', () => {
    renderOverlay();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('marks "open now" in the legend with a green tile swatch, not a dot', () => {
    renderOverlay();
    const swatch = within(screen.getByTestId('overlay-legend')).getByTestId('legend-open-swatch');
    expect(swatch.className).toContain('bg-success-tile');
    expect(swatch.className).not.toContain('rounded-full');
    expect(swatch.getAttribute('aria-hidden')).toBe('true');
  });

  it('promises no typing in the Peek: ⌥ is held, so every letter is a key', () => {
    renderOverlay();
    expect(screen.queryByText(/keep typing/)).toBeNull();
    expect(screen.queryByText('search names & links')).toBeNull();
  });

  it('reads Alt elsewhere', () => {
    renderOverlay(FOUR, 'other');
    expect(screen.getByText('Alt held')).toBeDefined();
    expect(screen.getByText('Alt release')).toBeDefined();
    expect(tileButton(/^Alt 1: Docs/)).toBeDefined();
  });

  it('puts every tile in a scrolling area past 12 tiles', () => {
    const tiles = KEYBOARD_ORDER.slice(0, 13).map((key) =>
      tile(key, `Name ${key}`, { kind: 'mode', mode: 'new', site: 'a.example' }),
    );
    renderOverlay({ tiles });
    const area = screen.getByTestId('overlay-tiles');
    expect(within(area).getAllByTestId('overlay-tile')).toHaveLength(13);
    expect(area.className).toContain('overflow-y-auto');
  });

  it('says "No keys yet" with an Open keymap link for an empty keymap', () => {
    renderOverlay({ tiles: [] });
    expect(screen.getByText('No keys yet')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Open keymap' }));
    expect(openKeymap).toHaveBeenCalledOnce();
  });
});

describe('the overlay: the mouse', () => {
  it('opens a key on a tile click', () => {
    renderOverlay();
    fireEvent.click(tileButton(/^Option G:/));
    expect(open).toHaveBeenCalledWith('G', false);
  });

  it('opens a key in a new tab on ⇧ + click', () => {
    renderOverlay();
    fireEvent.click(tileButton(/^Option G:/), { shiftKey: true });
    expect(open).toHaveBeenCalledWith('G', true);
  });

  it('edits a key from its pencil, without opening it', () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Edit ⌥K' }));
    expect(edit).toHaveBeenCalledWith('K');
    expect(open).not.toHaveBeenCalled();
  });

  it('closes on a click on the dimmed page around it', () => {
    renderOverlay();
    fireEvent.click(screen.getByTestId('overlay-scrim'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not close on a click inside the dialog', () => {
    renderOverlay();
    fireEvent.click(screen.getByText('Press a key — S to search'));
    expect(close).not.toHaveBeenCalled();
  });

  it('never takes focus: a press on a tile, the pencil or the scrim keeps the page’s focus', () => {
    renderOverlay();
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();

    for (const target of [
      tileButton(/^Option G:/),
      screen.getByRole('button', { name: 'Edit ⌥K' }),
      screen.getByTestId('overlay-scrim'),
    ]) {
      expect(fireEvent.mouseDown(target)).toBe(false);
    }
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});

describe('the pinned overlay', () => {
  const pinned = (model: OverlayModel = FOUR, platform: 'mac' | 'other' = 'mac') =>
    renderOverlay(model, platform, 'pinned');
  const search = () => screen.getByRole('searchbox', { name: 'Search your keys' }) as HTMLInputElement;
  const typeIn = (query: string) => fireEvent.change(search(), { target: { value: query } });
  const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(search(), { key, ...init });
  const visible = () => screen.queryAllByTestId('overlay-tile').map((element) => element.textContent?.slice(1, 4));
  const highlighted = () =>
    screen
      .queryAllByTestId('overlay-tile')
      .filter((element) => element.dataset.highlighted === 'true')
      .map((element) => element.textContent?.slice(0, 1));

  it('stays a labelled dialog, with a labelled search field that has focus', () => {
    pinned();
    expect(dialog().getAttribute('aria-label')).toBe('Your keys');
    expect(document.activeElement).toBe(search());
  });

  it('focuses the search once the page gets focus back, as after ⌥S from the omnibox', () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    pinned();
    expect(document.activeElement).not.toBe(search());

    hasFocus.mockReturnValue(true);
    fireEvent.focus(window);
    expect(document.activeElement).toBe(search());
    hasFocus.mockRestore();
  });

  it('keeps the search field’s placeholder', () => {
    pinned();
    expect(search().placeholder).toBe('Press a key — or keep typing to search');
  });

  it('shows the Pinned badge and "Esc close" in the legend', () => {
    pinned();
    expect(screen.getByText('Pinned')).toBeDefined();
    expect(screen.queryByText('⌥ held')).toBeNull();
    expect(screen.getByTestId('overlay-legend').textContent).toBe(
      'keygo⇧ + keyforce new tabtypesearch names & linksEscclose' + 'open now — will switch, not reopen',
    );
  });

  it('hides the tiles that do not match, by name or link', () => {
    pinned();
    typeIn('git');
    expect(visible()).toEqual(['Git']);
    typeIn('CAL');
    expect(visible()).toEqual(['Cal']);
    typeIn('example');
    expect(visible()).toEqual(['Doc', 'Git', 'Cal', 'You']);
  });

  it('highlights the first visible tile as the top result', () => {
    pinned();
    expect(highlighted()).toEqual(['1']);
    typeIn('u');
    expect(highlighted()).toEqual(['G']);
  });

  it('keeps an open tile green when it is highlighted', () => {
    pinned();
    expect(highlighted()).toEqual(['1']);
    const docs = tileButton(/^Option 1:/);
    expect(docs.classList.contains('border-primary')).toBe(true);
    expect(docs.classList.contains('bg-success-tile')).toBe(true);
    expect(tileButton(/^Option G:/).classList.contains('border-primary')).toBe(false);
  });

  it('shows the pencil with an edit action, beside the monogram', () => {
    pinned();
    const [docs] = screen.getAllByTestId('overlay-tile');
    expect(within(docs as HTMLElement).getByRole('button', { name: 'Edit ⌥1' })).toBeDefined();
    expect(docs?.querySelector('[data-slot="monogram"]')).not.toBeNull();
  });

  it('moves the highlight with the arrows over the 4-column grid', () => {
    const tiles = (['1', '2', '3', '4', 'Q', 'W'] as const).map((key) =>
      tile(key, `Name ${key}`, { kind: 'mode', mode: 'new', site: 'a.example' }),
    );
    pinned({ tiles });
    press('ArrowRight');
    expect(highlighted()).toEqual(['2']);
    press('ArrowDown');
    expect(highlighted()).toEqual(['W']);
    press('ArrowLeft');
    expect(highlighted()).toEqual(['Q']);
    press('ArrowUp');
    expect(highlighted()).toEqual(['1']);
  });

  it('puts the highlight back on the top result when the query changes', () => {
    pinned();
    press('ArrowRight');
    press('ArrowRight');
    typeIn('e');
    expect(highlighted()).toEqual(['1']);
  });

  it('opens the highlighted tile on ↵, and in a new tab on ⇧↵', () => {
    pinned();
    press('ArrowRight');
    press('Enter');
    expect(open).toHaveBeenLastCalledWith('G', false);
    press('Enter', { shiftKey: true });
    expect(open).toHaveBeenLastCalledWith('G', true);
  });

  it('opens nothing on ↵ while an IME composes', () => {
    pinned();
    press('Enter', { isComposing: true });
    expect(open).not.toHaveBeenCalled();
  });

  it('says nothing matches, and ↵ opens nothing', () => {
    pinned();
    typeIn('zzz');
    expect(screen.getByText('No keys match "zzz"')).toBeDefined();
    expect(highlighted()).toEqual([]);
    press('Enter');
    expect(open).not.toHaveBeenCalled();
  });

  it('clears the query on Esc first, then closes', () => {
    pinned();
    typeIn('git');
    press('Escape');
    expect(search().value).toBe('');
    expect(visible()).toHaveLength(4);
    expect(close).not.toHaveBeenCalled();
    press('Escape');
    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves keys typed outside the search to the page', () => {
    pinned();
    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(close).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    field.remove();
  });

  it('keeps the search focused through a press on a tile, and still opens it on click', () => {
    pinned();
    expect(fireEvent.mouseDown(tileButton(/^Option G:/))).toBe(false);
    fireEvent.click(tileButton(/^Option G:/), { shiftKey: true });
    expect(open).toHaveBeenCalledWith('G', true);
    expect(document.activeElement).toBe(search());
  });

  it('says "No keys yet" for an empty keymap', () => {
    pinned({ tiles: [] });
    expect(screen.getByText('No keys yet')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open keymap' })).toBeDefined();
  });

  it('reads Alt elsewhere', () => {
    pinned(FOUR, 'other');
    expect(tileButton(/^Alt 1: Docs/)).toBeDefined();
  });
});
