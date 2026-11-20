// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { KEYBOARD_ORDER, type Key } from '@/domain/keys';
import type { OverlayModel } from '@/domain/overlay-model';
import type { AssignPageReply, EditShortcutReply, OpenKeyReply, UndoReply } from '@/platform/messaging';
import type { Platform } from '@/platform/platform-labels';
import { type PopupActions, PopupPage } from './PopupPage';

type Tab = Browser.tabs.Tab;

const PAGE_URL = 'https://github.com/acme/speedlink/pulls';
const activeTab = (fields: Partial<Tab> = {}): Tab =>
  ({
    id: 7,
    windowId: 1,
    index: 0,
    active: true,
    url: PAGE_URL,
    title: 'Pull requests · acme/speedlink',
    ...fields,
  }) as Tab;

let tabs: Tab[];
let query: MockInstance;
let assignPage: Mock<PopupActions['assignPage']>;
let openOptions: Mock<PopupActions['openOptions']>;
let close: Mock<PopupActions['close']>;
let openKey: Mock<PopupActions['openKey']>;
let getOverlayModel: Mock<PopupActions['getOverlayModel']>;
let editShortcut: Mock<PopupActions['editShortcut']>;
let undo: Mock<PopupActions['undo']>;

const actions = (): PopupActions => ({ assignPage, openOptions, close, openKey, getOverlayModel, editShortcut, undo });

const store = (key: string, fields: object = {}) =>
  browser.storage.sync.set({
    [`key.${key}`]: {
      link: 'https://youtube.com/',
      openMode: 'smart',
      tabMatch: 'site',
      closeCurrent: false,
      ...fields,
    },
  });

/** Every key but `except` holds a shortcut. */
async function fillAllBut(...except: Key[]) {
  const items: Record<string, object> = {};
  for (const key of KEYBOARD_ORDER) {
    if (except.includes(key)) continue;
    items[`key.${key}`] = { link: `https://site-${key.toLowerCase()}.example/`, name: `Site ${key}` };
  }
  await browser.storage.sync.set(items);
}

/** Lets storage, the tab read and React settle. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

async function renderPopup({ platform = 'mac', tabId }: { platform?: Platform; tabId?: number } = {}) {
  render(<PopupPage actions={actions()} platform={platform} tabId={tabId} />);
  await settle();
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name });
const isDisabled = (element: HTMLElement) => (element as HTMLButtonElement).disabled;
/** The key on the drop zone's big keycap, or null with none picked. */
const pickedKey = () => screen.getByTestId('picked-key').querySelector('[data-slot=key-cap]')?.textContent ?? null;
const chipGroup = () => screen.queryByRole('group', { name: 'Free & fitting' });
/** The visible text of each chip: the bare letter. */
const chips = () =>
  within(chipGroup() ?? document.body)
    .queryAllByRole('button')
    .map((chip) => chip.textContent);
const chip = (key: string, platform: 'mac' | 'other' = 'mac') => button(platform === 'mac' ? `⌥${key}` : `Alt+${key}`);
const miniKey = (key: string) => button(new RegExp(`^Option ${key}:`));
const queryMiniKey = (key: string) => screen.queryByRole('button', { name: new RegExp(`^Option ${key}:`) });
const showKeyboard = () => button('Show keyboard');
const opensAs = (mode = 'Smart switch') => screen.getByRole('combobox', { name: `Opens as: ${mode}` });
/** The footer's tip line, whose ⌥ is a key of its own, by its whole text. */
const tip = (text: string) =>
  screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === text);
