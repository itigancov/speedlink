// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { KEYBOARD_ORDER, type Key } from '@/domain/keys';
import type { OverlayModel, OverlayTile } from '@/domain/overlay-model';
import { Overlay } from './Overlay';

let open: Mock<(key: Key, force: boolean) => void>;
let edit: Mock<(key: Key) => void>;
let openKeymap: Mock<() => void>;
let close: Mock<() => void>;

const tile = (key: Key, name: string, subline: OverlayTile['subline']): OverlayTile => ({ key, name, subline });

const FOUR: OverlayModel = {
  tiles: [
    tile('1', 'Docs', { kind: 'tab', index: 3 }),
    tile('G', 'GitHub', { kind: 'other-window' }),
    tile('K', 'Calendar', { kind: 'mode', mode: 'smart', site: 'calendar.example.com' }),
    tile('Y', 'YouTube', { kind: 'mode', mode: 'new', site: 'youtube.com' }),
  ],
};

function renderOverlay(model: OverlayModel = FOUR, platform: 'mac' | 'other' = 'mac') {
  return render(<Overlay model={model} actions={{ open, edit, openKeymap, close }} platform={platform} />);
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

  it('shows one tile per key, with its keycap, name and subline, in the given order', () => {
    renderOverlay();
    const tiles = within(dialog()).getAllByTestId('overlay-tile');
    expect(tiles.map((element) => element.textContent)).toEqual([
      '1DocsOpen · tab 3',
      'GGitHubOpen · other window',
      'KCalendarcalendar.example.com',
      'YYouTubenew tab',
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

  it('shows "other window" in green', () => {
    renderOverlay();
    expect(screen.getByText('Open · other window').className).toContain('text-success-foreground');
    expect(screen.getByText('Open · tab 3').className).not.toContain('text-success-foreground');
  });

  it('shows the held badge, the hint and the legend with ⌥ on a Mac', () => {
    renderOverlay();
    expect(screen.getByText('⌥ held')).toBeDefined();
    expect(screen.getByText('Press a key — or keep typing to search')).toBeDefined();
    expect(screen.getByTestId('overlay-legend').textContent).toBe(
      'keygo⇧ + keyforce new tabtypesearch names & links⌥ releaseorEscclose' + 'open now — will switch, not reopen',
    );
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
    fireEvent.click(screen.getByText('Press a key — or keep typing to search'));
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