const openKeymapLink = () => button('Open keymap →');
const press = (code: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  act(() => {
    fireEvent.keyDown(target, { code, ...init });
  });
const primary = () => screen.getByTestId('primary');

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  tabs = [activeTab()];
  query = (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockImplementation(
    async () => tabs,
  );
  assignPage = vi.fn(async (): Promise<AssignPageReply> => ({ kind: 'saved', undoId: 'u1' }));
  openOptions = vi.fn(async () => {});
  close = vi.fn();
  openKey = vi.fn(async (): Promise<OpenKeyReply> => ({ kind: 'opened', tabId: 7, switched: false }));
  getOverlayModel = vi.fn(async (): Promise<OverlayModel> => ({ tiles: [] }));
  editShortcut = vi.fn(async (): Promise<EditShortcutReply> => ({ kind: 'saved' }));
  undo = vi.fn(async (): Promise<UndoReply> => ({ kind: 'undone' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the tab', () => {
  it("is the active tab of the popup's window", async () => {
    await renderPopup();
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('is the named tab when one is given', async () => {
    vi.spyOn(browser.tabs, 'get').mockImplementation((async (id: number) =>
      activeTab({ id, title: 'Named tab' })) as never);
    await renderPopup({ tabId: 12 });

    expect(screen.getByText('Named tab')).toBeDefined();
    await press('Enter', { key: 'Enter' });
    expect(assignPage).toHaveBeenCalledWith(expect.objectContaining({ tabId: 12 }));
  });
});

describe('the page card', () => {
  it('shows the title and the link without its scheme', async () => {
    await renderPopup();
    expect(screen.getByText('Pull requests · acme/speedlink')).toBeDefined();
    expect(screen.getByText('github.com/acme/speedlink/pulls')).toBeDefined();
  });

  it('shows the coloured tile of the page, never its favicon', async () => {
    tabs = [activeTab({ favIconUrl: 'https://github.com/favicon.ico' })];
    const { container } = render(<PopupPage actions={actions()} platform="mac" />);
    await settle();
    const tile = container.querySelector<HTMLElement>('[data-slot="monogram"]');
    expect(tile?.textContent).toBe('P');
    expect(tile?.dataset.hue).toBe('amber');
    expect(container.querySelector('img')).toBeNull();
  });

  it('says which keys already open this tab, in the picker behind “Put it on another key too”', async () => {
    await store('Y', { link: 'https://github.com/' });
    await store('2', { link: PAGE_URL, tabMatch: 'exact' });
    await store('T', { link: 'https://github.com/other', tabMatch: 'exact' });
    await renderPopup();
    expect(screen.queryByText(/^Already on/)).toBeNull();
    fireEvent.click(button('Put it on another key too'));
    expect(screen.getByText('Already on ⌥2, ⌥Y')).toBeDefined();
  });

  it('says nothing about keys when none opens this tab', async () => {
    await renderPopup();
    expect(screen.queryByText(/^Already on/)).toBeNull();
  });
});

describe('picking a key', () => {
  it('picks the first free & fitting key, and offers at most 4', async () => {
    await renderPopup();
    expect(chips()).toEqual(['G', 'P', 'R', 'A']);
    expect(pickedKey()).toBe('G');
    expect(chip('G').getAttribute('aria-pressed')).toBe('true');
    expect(chip('P').getAttribute('aria-pressed')).toBe('false');
    expect(primary().textContent).toBe('Save to ⌥G');
    expect(screen.getByText('Press a key to put this page on it')).toBeDefined();
  });

  it('picks the first free key in keyboard order when no key fits', async () => {
    await fillAllBut('3', 'Z');
    await renderPopup();
    expect(chipGroup()).toBeNull();
    expect(pickedKey()).toBe('3');
  });

  it('picks a physical key press by its position', async () => {
    await renderPopup();
    await press('KeyK', { key: 'л' });
    expect(pickedKey()).toBe('K');
    expect(primary().textContent).toBe('Save to ⌥K');
  });

  it('ignores S and keys off the grid', async () => {
    await renderPopup();
    await press('KeyS');
    await press('Numpad3');
    expect(pickedKey()).toBe('G');
  });

  it.each(['metaKey', 'ctrlKey', 'altKey'])('ignores a press with %s held', async (modifier) => {
    await renderPopup();
    await press('KeyK', { [modifier]: true });
    expect(pickedKey()).toBe('G');
  });

  it('picks a clicked chip or mini-keyboard key', async () => {
    await renderPopup();
    fireEvent.click(chip('R'));
    expect(pickedKey()).toBe('R');
    fireEvent.click(showKeyboard());
    fireEvent.click(miniKey('7'));
    expect(pickedKey()).toBe('7');
  });

  it('labels mini-keyboard keys with their shortcut or as free, and keeps S out', async () => {
    await store('Y', { name: 'YouTube' });
    await renderPopup();
    fireEvent.click(showKeyboard());
    expect(miniKey('Y').getAttribute('aria-label')).toBe('Option Y: YouTube');
    expect(miniKey('K').getAttribute('aria-label')).toBe('Option K: free');
    expect(isDisabled(miniKey('S'))).toBe(true);
  });

  it('leaves key presses inside "Opens as" to the select', async () => {
    await renderPopup();
    await press('KeyK', {}, opensAs());
    expect(pickedKey()).toBe('G');
  });

  it('keeps the picked key when the keymap changes', async () => {
    await renderPopup();
    await press('KeyK');
    await act(() => store('G'));
    await settle();
    expect(pickedKey()).toBe('K');
  });
});

describe('saving', () => {
  it('↵ saves the picked key with Smart switch, then closes', async () => {
    await renderPopup();
    await press('Enter', { key: 'Enter' });
    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'G', tabId: 7, openMode: 'smart' });
    await settle();
    expect(close).toHaveBeenCalledOnce();
  });

  it('saves with the chosen open mode', async () => {
    await renderPopup();
    const select = opensAs();
    expect(select.textContent).toBe('Smart switch');
    await act(() => {
      fireEvent.keyDown(select, { key: 'Enter' });
    });
    fireEvent.click(screen.getByRole('option', { name: 'Background tab' }));
    await settle();
    expect(opensAs('Background tab')).toBeDefined();

    fireEvent.click(primary());

    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'G', tabId: 7, openMode: 'bg' });
  });

  it('a click on a chip or a mini-keyboard key keeps focus where it was, so ↵ then saves', async () => {
    await renderPopup();
    // A pointer press whose default is prevented doesn't move focus to the button.
    expect(fireEvent.mouseDown(chip('R'))).toBe(false);
    expect(fireEvent.mouseDown(showKeyboard())).toBe(false);
    fireEvent.click(showKeyboard());
    expect(fireEvent.mouseDown(miniKey('7'))).toBe(false);
    expect(fireEvent.mouseDown(button('Hide keyboard'))).toBe(false);
  });

  it('↵ still saves after the keyboard was shown or hidden with a click', async () => {
    await renderPopup();
    fireEvent.click(showKeyboard());
    await press('Enter', { key: 'Enter' });
    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'G', tabId: 7, openMode: 'smart' });
  });

  it('↵ on a focused button activates that button, not the save', async () => {
    await renderPopup();
    const target = chip('R');
    target.focus();
    await press('Enter', { key: 'Enter' }, target);
    expect(assignPage).not.toHaveBeenCalled();
  });

  it('disables the picker and the buttons while the save is on the way, so a double ↵ saves once', async () => {
    assignPage.mockImplementation(() => new Promise(() => {}));
    await renderPopup();
    await press('Enter', { key: 'Enter' });
    await press('Enter', { key: 'Enter' });
    await press('KeyK');

    expect(assignPage).toHaveBeenCalledOnce();
    expect(pickedKey()).toBe('G');
    expect(isDisabled(primary())).toBe(true);
    expect(isDisabled(chip('R'))).toBe(true);
    expect(isDisabled(opensAs())).toBe(true);
  });

  it.each([{ kind: 'failed' }, { kind: 'unusable' }] as const)(
    'stays open on $kind with "Couldn’t save ⌥K", until the next pick',
    async (reply) => {
      assignPage.mockResolvedValue(reply);
      await renderPopup();
      fireEvent.click(primary());
      await settle();

      expect(close).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toBe('Couldn’t save ⌥G');
      expect(isDisabled(primary())).toBe(false);

      await press('KeyK');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('stays open on a conflict and shows it from the keymap once the key was taken elsewhere', async () => {
    assignPage.mockImplementation(async () => {
      await store('G', { name: 'Gmail' });
      return { kind: 'conflict', existing: {} as never, moveTarget: 'I' };
    });
    await renderPopup();
    fireEvent.click(primary());
    await settle();

    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/^⌥G already opens Gmail\./);
    expect(primary().textContent).toBe('Replace ⌥G');
    expect(isDisabled(primary())).toBe(false);
  });
});

describe('a taken key', () => {
  beforeEach(() => store('K', { link: 'https://kagi.com/', name: 'Kagi' }));

  it('warns who holds it and turns the primary button into Replace', async () => {
    await renderPopup();
    await press('KeyK');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('⌥K already opens Kagi.Move it to ⌥A');
    expect(within(alert).getByText('Kagi').tagName).toBe('STRONG');
    expect(within(alert).getAllByRole('button')).toHaveLength(1);
    expect(primary().textContent).toBe('Replace ⌥K');
  });

  it('the primary button replaces', async () => {
    await renderPopup();
    await press('KeyK');
    fireEvent.click(primary());
    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'K', tabId: 7, openMode: 'smart', resolve: 'replace' });
  });

  it('offers no Move when no key is free', async () => {
    await fillAllBut();
    await renderPopup();
    await press('KeyK');
    expect(screen.getByRole('alert').textContent).toBe('⌥K already opens Site K.');
    expect(queryButton(/^Move it to/)).toBeNull();
  });

  it('keeps the chips view when the pick is a taken key', async () => {
    await renderPopup();
    await press('KeyK');
    expect(chips()).toEqual(['G', 'P', 'R', 'A']);
    expect(queryMiniKey('K')).toBeNull();
  });

  it('↵ replaces', async () => {
    await renderPopup();
    await press('KeyK');
    await press('Enter', { key: 'Enter' });
    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'K', tabId: 7, openMode: 'smart', resolve: 'replace' });
  });

  it('Move it to ⌥X moves the old shortcut', async () => {
    await renderPopup();
    await press('KeyK');
    fireEvent.click(button('Move it to ⌥A'));
    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'K', tabId: 7, openMode: 'smart', resolve: 'move' });
  });

  it('picking another key clears the conflict', async () => {
    await renderPopup();
    await press('KeyK');
    await press('KeyJ');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(primary().textContent).toBe('Save to ⌥J');
  });

  it('the key that already holds this page is an ordinary conflict', async () => {
    await store('P', { link: PAGE_URL, name: 'Pulls' });
    await renderPopup();
    fireEvent.click(button('Put it on another key too'));
    await press('KeyP');
    expect(screen.getByRole('alert').textContent).toMatch(/^⌥P already opens Pulls\./);
  });

  it('shows the conflict as soon as the picked key is taken elsewhere', async () => {
    await renderPopup();
    expect(pickedKey()).toBe('G');
    await act(() => store('G', { name: 'Gmail' }));
    await settle();
    expect(screen.getByRole('alert').textContent).toMatch(/^⌥G already opens Gmail\./);
    expect(chips()).toEqual(['P', 'R', 'A', 'I']);
  });
});

describe('all 35 keys in use', () => {
  it('has no chips and no picked key, says so, and saves nothing until a key is pressed', async () => {
    await fillAllBut();
    await renderPopup();

    expect(chipGroup()).toBeNull();
    expect(queryButton(/keyboard$/)).toBeNull();
    expect(miniKey('K')).toBeDefined();
    expect(screen.getByText('All 35 keys are in use — press one to replace it')).toBeDefined();
    expect(isDisabled(primary())).toBe(true);
    await press('Enter', { key: 'Enter' });
    expect(assignPage).not.toHaveBeenCalled();

    await press('KeyK');
    expect(primary().textContent).toBe('Replace ⌥K');
    expect(queryButton(/^Move it to/)).toBeNull();
    expect(miniKey('K').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the keyboard view', () => {
  it('starts on the chips, with no mini keyboard', async () => {
    await renderPopup();
    expect(chips()).toEqual(['G', 'P', 'R', 'A']);
    expect(queryMiniKey('K')).toBeNull();
    expect(showKeyboard().getAttribute('aria-expanded')).toBe('false');
  });

  it('gives each chip the full chord as its name', async () => {
    await renderPopup({ platform: 'other' });
    expect(chip('G', 'other').textContent).toBe('G');
    expect(within(screen.getByRole('group', { name: 'Free & fitting' })).getAllByRole('button')).toHaveLength(4);
  });

  it('swaps the chips for the mini keyboard and back', async () => {
    await renderPopup();
    fireEvent.click(showKeyboard());

    expect(chipGroup()).toBeNull();
    expect(miniKey('K')).toBeDefined();
    expect(miniKey('G').getAttribute('aria-pressed')).toBe('true');
    expect(button('Hide keyboard').getAttribute('aria-expanded')).toBe('true');
    expect(queryButton('Show keyboard')).toBeNull();

    fireEvent.click(button('Hide keyboard'));

    expect(chips()).toEqual(['G', 'P', 'R', 'A']);
    expect(queryMiniKey('K')).toBeNull();
    expect(showKeyboard().getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the picked key across the swap', async () => {
    await renderPopup();
    fireEvent.click(showKeyboard());
    fireEvent.click(miniKey('7'));
    fireEvent.click(button('Hide keyboard'));
    expect(pickedKey()).toBe('7');
    expect(chips().length).toBe(4);
    expect(
      within(screen.getByRole('group', { name: 'Free & fitting' })).queryAllByRole('button', { pressed: true }),
    ).toHaveLength(0);
  });

  it('opens on the chips every time', async () => {
    const { unmount } = render(<PopupPage actions={actions()} platform="mac" />);
    await settle();
    fireEvent.click(showKeyboard());
    unmount();
    await renderPopup();
    expect(chips()).toEqual(['G', 'P', 'R', 'A']);
  });

  it('picks a physical key in either view', async () => {
    await renderPopup();
    await press('KeyR');
    expect(pickedKey()).toBe('R');
    fireEvent.click(showKeyboard());
    await press('KeyK');
    expect(pickedKey()).toBe('K');
    expect(miniKey('K').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a non-chip pick in the zone without switching the view or pressing a chip', async () => {
    await renderPopup();
    await press('KeyK');
    expect(pickedKey()).toBe('K');
    expect(chips()).toEqual(['G', 'P', 'R', 'A']);
    for (const key of ['G', 'P', 'R', 'A']) expect(chip(key).getAttribute('aria-pressed')).toBe('false');
    expect(queryMiniKey('K')).toBeNull();
  });

  it('shows the keyboard from the start, with no toggle, when no key fits', async () => {
    await fillAllBut('3', 'Z');
    await renderPopup();
    expect(miniKey('3').getAttribute('aria-pressed')).toBe('true');
    expect(queryButton(/keyboard$/)).toBeNull();
  });

  it('keeps S reserved and shows picked, taken and free keys', async () => {
    await store('Y', { name: 'YouTube' });
    await renderPopup();
    fireEvent.click(showKeyboard());
    expect(isDisabled(miniKey('S'))).toBe(true);
    expect(miniKey('Y').getAttribute('aria-label')).toBe('Option Y: YouTube');
    expect(miniKey('G').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Opens as', () => {
  it('is a dropdown with no visible label, named with the current mode', async () => {
    await renderPopup();
    expect(screen.queryByText('Opens as')).toBeNull();
    expect(opensAs().textContent).toBe('Smart switch');
  });
});

describe('an unusable page: the launcher', () => {
  const NEW_TAB = 'chrome://newtab/';
  const MODEL: OverlayModel = {
    tiles: [
      { key: 'D', name: 'Docs', link: 'https://docs.example.com/', subline: { kind: 'tab', index: 3 } },
      {
        key: 'Y',
        name: 'YouTube',
        link: 'https://youtube.com/',
        subline: { kind: 'mode', mode: 'smart', site: 'youtube.com' },
      },
    ],
  };
  const tile = (key: string) => button(new RegExp(`^Option ${key}:`));

  beforeEach(() => {
    tabs = [activeTab({ id: 7, url: NEW_TAB, title: 'New Tab' })];
    getOverlayModel.mockResolvedValue(MODEL);
  });

  it.each([NEW_TAB, 'chrome://extensions/', 'https://chromewebstore.google.com/detail/abc'])(
    'on %s, says the page can’t be put on a key and shows the keys instead of the picker',
    async (url) => {
      tabs = [activeTab({ url, title: 'Extensions' })];
      await renderPopup();

      expect(screen.getByText('This page can’t be put on a key')).toBeDefined();
      expect(tile('D').textContent).toContain('Docs');
      expect(tile('Y').textContent).toContain('YouTube');
      expect(screen.queryByTestId('primary')).toBeNull();
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(queryButton(/keyboard$/)).toBeNull();
    },
  );

  it('asks for the model of the tab it came from', async () => {
    await renderPopup();
    expect(getOverlayModel).toHaveBeenCalledWith(7);
  });

  it('draws the overlay’s tiles: name, what it will do, and no pencil', async () => {
    await renderPopup();
    expect(tile('D').getAttribute('aria-label')).toBe('Option D: Docs, Open · tab 3');
    expect(screen.getByText('youtube.com')).toBeDefined();
    expect(queryButton(/^Edit/)).toBeNull();
  });

  it('draws the launcher’s tiles as the overlay does: a monogram tile, green when the page is open, in two columns', async () => {
    await renderPopup();
    expect(tile('D').querySelector('[data-slot="monogram"]')?.textContent).toBe('D');
    expect(tile('Y').querySelector('[data-slot="monogram"]')?.textContent).toBe('Y');
    expect(tile('D').classList.contains('bg-success-tile')).toBe(true);
    expect(tile('Y').classList.contains('bg-success-tile')).toBe(false);
    expect(tile('D').querySelector('[data-slot="key-open"]')).toBeNull();
    expect(screen.getByTestId('overlay-tiles').className).toContain('grid-cols-2');
  });

  it('keeps the picker for a usable page', async () => {
    tabs = [activeTab()];
    await renderPopup();
    expect(screen.getByTestId('primary')).toBeDefined();
    expect(screen.queryByTestId('overlay-tiles')).toBeNull();
  });

  it.each([
    ['a bare key', { code: 'KeyD' }, false],
    ['⌥ + key', { code: 'KeyD', altKey: true }, false],
    ['⇧ + key', { code: 'KeyD', shiftKey: true }, true],
    ['a key by its position, whatever the layout', { code: 'KeyD', key: 'в' }, false],
  ])('%s opens the key on the tab it came from', async (_name, init, force) => {
    await renderPopup();
    await press(init.code, init);
    expect(openKey).toHaveBeenCalledExactlyOnceWith({ key: 'D', tabId: 7, force });
  });

  it.each([
    ['S', { code: 'KeyS' }],
    ['a key off the grid', { code: 'Numpad3' }],
    ['⌘ + key', { code: 'KeyD', metaKey: true }],
    ['Ctrl + key', { code: 'KeyD', ctrlKey: true }],
  ])('ignores %s', async (_name, init) => {
    await renderPopup();
    await press(init.code, init);
    expect(openKey).not.toHaveBeenCalled();
  });

  it('opens a clicked tile, and with ⇧ in a new tab', async () => {
    await renderPopup();
    fireEvent.click(tile('Y'));
    await settle();
    expect(openKey).toHaveBeenLastCalledWith({ key: 'Y', tabId: 7, force: false });
    fireEvent.click(tile('Y'), { shiftKey: true });
    expect(openKey).toHaveBeenLastCalledWith({ key: 'Y', tabId: 7, force: true });
  });

  it.each(['opened', 'noop'] as const)('closes the popup once the key %s', async (kind) => {
    openKey.mockResolvedValue(kind === 'opened' ? { kind, tabId: 7, switched: false } : { kind });
    await renderPopup();
    await press('KeyD');
    await settle();
    expect(close).toHaveBeenCalledOnce();
  });

  it('says a free key is free, and stays open', async () => {
    openKey.mockResolvedValue({ kind: 'free' });
    await renderPopup();
    await press('KeyQ');
    await settle();

    expect(screen.getByText('⌥Q is free')).toBeDefined();
    expect(close).not.toHaveBeenCalled();
  });

  it('says it could not open a key, and stays open', async () => {
    openKey.mockResolvedValue({ kind: 'failed' });
    await renderPopup();
    await press('KeyD');
    await settle();

    expect(screen.getByText('Couldn’t open ⌥D')).toBeDefined();
    expect(close).not.toHaveBeenCalled();
  });

  it('counts a request that never reached the background as failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    openKey.mockRejectedValue(new Error('no background'));
    await renderPopup();
    await press('KeyD');
    await settle();

    expect(screen.getByText('Couldn’t open ⌥D')).toBeDefined();
  });

  it('clears the line on the next press', async () => {
    openKey.mockResolvedValueOnce({ kind: 'free' });
    await renderPopup();
    await press('KeyQ');
    await settle();
    await press('KeyD');
    await settle();

    expect(screen.queryByText('⌥Q is free')).toBeNull();
  });

  it('reads Alt+Q off a Mac', async () => {
    openKey.mockResolvedValue({ kind: 'free' });
    await renderPopup({ platform: 'other' });
    await press('KeyQ');
    await settle();

    expect(screen.getByText('Alt+Q is free')).toBeDefined();
  });

  it('says there are no keys yet, with a way to the keymap', async () => {
    getOverlayModel.mockResolvedValue({ tiles: [] });
    await renderPopup();

    expect(screen.getByText('No keys yet')).toBeDefined();
    fireEvent.click(button('Open keymap'));
    await settle();
    expect(openOptions).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('has no link in the line itself, and Open keymap → alone in the footer', async () => {
    await renderPopup();
    expect(queryButton('Open keymap')).toBeNull();
    expect(screen.queryByText(/^Hold /)).toBeNull();
    fireEvent.click(openKeymapLink());
    await settle();
    expect(openOptions).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the footer link next to the empty state', async () => {
    getOverlayModel.mockResolvedValue({ tiles: [] });
    await renderPopup();
    expect(screen.getByText('No keys yet')).toBeDefined();
    expect(openKeymapLink()).toBeDefined();
  });

  it('scrolls its tiles inside the popup past 12 keys', async () => {
    getOverlayModel.mockResolvedValue({
      tiles: KEYBOARD_ORDER.slice(0, 14).map((key) => ({
        key,
        name: `Site ${key}`,
        link: 'https://x.example/',
        subline: { kind: 'mode' as const, mode: 'new' as const, site: 'x.example' },
      })),
    });
    await renderPopup();

    expect(screen.getAllByTestId('overlay-tile')).toHaveLength(14);
    expect(screen.getByTestId('overlay-tiles').className).toContain('overflow-y-auto');
  });
});

describe('the frame', () => {
  it('shows the name in the header and no icon to the keymap', async () => {
    await renderPopup();
    expect(screen.getByRole('heading', { name: 'SpeedLink' })).toBeDefined();
    expect(queryButton('Open keymap')).toBeNull();
  });

  it('says to hold ⌥ for all keys, and opens the keymap from the footer link', async () => {
    await renderPopup();
    expect(tip('Hold ⌥ to see all keys')).toBeDefined();
    expect(screen.getByText('⌥').tagName).toBe('KBD');
    fireEvent.click(openKeymapLink());
    await settle();
    expect(openOptions).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('draws the header and footer while it loads', () => {
    query.mockImplementation(() => new Promise(() => {}));
    render(<PopupPage actions={actions()} platform="mac" />);
    expect(screen.getByRole('heading', { name: 'SpeedLink' })).toBeDefined();
    expect(tip('Hold ⌥ to see all keys')).toBeDefined();
    expect(openKeymapLink()).toBeDefined();
  });

  it('reads Alt + K off a Mac', async () => {
    await renderPopup({ platform: 'other' });
    expect(primary().textContent).toBe('Save to Alt+G');
    expect(screen.getByText('Alt +')).toBeDefined();
    expect(tip('Hold Alt to see all keys')).toBeDefined();
    expect(chip('G', 'other')).toBeDefined();
  });
});

describe('the key card', () => {
  /** Matches the tab by its site, though its link is only the site's root. */
  const GITHUB = { link: 'https://github.com/', name: 'GitHub', tabMatch: 'site' };

  const removeLink = (chord = '⌥G') => button(`Remove from ${chord}`);
  const moveLink = () => button(/^Move to another key/);
  const exactLink = () => button(/^Use this exact page instead/);
  const tooLink = () => button('Put it on another key too');
  const inlineLine = () => screen.getByRole('status');
  /** A reply for remove/move/exactPage that also changes storage as the background would. */
  const undoHandle = { id: 'u1', expiresAt: Date.now() + 60_000 };

  describe('what it shows', () => {
    it('takes the picker’s place on a page that is on a key', async () => {
      await store('G', GITHUB);
      await renderPopup();

      expect(screen.getByText('This page is on ⌥G')).toBeDefined();
      expect(screen.getByText('Saved as GitHub · github.com')).toBeDefined();
      expect(screen.getByText('⌥G', { selector: '[data-slot=key-tile]' })).toBeDefined();
      expect(screen.queryByTestId('primary')).toBeNull();
      expect(screen.queryByTestId('picked-key')).toBeNull();
      expect(screen.queryByText(/^Already on/)).toBeNull();
      expect(screen.getByText('Pull requests · acme/speedlink')).toBeDefined();
    });

    it('is not shown on a page that is on no key', async () => {
      await store('G', { link: 'https://other.example/' });
      await renderPopup();

      expect(screen.queryByText(/^This page is on/)).toBeNull();
      expect(primary()).toBeDefined();
    });

    it('still says “This page” when the shortcut matches by site, not “This site”', async () => {
      await store('G', GITHUB);
      await renderPopup();

      expect(screen.getByText('This page is on ⌥G')).toBeDefined();
      expect(screen.queryByText(/This site/)).toBeNull();
    });

    it('shows the site as the name of a shortcut with no name', async () => {
      await store('G', { link: 'https://github.com/' });
      await renderPopup();

      expect(screen.getByText('Saved as github.com · github.com')).toBeDefined();
    });

    it('reads Alt+G off a Mac', async () => {
      await store('G', GITHUB);
      await renderPopup({ platform: 'other' });

      expect(screen.getByText('This page is on Alt+G')).toBeDefined();
      expect(removeLink('Alt+G')).toBeDefined();
    });

    it('has no chips for one key', async () => {
      await store('G', GITHUB);
      await renderPopup();

      expect(screen.queryByRole('group', { name: 'Keys for this page' })).toBeNull();
    });

    it('follows the live keymap: a change shows, a cleared key falls back to the picker', async () => {
      await store('G', GITHUB);
      await renderPopup();

      await act(() => store('G', { ...GITHUB, name: 'Renamed' }));
      await settle();
      expect(screen.getByText('Saved as Renamed · github.com')).toBeDefined();

      await act(() => browser.storage.sync.remove('key.G'));
      await settle();
      expect(screen.queryByText(/^This page is on/)).toBeNull();
      expect(primary().textContent).toBe('Save to ⌥G');
    });
  });

  describe('a page on several keys', () => {
    beforeEach(async () => {
      await store('2', { ...GITHUB, name: 'Two' });
      await store('Y', { ...GITHUB, name: 'Why' });
    });

    it('shows the first key in keyboard order, with chips named by their chord, the current one pressed', async () => {
      await renderPopup();

      expect(screen.getByText('This page is on ⌥2')).toBeDefined();
      const chips = within(screen.getByRole('group', { name: 'Keys for this page' }));
      expect(chips.getByRole('button', { name: '⌥2' }).getAttribute('aria-pressed')).toBe('true');
      expect(chips.getByRole('button', { name: '⌥Y' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('switches to the other key’s card', async () => {
      await renderPopup();

      fireEvent.click(button('⌥Y'));

      expect(screen.getByText('This page is on ⌥Y')).toBeDefined();
      expect(screen.getByText('Saved as Why · github.com')).toBeDefined();
      expect(button('⌥Y').getAttribute('aria-pressed')).toBe('true');
      expect(removeLink('⌥Y')).toBeDefined();
    });
  });

  describe('Opens as', () => {
    beforeEach(() => store('G', { ...GITHUB, openMode: 'new' }));

    it('shows the key’s current mode, named for assistive tech', async () => {
      await renderPopup();

      expect(opensAs('New tab').textContent).toBe('New tab');
    });

    it('saves a new mode at once, with no Save button, undo or toast', async () => {
      await renderPopup();
      await act(() => {
        fireEvent.keyDown(opensAs('New tab'), { key: 'Enter' });
      });
      fireEvent.click(screen.getByRole('option', { name: 'Background tab' }));
      await settle();

      expect(editShortcut).toHaveBeenCalledExactlyOnceWith({
        key: 'G',
        tabId: 7,
        op: { kind: 'openMode', openMode: 'bg' },
      });
      expect(close).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).toBeNull();
      expect(queryButton('Undo')).toBeNull();
    });

    it('says it could not save, and keeps the stored mode', async () => {
      editShortcut.mockResolvedValue({ kind: 'failed' });
      await renderPopup();
      await act(() => {
        fireEvent.keyDown(opensAs('New tab'), { key: 'Enter' });
      });
      fireEvent.click(screen.getByRole('option', { name: 'Background tab' }));
      await settle();

      expect(screen.getByRole('alert').textContent).toBe('Couldn’t save ⌥G');
      expect(opensAs('New tab')).toBeDefined();
    });

    it('lets keys inside the dropdown drive the dropdown only', async () => {
      await renderPopup();
      await act(() => {
        fireEvent.keyDown(opensAs('New tab'), { key: 'Enter' });
      });
      await press('KeyK', {}, screen.getByRole('option', { name: 'Background tab' }));

      expect(editShortcut).not.toHaveBeenCalled();
      expect(screen.queryByText('Move to ⌥K')).toBeNull();
    });
  });

  describe('Use this exact page instead', () => {
    it('is offered when the tab’s URL differs from the link, with the URL as a hint', async () => {
      await store('G', GITHUB);
      await renderPopup();

      expect(exactLink().textContent).toContain('github.com/acme/speedlink/pulls');
    });

    it('is not offered when the link already is this exact page', async () => {
      await store('G', { ...GITHUB, link: PAGE_URL });
      await renderPopup();

      expect(queryButton(/^Use this exact page/)).toBeNull();
    });

    it('asks for the exact page, with no undo, and goes away once the keymap says so', async () => {
      await store('G', GITHUB);
      await renderPopup();

      fireEvent.click(exactLink());
      await settle();

      expect(editShortcut).toHaveBeenCalledExactlyOnceWith({ key: 'G', tabId: 7, op: { kind: 'exactPage' } });
      expect(screen.queryByRole('status')).toBeNull();
      expect(close).not.toHaveBeenCalled();

      await act(() => store('G', { ...GITHUB, link: PAGE_URL, tabMatch: 'exact' }));
      await settle();
      expect(queryButton(/^Use this exact page/)).toBeNull();
      expect(screen.getByText('This page is on ⌥G')).toBeDefined();
    });

    it('says it could not save', async () => {
      editShortcut.mockResolvedValue({ kind: 'failed' });
      await store('G', GITHUB);
      await renderPopup();

      fireEvent.click(exactLink());
      await settle();

      expect(screen.getByRole('alert').textContent).toBe('Couldn’t save ⌥G');
    });
  });

  describe('Remove', () => {
    /** The background's remove: the key is freed, the undo handle comes back. */
    const removing = () =>
      editShortcut.mockImplementation(async ({ key }) => {
        await browser.storage.sync.remove(`key.${key}`);
        return { kind: 'saved', undo: undoHandle };
      });

    it('frees the key, keeps the popup open and shows the picker under “Removed from ⌥G · Undo”', async () => {
      removing();
      await store('G', GITHUB);
      await renderPopup();

      fireEvent.click(removeLink());
      await settle();

      expect(editShortcut).toHaveBeenCalledExactlyOnceWith({ key: 'G', tabId: 7, op: { kind: 'remove' } });
      expect(close).not.toHaveBeenCalled();
      expect(inlineLine().textContent).toBe('Removed from ⌥G · Undo');
      expect(primary().textContent).toBe('Save to ⌥G');
    });

    it('shows the card for the page’s next key above the line', async () => {
      removing();
      await store('2', { ...GITHUB, name: 'Two' });
      await store('Y', { ...GITHUB, name: 'Why' });
      await renderPopup();

      fireEvent.click(removeLink('⌥2'));
      await settle();

      expect(inlineLine().textContent).toBe('Removed from ⌥2 · Undo');
      expect(screen.getByText('This page is on ⌥Y')).toBeDefined();
      expect(screen.queryByRole('group', { name: 'Keys for this page' })).toBeNull();
    });

    it('sends no page toast of its own: the popup is the result', async () => {
      removing();
      await store('G', GITHUB);
      await renderPopup();

      fireEvent.click(removeLink());
      await settle();

      expect(assignPage).not.toHaveBeenCalled();
    });

    it('is undone with the handle, then the card is back and the line is gone', async () => {
      removing();
      undo.mockImplementation(async () => {
        await store('G', GITHUB);
        return { kind: 'undone' };
      });
      await store('G', GITHUB);
      await renderPopup();
      fireEvent.click(removeLink());
      await settle();

      fireEvent.click(button('Undo'));
      await settle();

      expect(undo).toHaveBeenCalledExactlyOnceWith('u1');
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByText('This page is on ⌥G')).toBeDefined();
    });

    it('brings back the card of the key that was removed, not another key’s', async () => {
      removing();
      undo.mockImplementation(async () => {
        await store('2', { ...GITHUB, name: 'Two' });
        return { kind: 'undone' };
      });
      await store('2', { ...GITHUB, name: 'Two' });
      await store('Y', { ...GITHUB, name: 'Why' });
      await renderPopup();
      fireEvent.click(removeLink('⌥2'));
      await settle();
      expect(screen.getByText('This page is on ⌥Y')).toBeDefined();

      fireEvent.click(button('Undo'));
      await settle();

      expect(screen.getByText('This page is on ⌥2')).toBeDefined();
    });

    it('says the keys changed when the undo is refused, with no button left', async () => {
      removing();
      undo.mockResolvedValue({ kind: 'stale' });
      await store('G', GITHUB);
      await renderPopup();
      fireEvent.click(removeLink());
      await settle();

      fireEvent.click(button('Undo'));
      await settle();

      expect(inlineLine().textContent).toBe('Couldn’t undo — your keys changed');
      expect(queryButton('Undo')).toBeNull();
    });

    it('says the same when the undo fails', async () => {
      removing();
      undo.mockResolvedValue({ kind: 'failed' });
      await store('G', GITHUB);
      await renderPopup();
      fireEvent.click(removeLink());
      await settle();

      fireEvent.click(button('Undo'));
      await settle();

      expect(inlineLine().textContent).toBe('Couldn’t undo — your keys changed');
    });

    it('goes away after another successful write, so it never offers to undo the wrong thing', async () => {
      removing();
      await store('2', { ...GITHUB, name: 'Two' });
      await store('Y', { ...GITHUB, name: 'Why' });
      await renderPopup();
      fireEvent.click(removeLink('⌥2'));
      await settle();
      editShortcut.mockResolvedValue({ kind: 'saved' });

      await act(() => {
        fireEvent.keyDown(opensAs(), { key: 'Enter' });
      });
      fireEvent.click(screen.getByRole('option', { name: 'Background tab' }));
      await settle();

      expect(screen.queryByRole('status')).toBeNull();
    });

    it('lasts up to the record’s lifetime, then goes', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        editShortcut.mockImplementation(async ({ key }) => {
          await browser.storage.sync.remove(`key.${key}`);
          return { kind: 'saved', undo: { id: 'u1', expiresAt: Date.now() + 60_000 } };
        });
        await store('G', GITHUB);
        render(<PopupPage actions={actions()} platform="mac" />);
        await act(() => vi.advanceTimersByTimeAsync(10));
        fireEvent.click(removeLink());
        await act(() => vi.advanceTimersByTimeAsync(10));
        expect(inlineLine()).toBeDefined();

        await act(() => vi.advanceTimersByTimeAsync(59_000));
        expect(inlineLine()).toBeDefined();
        await act(() => vi.advanceTimersByTimeAsync(2_000));

        expect(screen.queryByRole('status')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('redraws from the fresh keymap, with no message, when the key was already free', async () => {
      editShortcut.mockImplementation(async () => {
        await browser.storage.sync.remove('key.G');
        return { kind: 'missing' };
      });
      await store('G', GITHUB);
      await renderPopup();

      fireEvent.click(removeLink());
      await settle();

      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(primary()).toBeDefined();
    });
  });

  describe('Move to another key', () => {
    beforeEach(async () => {
      await store('G', GITHUB);
      await store('K', { link: 'https://kagi.com/', name: 'Kagi' });
    });

    const startMove = async () => {
      await renderPopup();
      fireEvent.click(moveLink());
      await settle();
    };

    it('opens the picker in move mode: fitting chips for the shortcut, a Move primary, no Opens as', async () => {
      await startMove();

      expect(chips()).toEqual(['I', 'T', 'H', 'U']);
      expect(primary().textContent).toBe('Move to ⌥I');
      expect(pickedKey()).toBe('I');
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(queryButton('Cancel')).not.toBeNull();
      expect(screen.queryByText('This page is on ⌥G')).toBeNull();
    });

    it('moves on the primary and closes the popup, the toast being the background’s', async () => {
      await startMove();
      await press('KeyT');

      fireEvent.click(primary());
      await settle();

      expect(editShortcut).toHaveBeenCalledExactlyOnceWith({
        key: 'G',
        tabId: 7,
        op: { kind: 'move', to: 'T' },
      });
      expect(close).toHaveBeenCalledOnce();
    });

    it('moves on ↵', async () => {
      await startMove();

      await press('Enter', { key: 'Enter' });

      expect(editShortcut).toHaveBeenCalledExactlyOnceWith({ key: 'G', tabId: 7, op: { kind: 'move', to: 'I' } });
    });

    it('ignores a press on the source key, which is drawn taken', async () => {
      await startMove();
      await press('KeyT');
      await press('KeyG');

      expect(pickedKey()).toBe('T');
      fireEvent.click(showKeyboard());
      expect(miniKey('G').getAttribute('aria-pressed')).not.toBe('true');
      fireEvent.click(miniKey('G'));
      expect(pickedKey()).toBe('T');
    });

    it('answers a taken key with the conflict alert, no Move button and a dark Replace', async () => {
      await startMove();

      await press('KeyK');

      expect(screen.getByRole('alert').textContent).toBe('⌥K already opens Kagi.');
      expect(queryButton(/^Move it to/)).toBeNull();
      expect(primary().textContent).toBe('Replace ⌥K');
    });

    it('replaces with resolve: replace, and ↵ does the same', async () => {
      await startMove();
      await press('KeyK');

      await press('Enter', { key: 'Enter' });

      expect(editShortcut).toHaveBeenCalledExactlyOnceWith({
        key: 'G',
        tabId: 7,
        op: { kind: 'move', to: 'K', resolve: 'replace' },
      });
    });

    it('stays in move mode with “Couldn’t save ⌥K” when the move failed, so it can be retried', async () => {
      editShortcut.mockResolvedValue({ kind: 'failed' });
      await startMove();
      await press('KeyT');
      fireEvent.click(primary());
      await settle();

      expect(close).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toBe('Couldn’t save ⌥T');
      expect(primary().textContent).toBe('Move to ⌥T');
      expect(isDisabled(primary())).toBe(false);
    });

    it('shows the conflict from the fresh keymap when the target got taken meanwhile', async () => {
      editShortcut.mockImplementation(async () => {
        await store('T', { link: 'https://t.example/', name: 'Tee' });
        return { kind: 'conflict', existing: { link: 'https://t.example/', name: 'Tee' } as never };
      });
      await startMove();
      await press('KeyT');
      fireEvent.click(primary());
      await settle();

      expect(screen.getByRole('alert').textContent).toBe('⌥T already opens Tee.');
      expect(primary().textContent).toBe('Replace ⌥T');
    });

    it('goes back to the card on Cancel, without closing', async () => {
      await startMove();

      fireEvent.click(button('Cancel'));

      expect(screen.getByText('This page is on ⌥G')).toBeDefined();
      expect(close).not.toHaveBeenCalled();
    });

    it('falls back to the card/picker when the key was cleared meanwhile', async () => {
      await startMove();

      await act(() => browser.storage.sync.remove('key.G'));
      await settle();

      expect(screen.queryByText(/^Move to/)).toBeNull();
      expect(primary().textContent).toBe('Save to ⌥G');
    });
  });

  describe('Put it on another key too', () => {
    beforeEach(() => store('G', GITHUB));

    it('shows the normal picker with the Already on line, and Cancel', async () => {
      await renderPopup();

      fireEvent.click(tooLink());

      expect(screen.getByText('Already on ⌥G')).toBeDefined();
      expect(screen.queryByText('This page is on ⌥G')).toBeNull();
      expect(primary().textContent).toBe('Save to ⌥P');
      expect(opensAs()).toBeDefined();
      expect(queryButton('Cancel')).not.toBeNull();
    });

    it('saves through assignPage and closes, as any assign', async () => {
      await renderPopup();
      fireEvent.click(tooLink());

      fireEvent.click(primary());
      await settle();

      expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'P', tabId: 7, openMode: 'smart' });
      expect(close).toHaveBeenCalledOnce();
    });

    it('goes back to the card on Cancel', async () => {
      await renderPopup();
      fireEvent.click(tooLink());

      fireEvent.click(button('Cancel'));

      expect(screen.getByText('This page is on ⌥G')).toBeDefined();
      expect(queryButton('Cancel')).toBeNull();
    });
  });

  it('leaves the launcher alone on a page that can’t take a key', async () => {
    tabs = [activeTab({ url: 'chrome://newtab/', title: 'New Tab' })];
    await store('G', GITHUB);
    await renderPopup();

    expect(screen.queryByText(/^This page is on/)).toBeNull();
    expect(screen.getByText('This page can’t be put on a key')).toBeDefined();
  });

  it('shows nothing of the card in the page card above it', async () => {
    await store('G', GITHUB);
    await renderPopup();

    expect(screen.queryByText(/^Already on/)).toBeNull();
    expect(screen.getAllByText('github.com/acme/speedlink/pulls').length).toBeGreaterThan(0);
  });
});
