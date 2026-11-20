// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ROW_STAGGER } from '@/domain/key-grid';
import { KEYBOARD_ROWS, type Key, type KeyLabel } from '@/domain/keys';
import { chordLabel, pasteLabel, triggerWord } from '@/platform/platform-labels';
import { installTabsOnReplaced } from '@/test/fake-replaced';
import { OptionsPage } from './OptionsPage';

type Tab = Browser.tabs.Tab;

const tab = (id: number, fields: Partial<Tab> = {}): Tab =>
  ({
    id,
    windowId: 1,
    index: id,
    url: 'https://example.com/',
    title: 'Example',
    lastAccessed: id,
    pinned: false,
    incognito: false,
    groupId: -1,
    ...fields,
  }) as Tab;

const OPTIONS_URL = 'chrome-extension://abc/options.html';
let openTabs: Tab[];
/** The key Chrome has on `toggle-overlay`: '' when the user (or an update from v1) left it unbound. */
let overlayShortcut: string;

const store = (key: string, fields: object = {}) =>
  browser.storage.sync.set({
    [`key.${key}`]: {
      link: 'https://github.com/',
      openMode: 'smart',
      tabMatch: 'site',
      closeCurrent: false,
      ...fields,
    },
  });

/** Lets storage, tab reads and React settle; advances fake time by `ms`. */
const advance = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

async function renderPage(hash = '') {
  window.history.replaceState(null, '', `/options.html${hash}`);
  render(<OptionsPage />);
  await advance();
}

/** The trigger word in key names: the test environment's platform. */
const T = triggerWord();

/** A key, found even while the dialog's scrim hides the page from assistive tech. */
const keyButton = (key: string) => screen.getByRole('button', { name: new RegExp(`^${T} ${key}:`), hidden: true });
const selectedKey = () =>
  screen.queryByRole('button', { pressed: true, hidden: true })?.getAttribute('aria-label') ?? null;

const editor = () => screen.queryByRole('dialog', { name: 'Edit key' });
const inEditor = () => within(screen.getByRole('dialog', { name: 'Edit key' }));
/** The editor's key chip, "⌥K" or "Alt+K". */
const chip = () => editor()?.querySelector('[data-slot="editor-chip"]')?.textContent ?? null;
const title = () => inEditor().getByRole('heading', { level: 2 }).textContent;
const doneButton = () => inEditor().getByRole('button', { name: 'Done' });
const moreOptions = () => inEditor().getByRole('button', { name: 'More options' });
/** An Opens as segment, by its full name. */
const mode = (name: string) => inEditor().getByRole('radio', { name });

const readItem = async (key: string): Promise<{ link?: string; name?: string } | undefined> =>
  (await browser.storage.sync.get(`key.${key}`))[`key.${key}`] as never;

const linkField = () => screen.getByLabelText('Link') as HTMLInputElement;
const nameField = () => screen.getByLabelText('Name — optional') as HTMLInputElement;
const type = (field: HTMLInputElement, value: string) => act(() => fireEvent.change(field, { target: { value } }));
const saved = () => screen.queryByText('Saved');
const searchField = () =>
  screen.getByRole('searchbox', { name: 'Find a link, site or key', hidden: true }) as HTMLInputElement;
const press = (target: Element, key: string) => act(() => fireEvent.keyDown(target, { key, code: key }));
/** A new `#key=K` while the page is open: the way, besides ⌥ + a free key, to switch an open dialog's key. */
const goToKey = (key: string) =>
  act(async () => {
    window.location.hash = `#key=${key}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const closeButton = () => inEditor().getByRole('button', { name: 'Close editor' });
/** A press on the scrim, as Radix sees an outside click. */
const clickScrim = async () => {
  const scrim = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
  await advance();
  act(() => {
    fireEvent.pointerDown(scrim);
    fireEvent.pointerUp(scrim);
    fireEvent.click(scrim);
  });
  await advance();
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.useFakeTimers();
  installTabsOnReplaced();
  openTabs = [tab(1, { url: OPTIONS_URL, title: 'SpeedLink', lastAccessed: 100 })];
  (vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<() => Promise<Tab[]>>).mockImplementation(
    async () => openTabs,
  );
  (
    vi.spyOn(browser.windows, 'getAll') as unknown as MockInstance<() => Promise<Browser.windows.Window[]>>
  ).mockImplementation(async () => [{ id: 1, type: 'normal' } as Browser.windows.Window]);
  overlayShortcut = 'Alt+S';
  (
    vi.spyOn(browser.commands, 'getAll') as unknown as MockInstance<() => Promise<Browser.commands.Command[]>>
  ).mockImplementation(async () => [
    { name: '_execute_action', shortcut: '' },
    { name: 'toggle-overlay', shortcut: overlayShortcut },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('selection', () => {
  it('selects nothing and shows no dialog without a hash', async () => {
    await store('G');
    await renderPage();
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('opens the dialog on the key in #key=K', async () => {
    await store('G');
    await store('Y');
    await renderPage('#key=Y');
    expect(selectedKey()).toMatch(new RegExp(`^${T} Y:`));
    expect(editor()).not.toBeNull();
    expect(chip()).toBe(chordLabel('Y'));
  });

  it('ignores #key=S: nothing is selected', async () => {
    await store('G');
    await renderPage('#key=S');
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('never selects S by a click', async () => {
    await renderPage();
    expect((keyButton('S') as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens the dialog on a clicked key and mirrors it to the hash', async () => {
    await renderPage();
    act(() => keyButton('K').click());
    expect(selectedKey()).toBe(`${T} K: free`);
    expect(chip()).toBe(chordLabel('K'));
    expect(window.location.hash).toBe('#key=K');
  });

  it('closing clears the hash', async () => {
    await renderPage('#key=K');
    act(() => doneButton().click());
    expect(editor()).toBeNull();
    expect(selectedKey()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('switches on hashchange', async () => {
    await renderPage();
    await act(async () => {
      window.location.hash = '#key=J';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(selectedKey()).toBe(`${T} J: free`);
    expect(chip()).toBe(chordLabel('J'));
  });

  it('switches an open dialog to the key in a new #key', async () => {
    await store('G', { name: 'GitHub' });
    await renderPage('#key=K');
    await act(async () => {
      window.location.hash = '#key=G';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(title()).toBe('GitHub');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('the dialog', () => {
  it('is a modal dialog named "Edit key" that hides the page behind it from assistive tech', async () => {
    await renderPage('#key=K');
    expect(editor()?.getAttribute('aria-modal')).toBe('true');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`^${T} K:`) })).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('gives the page back once it closes', async () => {
    await renderPage('#key=K');
    act(() => doneButton().click());
    await advance();
    expect(screen.getByRole('searchbox')).toBeDefined();
    expect(screen.getByRole('button', { name: new RegExp(`^${T} K:`) })).toBeDefined();
  });
});

describe('closing the dialog', () => {
  it('× closes it', async () => {
    await renderPage('#key=K');
    act(() => closeButton().click());
    expect(editor()).toBeNull();
  });

  it('Done closes it', async () => {
    await renderPage('#key=K');
    act(() => doneButton().click());
    expect(editor()).toBeNull();
  });

  it('a click on the scrim closes it', async () => {
    await renderPage('#key=K');
    await clickScrim();
    expect(editor()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('Esc outside a field closes it', async () => {
    await renderPage('#key=G');
    act(() => doneButton().focus());
    press(doneButton(), 'Escape');
    expect(editor()).toBeNull();
  });

  it('Esc in a field without a change closes it', async () => {
    await store('G');
    await renderPage('#key=G');
    act(() => nameField().focus());
    press(nameField(), 'Escape');
    expect(editor()).toBeNull();
  });

  it('Esc in a changed field only leaves the field, keeping the text; a second Esc closes', async () => {
    await store('G');
    await renderPage('#key=G');
    act(() => nameField().focus());
    await type(nameField(), 'Code');

    press(nameField(), 'Escape');
    expect(editor()).not.toBeNull();
    expect(nameField().value).toBe('Code');
    expect(document.activeElement).toBe(editor());

    press(editor() as HTMLElement, 'Escape');
    expect(editor()).toBeNull();
  });

  it('saves a valid draft once on close', async () => {
    await store('G');
    await renderPage('#key=G');
    const set = vi.spyOn(browser.storage.sync, 'set');

    await type(nameField(), 'Code');
    act(() => doneButton().click());
    await advance(1000);

    expect(set).toHaveBeenCalledTimes(1);
    expect((await readItem('G'))?.name).toBe('Code');
  });

  it('a scrim click keeps a valid edit too', async () => {
    await store('G');
    await renderPage('#key=G');
    await type(nameField(), 'Code');
    await clickScrim();
    await advance(1000);
    expect((await readItem('G'))?.name).toBe('Code');
  });

  it('discards an invalid draft on close', async () => {
    await store('G');
    await renderPage('#key=G');
    const set = vi.spyOn(browser.storage.sync, 'set');

    await type(linkField(), 'mailto:x@y.z');
    act(() => doneButton().click());
    await advance(1000);
    act(() => keyButton('G').click());

    expect(set).not.toHaveBeenCalled();
    expect(linkField().value).toBe('https://github.com/');
  });
});

describe('focus', () => {
  it('a free key opens with focus in Link', async () => {
    await renderPage();
    act(() => keyButton('K').focus());
    act(() => keyButton('K').click());
    await advance();
    expect(document.activeElement).toBe(linkField());
  });

  it('an assigned key opens with focus on the dialog, no field active', async () => {
    await store('G');
    await renderPage();
    act(() => keyButton('G').focus());
    act(() => keyButton('G').click());
    await advance();
    expect(document.activeElement).toBe(editor());
  });

  it('opening on #key focuses the dialog the same way', async () => {
    await store('G');
    await renderPage('#key=G');
    await advance();
    expect(document.activeElement).toBe(editor());
  });

  it('closing returns focus to the key', async () => {
    await renderPage('#key=K');
    act(() => doneButton().focus());
    act(() => doneButton().click());
    await advance();
    expect(document.activeElement).toBe(keyButton('K'));
  });

  it('Esc and a scrim click return focus to the key too', async () => {
    await store('G');
    await renderPage('#key=G');
    await advance();
    press(editor() as HTMLElement, 'Escape');
    await advance();
    expect(document.activeElement).toBe(keyButton('G'));

    act(() => keyButton('G').click());
    await advance();
    await clickScrim();
    await advance();
    expect(document.activeElement).toBe(keyButton('G'));
  });

  it('with nothing selected, the first key is the keyboard’s tab stop', async () => {
    await renderPage();
    expect(keyButton('1').tabIndex).toBe(0);
    expect(keyButton('K').tabIndex).toBe(-1);
  });

  it('the arrows move focus between keys, passing over S, and select nothing', async () => {
    await renderPage();
    act(() => keyButton('A').focus());
    press(keyButton('A'), 'ArrowRight');
    expect(document.activeElement).toBe(keyButton('D'));
    press(keyButton('D'), 'ArrowUp');
    expect(document.activeElement).toBe(keyButton('E'));
    expect(selectedKey()).toBeNull();
  });
});

describe('Opens as', () => {
  it('is four segments with short labels, each named by its full term; the choice writes the open mode', async () => {
    await store('G');
    await renderPage('#key=G');
    const segments = within(inEditor().getByRole('group', { name: 'Opens as' })).getAllByRole('radio');
    expect(segments.map((segment) => segment.getAttribute('aria-label'))).toEqual([
      'Smart switch',
      'New tab',
      'This tab',
      'Background tab',
    ]);
    expect(segments.map((segment) => segment.textContent)).toEqual(['Smart', 'New tab', 'This tab', 'Background']);
    expect(mode('Smart switch').getAttribute('aria-checked')).toBe('true');

    act(() => mode('Background tab').click());
    expect(mode('Background tab').getAttribute('aria-checked')).toBe('true');
    await advance(400);
    expect(await readItem('G')).toMatchObject({ openMode: 'bg' });
  });

  it('describes the chosen mode under the control, with no Recommended badge', async () => {
    await renderPage('#key=K');
    expect(inEditor().getByText('Jumps to the tab if it’s already open, otherwise opens a new one.')).toBeDefined();
    act(() => mode('This tab').click());
    expect(inEditor().getByText('Replaces the page you’re looking at.')).toBeDefined();
    expect(screen.queryByText('Recommended')).toBeNull();
  });

  it('draws a tab-strip preview hidden from assistive tech, following the draft', async () => {
    await store('G', { name: 'Code', tabMatch: 'page' });
    await renderPage('#key=G');
    const preview = editor()?.querySelector('[data-slot="tab-strip-preview"]');
    expect(preview?.getAttribute('aria-hidden')).toBe('true');
    expect(preview?.textContent).toContain('Code');
    expect(preview?.textContent).not.toContain('closed');

    act(() => moreOptions().click());
    act(() => screen.getByRole('checkbox', { name: 'Close the tab I’m on afterwards' }).click());
    expect(preview?.textContent).toContain('closed');
  });
});

describe('More options', () => {
  const tabMatch = () => screen.queryByRole('group', { name: 'Count a tab as “already open” when it shows' });

  it('is collapsed by default, hiding the tab match and close current', async () => {
    await store('G', { tabMatch: 'page' });
    await renderPage('#key=G');
    expect(moreOptions().getAttribute('aria-expanded')).toBe('false');
    expect(tabMatch()).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Close the tab I’m on afterwards' })).toBeNull();

    act(() => moreOptions().click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('true');
    expect(tabMatch()).not.toBeNull();
  });

  it('opens by itself on a key with a non-default tab match or close current', async () => {
    await store('G', { tabMatch: 'exact' });
    await store('Y', { closeCurrent: true, tabMatch: 'page' });
    await store('K', { tabMatch: 'page' });
    await renderPage('#key=G');
    expect(moreOptions().getAttribute('aria-expanded')).toBe('true');
    act(() => doneButton().click());
    act(() => keyButton('Y').click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('true');
    act(() => doneButton().click());
    act(() => keyButton('K').click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('false');
  });

  it('collapses again each time the dialog opens, and on a key switch', async () => {
    await store('G', { tabMatch: 'page' });
    await renderPage('#key=G');
    act(() => moreOptions().click());
    act(() => doneButton().click());
    act(() => keyButton('G').click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('false');

    act(() => moreOptions().click());
    await goToKey('K');
    expect(moreOptions().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the editor footer', () => {
  const clearButton = () => inEditor().getByRole('button', { name: 'Clear key' }) as HTMLButtonElement;

  it('Clear key frees the key at once and leaves the editor open on the free key', async () => {
    await store('G');
    await renderPage('#key=G');
    act(() => clearButton().click());
    await advance();
    expect(await readItem('G')).toBeUndefined();
    expect(title()).toBe('Free key');
    expect(chip()).toBe(chordLabel('G'));
    expect(clearButton().disabled).toBe(true);
  });

  it('shows Saved on an assigned key and nothing on an untouched free key', async () => {
    await store('G');
    await renderPage('#key=G');
    expect(within(inEditor().getByRole('status')).getByText('Saved')).toBeDefined();
    act(() => doneButton().click());
    act(() => keyButton('K').click());
    expect(inEditor().getByRole('status').textContent).toBe('');
  });
});

describe('focus into Link', () => {
  it('↵ from the search focuses Link of the key it opens', async () => {
    await store('G', { name: 'GitHub' });
    await renderPage();
    act(() => searchField().focus());
    await type(searchField(), 'git');
    press(searchField(), 'Enter');
    await advance();
    expect(chip()).toBe(chordLabel('G'));
    expect(document.activeElement).toBe(linkField());
  });
});

describe('the header and legend', () => {
  it('hints at Peek in the header', async () => {
    await renderPage();
    expect(within(screen.getByRole('banner')).getByText(/anywhere to see your keys/)).toBeDefined();
  });

  it.each([
    ['mac', '⌘V'],
    ['other', 'Ctrl+V'],
  ] as const)('reads the legend with the %s paste key', async (_platform, paste) => {
    expect(pasteLabel(_platform)).toBe(paste);
    await renderPage();
    expect(document.querySelector('[data-slot="legend-hint"]')?.textContent).toBe(
      `Press a key to edit it · ${pasteLabel()} pastes a link onto it · Drag to swap`,
    );
  });
});

describe('autosave', () => {
  it('writes once, about 400 ms after the last keystroke, and then shows Saved', async () => {
    await store('G', { name: 'GitHub' });
    await renderPage('#key=G');
    const set = vi.spyOn(browser.storage.sync, 'set');

    await type(nameField(), 'Git');
    await advance(300);
    await type(nameField(), 'Git Hub');
    await advance(300);
    expect(set).not.toHaveBeenCalled();
    expect(saved()).toBeNull();

    await advance(100);
    expect(set).toHaveBeenCalledTimes(1);
    expect(await readItem('G')).toEqual({
      link: 'https://github.com/',
      name: 'Git Hub',
      openMode: 'smart',
      tabMatch: 'site',
      closeCurrent: false,
    });
    expect(saved()).not.toBeNull();
  });

  it('shows an inline error for an invalid link, writes nothing and hides Saved', async () => {
    await store('G');
    await renderPage('#key=G');
    expect(saved()).not.toBeNull();

    await type(linkField(), 'mailto:me@example.com');
    await advance(1000);

    expect(screen.getByRole('alert').textContent).toBe('Enter a web address, like github.com or https://example.com.');
    expect(linkField().getAttribute('aria-invalid')).toBe('true');
    expect((await readItem('G'))?.link).toBe('https://github.com/');
    expect(saved()).toBeNull();
  });

  it('writes a free key only once its link is valid', async () => {
    await renderPage('#key=K');

    await type(nameField(), 'Docs');
    await advance(1000);
    expect(await readItem('K')).toBeUndefined();
    expect(screen.queryByRole('alert')).toBeNull();

    await type(linkField(), 'docs.example.com');
    await advance(400);
    expect(await readItem('K')).toEqual({
      link: 'https://docs.example.com/',
      name: 'Docs',
      openMode: 'smart',
      tabMatch: 'page',
      closeCurrent: false,
    });
    expect(keyButton('K').getAttribute('aria-label')).toBe(`${T} K: Docs`);
  });

  it('saves a pending valid draft to the old key when switching keys', async () => {
    await store('G');
    await renderPage('#key=G');

    await type(nameField(), 'Code');
    await goToKey('K');
    await advance();

    expect((await readItem('G'))?.name).toBe('Code');
    expect(await readItem('K')).toBeUndefined();
  });

  it('drops an invalid draft when switching keys', async () => {
    await store('G');
    await renderPage('#key=G');
    const set = vi.spyOn(browser.storage.sync, 'set');

    await type(linkField(), 'mailto:x@y.z');
    await goToKey('K');
    await advance(1000);
    await goToKey('G');

    expect(set).not.toHaveBeenCalled();
    expect(linkField().value).toBe('https://github.com/');
  });

  it('Clear key frees the key at once, without waiting for the debounce', async () => {
    await store('G');
    await renderPage('#key=G');

    await type(nameField(), 'Half typed');
    act(() => screen.getByRole('button', { name: 'Clear key' }).click());
    await advance();

    expect(await readItem('G')).toBeUndefined();
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: free`);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Free key');
    expect(screen.queryByRole('alert')).toBeNull();

    await advance(1000);
    expect(await readItem('G')).toBeUndefined();
  });

  it('disables Clear key on a free key', async () => {
    await renderPage('#key=K');
    expect((screen.getByRole('button', { name: 'Clear key' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Couldn’t save when the write fails', async () => {
    await store('G');
    await renderPage('#key=G');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'));

    await type(nameField(), 'Code');
    await advance(400);

    expect(screen.getByText('Couldn’t save')).toBeDefined();
    expect(saved()).toBeNull();
  });
});

describe('live updates', () => {
  it('a change from elsewhere updates a clean inspector', async () => {
    await store('G', { name: 'GitHub' });
    await renderPage('#key=G');

    await act(() => store('G', { name: 'Code' }));
    await advance();

    expect(nameField().value).toBe('Code');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Code');
  });

  it('a change from elsewhere leaves a dirty draft alone', async () => {
    await store('G', { name: 'GitHub' });
    await renderPage('#key=G');

    await type(nameField(), 'Mine');
    await act(() => store('G', { name: 'Theirs', link: 'https://gitlab.com/' }));
    await advance();

    expect(nameField().value).toBe('Mine');
    expect(linkField().value).toBe('https://github.com/');
  });

  it('keeps a dirty draft on a key cleared elsewhere, as a draft on the free key', async () => {
    await store('G', { name: 'GitHub' });
    await renderPage('#key=G');

    await type(nameField(), 'Mine');
    await act(() => browser.storage.sync.remove('key.G'));
    await advance();

    expect(nameField().value).toBe('Mine');
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: free`);
  });

  it('the used count follows the keymap', async () => {
    await store('G');
    await renderPage('#key=G');
    expect(screen.getByText(/1 of 35 keys in use\./)).toBeDefined();

    await act(() => store('Y'));
    await advance();
    expect(screen.getByText(/2 of 35 keys in use\./)).toBeDefined();
  });

  it('shows 0 of 35 on an empty keymap', async () => {
    await renderPage();
    expect(screen.getByText(/0 of 35 keys in use\./)).toBeDefined();
  });

  it('the open-now dots follow the open tabs', async () => {
    await store('G');
    await renderPage('#key=K');
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com`);

    openTabs = [...openTabs, tab(2, { url: 'https://github.com/me' })];
    await act(() => fakeBrowser.tabs.onCreated.trigger(openTabs[1] as Tab));
    await advance(100);
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com, open in a tab`);

    openTabs = openTabs.slice(0, 1);
    await act(() => fakeBrowser.tabs.onRemoved.trigger(2, { windowId: 1, isWindowClosing: false }));
    await advance(100);
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com`);
  });

  it('never lights a dot for an incognito tab', async () => {
    await store('G');
    openTabs = [...openTabs, tab(2, { url: 'https://github.com/', incognito: true })];
    await renderPage('#key=K');
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com`);
  });

  it('says "Open in a tab now" in the status of an open key', async () => {
    await store('G');
    openTabs = [...openTabs, tab(2, { url: 'https://github.com/' })];
    await renderPage('#key=G');
    expect(inEditor().getByText('Open in a tab now')).toBeDefined();
  });
});

describe('Use current tab', () => {
  const currentTabButton = () => screen.getByRole('button', { name: /^Use |^No web page open$/ }) as HTMLButtonElement;

  it('fills in the most recently used web page, never Options or an incognito tab, and its title as the name', async () => {
    openTabs = [
      ...openTabs,
      tab(2, { url: 'https://old.example/', title: 'Old', lastAccessed: 10 }),
      tab(3, { url: 'https://docs.example.com/guide', title: 'Docs', lastAccessed: 50 }),
      tab(4, { url: 'https://secret.example/', title: 'Secret', lastAccessed: 90, incognito: true }),
    ];
    await renderPage('#key=K');

    expect(currentTabButton().getAttribute('aria-label')).toBe('Use Docs');
    act(() => currentTabButton().click());

    expect(linkField().value).toBe('https://docs.example.com/guide');
    expect(nameField().value).toBe('Docs');
  });

  it('keeps a name that is already there', async () => {
    openTabs = [...openTabs, tab(2, { url: 'https://docs.example.com/', title: 'Docs', lastAccessed: 50 })];
    await store('G', { name: 'Mine' });
    await renderPage('#key=G');

    act(() => currentTabButton().click());

    expect(linkField().value).toBe('https://docs.example.com/');
    expect(nameField().value).toBe('Mine');
  });

  it('is disabled with "No web page open" when there is none', async () => {
    await renderPage('#key=K');
    expect(currentTabButton().getAttribute('aria-label')).toBe('No web page open');
    expect(currentTabButton().disabled).toBe(true);
  });
});

describe('Test', () => {
  const tryButton = () => inEditor().getByRole('button', { name: 'Test' }) as HTMLButtonElement;
  let sent: { type: string; data: unknown; stored: unknown }[];

  beforeEach(() => {
    sent = [];
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation((async (message: { type: string; data: unknown }) => {
      sent.push({ ...message, stored: await readItem('G') });
      return { res: { kind: 'opened', tabId: 9, switched: false } };
    }) as never);
  });

  it('is disabled on a free key', async () => {
    await renderPage('#key=K');
    expect(tryButton().disabled).toBe(true);
  });

  it('is disabled while the link is invalid', async () => {
    await store('G');
    await renderPage('#key=G');
    expect(tryButton().disabled).toBe(false);

    await type(linkField(), 'mailto:x@y.z');
    expect(tryButton().disabled).toBe(true);
  });

  it('saves a pending edit first, then sends tryKey', async () => {
    await store('G');
    await renderPage('#key=G');

    await type(nameField(), 'Code');
    await act(async () => tryButton().click());
    await advance();

    expect(sent).toEqual([
      expect.objectContaining({
        type: 'tryKey',
        data: { key: 'G' },
        stored: expect.objectContaining({ name: 'Code' }),
      }),
    ]);
  });

  it('leaves the editor open on its key', async () => {
    await store('G');
    await renderPage('#key=G');
    await act(async () => tryButton().click());
    await advance();
    expect(chip()).toBe(chordLabel('G'));
  });
});

describe('the editor fields', () => {
  it('leaves the link as typed while focused and shows it normalized on blur', async () => {
    await store('G');
    await renderPage('#key=G');

    act(() => linkField().focus());
    await type(linkField(), 'gitlab.com/me');
    expect(linkField().value).toBe('gitlab.com/me');

    act(() => fireEvent.blur(linkField()));
    expect(linkField().value).toBe('https://gitlab.com/me');
  });

  it('shows the tab match and its live hint only for Smart switch', async () => {
    await store('G', { tabMatch: 'page' });
    await renderPage('#key=G');
    act(() => moreOptions().click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Reuses a tab on https://github.com/, ignoring ?query and #anchors.')).toBeDefined();

    act(() => screen.getByRole('radio', { name: 'Any page of the site' }).click());
    expect(screen.getByText('Reuses any tab on github.com — e.g. a video you left open.')).toBeDefined();

    act(() => mode('New tab').click());
    expect(screen.queryByText(/Reuses/)).toBeNull();
  });

  it('disables close current and shows it unchecked for This tab, keeping the stored value', async () => {
    await store('G', { closeCurrent: true });
    await renderPage('#key=G');
    const close = () => screen.getByRole('checkbox', { name: 'Close the tab I’m on afterwards' });
    expect(close().getAttribute('aria-checked')).toBe('true');

    act(() => mode('This tab').click());
    expect(close().getAttribute('aria-checked')).toBe('false');
    expect(close().hasAttribute('disabled')).toBe(true);
    await advance(400);
    expect(await readItem('G')).toMatchObject({ openMode: 'this', closeCurrent: true });

    act(() => mode('Smart switch').click());
    expect(close().getAttribute('aria-checked')).toBe('true');
  });

  it('reads the status from the open mode, with the name or site as the title', async () => {
    await store('G', { openMode: 'bg' });
    await renderPage('#key=G');
    expect(title()).toBe('github.com');
    expect(inEditor().getByText('Background tab')).toBeDefined();
  });

  it('reads "Free key" and "Paste a link to assign it" on a free key', async () => {
    await renderPage('#key=K');
    expect(title()).toBe('Free key');
    expect(inEditor().getByText('Paste a link to assign it')).toBeDefined();
  });
});

describe('/ search', () => {
  const slash = (target: Element, init: KeyboardEventInit = {}) =>
    act(() => fireEvent.keyDown(target, { key: '/', ...init }));

  it('/ from the page focuses the search field and selects its text', async () => {
    await renderPage();
    await type(searchField(), 'git');
    act(() => searchField().blur());

    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(searchField());
    expect(searchField().selectionStart).toBe(0);
    expect(searchField().selectionEnd).toBe(3);
  });

  const dimmed = () =>
    screen
      .getAllByRole('button', { name: new RegExp(`^${T} [A-Z0-9]:`) })
      .filter((button) => button.dataset.dimmed === 'true')
      .map((button) => button.getAttribute('aria-label')?.split(':')[0]?.slice(-1));

  it('dims the keys that do not match in Keyboard view, free keys matched by label included', async () => {
    await store('Y', { link: 'https://youtube.com/', name: 'YouTube' });
    await store('G', { link: 'https://github.com/pulls', name: 'Pull requests' });
    await renderPage();
    expect(dimmed()).toEqual([]);

    await type(searchField(), 'tube');
    expect(dimmed()).toHaveLength(34);
    expect(dimmed()).not.toContain('Y');
    expect(dimmed()).toContain('G');

    await type(searchField(), 'w');
    expect(dimmed()).not.toContain('W');
    expect(dimmed()).toHaveLength(34);
  });

  it('dims every key when nothing matches, and leaves S reserved', async () => {
    await store('G');
    await renderPage();
    await type(searchField(), 'zzz');
    expect(dimmed()).toHaveLength(35);
    const s = keyButton('S');
    expect(s.dataset.dimmed).toBeUndefined();
    expect(s.getAttribute('aria-label')).toBe(`${T} S: reserved for the overlay`);
  });

  it('never changes the selection while typing', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    await type(searchField(), 'youtube');
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
  });

  it('keeps the dialog open on a key the search dims, the key still marked', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    await type(searchField(), 'youtube');
    act(() => keyButton('G').click());
    expect(keyButton('G').dataset.dimmed).toBe('true');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
    expect(chip()).toBe(chordLabel('G'));

    await act(() => store('Y', { link: 'https://example.com/' }));
    await act(() => store('G', { link: 'https://youtube.com/x' }));
    await act(() => store('G', { link: 'https://github.com/' }));
    await advance();
    expect(chip()).toBe(chordLabel('G'));
  });

  it('leaves the used count alone', async () => {
    await store('G');
    await renderPage();
    await type(searchField(), 'zzz');
    expect(screen.getByText(/1 of 35 keys in use\./)).toBeDefined();
  });

  it('updates the dimming when a shortcut changes elsewhere', async () => {
    await store('G');
    await renderPage();
    await type(searchField(), 'docs');
    expect(keyButton('K').dataset.dimmed).toBe('true');

    await act(() => store('K', { link: 'https://docs.example.com/' }));
    await advance();
    expect(keyButton('K').dataset.dimmed).toBeUndefined();
  });

  it('/ with ⌘, Ctrl or ⌥ held is left alone', async () => {
    await renderPage();
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
      slash(document.body, { [modifier]: true });
      expect(document.activeElement).not.toBe(searchField());
    }
  });

  it('/ on a radio still jumps to the search', async () => {
    await renderPage();
    const keyboard = screen.getByRole('radio', { name: 'Keyboard' });
    act(() => keyboard.focus());
    slash(keyboard);
    expect(document.activeElement).toBe(searchField());
  });

  it('/ does nothing while the dialog is open', async () => {
    await renderPage('#key=K');
    act(() => moreOptions().click());
    const close = screen.getByRole('checkbox', { name: 'Close the tab I’m on afterwards' });
    act(() => close.focus());
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    act(() => {
      close.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(close);
    expect(editor()).not.toBeNull();
  });

  it('/ in Link, Name or the search field is not taken over', async () => {
    await renderPage();
    act(() => keyButton('K').click());
    for (const field of [linkField(), nameField()]) {
      act(() => field.focus());
      const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
      act(() => {
        field.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(field);
    }
    act(() => doneButton().click());
    act(() => searchField().focus());
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    act(() => {
      searchField().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('List view', () => {
  const showList = () => act(() => screen.getByRole('radio', { name: 'List' }).click());
  /** Body rows as their cells' text: Key, Name, Link, Opens as. */
  const rows = () =>
    screen
      .getAllByRole('row', { hidden: true })
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent));
  const row = (key: string) => keyButton(key).closest('tr') as HTMLTableRowElement;

  it('lists only assigned keys, in keyboard order, with their name, link and open mode', async () => {
    await store('G', { name: 'GitHub', openMode: 'new' });
    await store('Y', { link: 'https://youtube.com/watch', openMode: 'bg' });
    await store('1', { link: 'http://localhost:3000/', name: 'Dev', openMode: 'this' });
    await renderPage();
    showList();

    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Key',
      'Name',
      'Link',
      'Opens as',
    ]);
    expect(rows()).toEqual([
      ['1', 'Dev', 'http://localhost:3000/', 'This tab'],
      ['Y', 'youtube.com', 'https://youtube.com/watch', 'Background tab'],
      ['G', 'GitHub', 'https://github.com/', 'New tab'],
    ]);
  });

  it('adds "· closes current" when set, never for This tab', async () => {
    await store('G', { closeCurrent: true });
    await store('T', { closeCurrent: true, openMode: 'this' });
    await renderPage();
    showList();
    expect(rows().map((cells) => cells[3])).toEqual(['This tab', 'Smart switch · closes current']);
  });

  it('shows the open-now dot on the key, following the tabs', async () => {
    await store('G');
    await renderPage();
    showList();
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com`);

    openTabs = [...openTabs, tab(2, { url: 'https://github.com/me' })];
    await act(() => fakeBrowser.tabs.onCreated.trigger(openTabs[1] as Tab));
    await advance(100);
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com, open in a tab`);
  });

  it('a click anywhere on a row opens that key’s dialog over the list', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    showList();

    act(() => (row('Y').querySelectorAll('td')[2] as HTMLElement).click());
    await advance();
    expect(screen.getByRole('radio', { name: 'List', hidden: true }).getAttribute('aria-checked')).toBe('true');
    expect(chip()).toBe(chordLabel('Y'));
    expect(title()).toBe('youtube.com');
    expect(row('Y').getAttribute('aria-selected')).toBe('true');
    expect(row('G').getAttribute('aria-selected')).toBe('false');
    expect(window.location.hash).toBe('#key=Y');
    expect(document.activeElement).toBe(editor());
  });

  it('closing returns focus to the row’s key, with the list still shown', async () => {
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    showList();
    act(() => row('Y').click());
    await advance();
    act(() => doneButton().click());
    await advance();
    expect(document.activeElement).toBe(keyButton('Y'));
    expect(screen.getByRole('radio', { name: 'List' }).getAttribute('aria-checked')).toBe('true');
  });

  it('shows edits and Clear key made in the dialog', async () => {
    await store('G', { name: 'GitHub' });
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    showList();

    act(() => row('G').click());
    await type(nameField(), 'Code');
    await advance(400);
    expect(rows()[1]?.[1]).toBe('Code');

    act(() => inEditor().getByRole('button', { name: 'Clear key' }).click());
    await advance();
    expect(title()).toBe('Free key');
    act(() => doneButton().click());
    await advance();
    expect(rows().map((cells) => cells[0])).toEqual(['Y']);
  });

  it('says "No keys yet — pick one in Keyboard view" on an empty keymap, with or without a query', async () => {
    await renderPage();
    showList();
    expect(rows()).toEqual([['No keys yet — pick one in Keyboard view']]);
    await type(searchField(), 'zzz');
    expect(rows()).toEqual([['No keys yet — pick one in Keyboard view']]);
  });

  it('hides the rows that do not match the query', async () => {
    await store('G', { name: 'GitHub' });
    await store('Y', { link: 'https://youtube.com/' });
    await store('M', { link: 'https://mail.google.com/' });
    await renderPage();
    showList();
    await type(searchField(), 'GOOGLE');
    expect(rows().map((cells) => cells[0])).toEqual(['M']);
  });

  it('says "No keys match" for no match, and for a query matching only a free key', async () => {
    await store('G');
    await renderPage();
    showList();
    await type(searchField(), 'zzz');
    expect(rows()).toEqual([['No keys match']]);
    await type(searchField(), 'w');
    expect(rows()).toEqual([['No keys match']]);
  });

  it('keeps the query across a view switch', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    await type(searchField(), 'tube');
    showList();
    expect(rows().map((cells) => cells[0])).toEqual(['Y']);
    act(() => screen.getByRole('radio', { name: 'Keyboard' }).click());
    expect(searchField().value).toBe('tube');
    expect(keyButton('G').dataset.dimmed).toBe('true');
  });

  it('updates the matching rows when a shortcut changes elsewhere', async () => {
    await store('G');
    await renderPage();
    showList();
    await type(searchField(), 'docs');
    expect(rows()).toEqual([['No keys match']]);

    await act(() => store('K', { link: 'https://docs.example.com/' }));
    await advance();
    expect(rows().map((cells) => cells[0])).toEqual(['K']);
  });
});

describe('↵ and Esc in the search field', () => {
  it('↵ selects the key named exactly over an earlier link match, focuses Link and keeps the query', async () => {
    await store('Y', { link: 'https://youtube.com/' });
    await store('M', { link: 'https://mail.google.com/' });
    await renderPage();
    act(() => searchField().focus());
    await type(searchField(), 'm');
    press(searchField(), 'Enter');
    await advance();

    expect(selectedKey()).toMatch(new RegExp(`^${T} M:`));
    expect(window.location.hash).toBe('#key=M');
    expect(document.activeElement).toBe(linkField());
    expect(linkField().value).toBe('https://mail.google.com/');
    expect(searchField().value).toBe('m');
  });

  it('↵ picks the first match in keyboard order, a free key by its label in Keyboard view', async () => {
    await store('G', { link: 'https://github.com/' });
    await store('M', { link: 'https://gmail.com/' });
    await renderPage();
    await type(searchField(), '.com');
    press(searchField(), 'Enter');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
    act(() => doneButton().click());

    await type(searchField(), 'w');
    press(searchField(), 'Enter');
    expect(selectedKey()).toBe(`${T} W: free`);
  });

  it('↵ in List view acts as a row click on the first visible row, over the list, with focus in Link', async () => {
    await store('G', { name: 'Pull requests' });
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    act(() => screen.getByRole('radio', { name: 'List' }).click());
    act(() => searchField().focus());
    await type(searchField(), 'q');
    press(searchField(), 'Enter');
    await advance();

    expect(screen.getByRole('radio', { name: 'List', hidden: true }).getAttribute('aria-checked')).toBe('true');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
    expect(title()).toBe('Pull requests');
    expect(document.activeElement).toBe(linkField());
  });

  it('↵ in List view never picks a free key', async () => {
    await store('G', { name: 'Pull requests' });
    await renderPage();
    act(() => screen.getByRole('radio', { name: 'List' }).click());
    // W is free, so the list shows "No keys match" and ↵ does nothing.
    await type(searchField(), 'w');
    press(searchField(), 'Enter');
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
  });

  it('↵ with no match changes nothing', async () => {
    await store('G');
    await renderPage();
    act(() => searchField().focus());
    await type(searchField(), 'zzz');
    press(searchField(), 'Enter');
    expect(selectedKey()).toBeNull();
    expect(document.activeElement).toBe(searchField());
  });

  it('Esc clears the query and keeps focus; a second Esc leaves the field', async () => {
    await store('G');
    await renderPage();
    act(() => searchField().focus());
    await type(searchField(), 'zzz');

    press(searchField(), 'Escape');
    expect(searchField().value).toBe('');
    expect(document.activeElement).toBe(searchField());
    expect(keyButton('G').dataset.dimmed).toBeUndefined();

    press(searchField(), 'Escape');
    expect(document.activeElement).not.toBe(searchField());
  });

  it('Esc in Link closes the dialog and leaves the query alone', async () => {
    await store('G');
    await renderPage();
    act(() => searchField().focus());
    await type(searchField(), 'git');
    press(searchField(), 'Enter');
    await advance();
    press(linkField(), 'Escape');
    expect(editor()).toBeNull();
    expect(searchField().value).toBe('git');
  });
});

describe('drag-to-swap', () => {
  /** happy-dom has no layout: gives every keycap, and the lifted copy, the box it has on the real page. */
  function layOutKeys() {
    const measure = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // A keycap shows its label in its key-label slot; anything else isn't laid out here.
      const label = (
        this.dataset.slot === 'key-cap' ? this.querySelector('[data-slot="key-label"]')?.textContent : ''
      ) as KeyLabel;
      const row = KEYBOARD_ROWS.findIndex((labels) => labels.includes(label));
      if (row === -1) return measure.call(this);
      const column = KEYBOARD_ROWS[row]?.indexOf(label) ?? 0;
      // 76×64 keys, 8 px apart, each row staggered by its fraction of a key width.
      return new DOMRect((ROW_STAGGER[row] ?? 0) * 76 + column * 84, row * 72, 76, 64);
    });
  }

  const KEY_OF_CODE: Record<string, string> = { Space: ' ', Enter: 'Enter', Escape: 'Escape' };
  /** Presses keys on the focused element, letting the drag and storage settle after each. */
  async function pressKeys(...codes: string[]) {
    for (const code of codes) {
      const init = { code, key: KEY_OF_CODE[code] ?? code };
      fireEvent.keyDown(document.activeElement ?? document.body, init);
      fireEvent.keyUp(document.activeElement ?? document.body, init);
      await advance();
    }
  }
  const pickUp = async (key: string) => {
    act(() => keyButton(key).focus());
    await pressKeys('Space');
  };

  const announced = () => screen.getAllByRole('status').map((status) => status.textContent);
  const chord = (key: Key) => chordLabel(key);

  const youtube = {
    link: 'https://youtube.com/',
    name: 'YouTube',
    openMode: 'new',
    tabMatch: 'page',
    closeCurrent: true,
  };
  const kagi = { link: 'https://kagi.com/', name: 'Kagi', openMode: 'bg', tabMatch: 'exact', closeCurrent: false };

  beforeEach(() => {
    layOutKeys();
  });

  it('swaps two shortcuts with every field intact, and leaves nothing selected', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await store('G');
    await renderPage();

    await pickUp('Y');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight', 'Space');
    await advance();

    expect(await readItem('K')).toEqual(youtube);
    expect(await readItem('Y')).toEqual(kagi);
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('moves onto a free key and frees the old one', async () => {
    await store('Y', youtube);
    await renderPage();

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Space');
    await advance();

    expect(await readItem('T')).toEqual(youtube);
    expect(await readItem('Y')).toBeUndefined();
    expect(keyButton('T').getAttribute('aria-label')).toBe(`${T} T: YouTube`);
    expect(keyButton('Y').getAttribute('aria-label')).toBe(`${T} Y: free`);
  });

  it('the click a Space press leaves behind opens no dialog, at the pick-up or the drop', async () => {
    await store('Y', youtube);
    await renderPage();

    await pickUp('Y');
    // A button clicks on Space's keyup; happy-dom doesn't, so the click stands for it.
    act(() => keyButton('Y').click());
    expect(editor()).toBeNull();
    await pressKeys('ArrowLeft');
    // The drop renders before its key comes up, as a discrete keydown does in the browser.
    act(() => fireEvent.keyDown(document.activeElement as HTMLElement, { code: 'Space', key: ' ' }));
    act(() => {
      const focused = document.activeElement as HTMLElement;
      fireEvent.keyUp(focused, { code: 'Space', key: ' ' });
      focused.click();
    });
    expect(editor()).toBeNull();
    await advance();

    act(() => keyButton('T').click());
    expect(chip()).toBe(chordLabel('T'));
  });

  it('passes over S with the arrows', async () => {
    await store('A');
    await renderPage();

    await pickUp('A');
    await pressKeys('ArrowRight');
    expect(keyButton('S').dataset.state).toBe('reserved');
    expect(keyButton('D').dataset.state).toBe('drop-target');
    await pressKeys('Space');
    await advance();

    expect(await readItem('D')).toBeDefined();
    expect(await readItem('A')).toBeUndefined();
  });

  it('a valid edit made within the debounce is saved first, and moves with the shortcut', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await renderPage('#key=Y');

    await type(nameField(), 'Videos');
    act(() => doneButton().click());
    await pickUp('Y');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight', 'Space');
    await advance(1000);

    expect(await readItem('K')).toEqual({ ...youtube, name: 'Videos' });
    expect(await readItem('Y')).toEqual(kagi);
  });

  it('keeps the swap when the drop target had a pending edit', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await renderPage('#key=K');

    await type(nameField(), 'Search');
    act(() => doneButton().click());
    await pickUp('Y');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight', 'Space');
    await advance(1000);

    expect(await readItem('Y')).toEqual({ ...kagi, name: 'Search' });
    expect(await readItem('K')).toEqual(youtube);
  });

  it('discards an invalid draft and moves the stored shortcut', async () => {
    await store('Y', youtube);
    await renderPage('#key=Y');

    await type(linkField(), 'mailto:me@example.com');
    act(() => doneButton().click());
    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Space');
    await advance(1000);

    expect(await readItem('T')).toEqual(youtube);
    act(() => keyButton('T').click());
    expect(linkField().value).toBe('https://youtube.com/');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Esc cancels without a write, and opens no dialog', async () => {
    await store('Y', youtube);
    await renderPage();
    const set = vi.spyOn(browser.storage.sync, 'set');

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Escape');
    await advance(1000);

    expect(set).not.toHaveBeenCalled();
    expect(announced()).toContain('Cancelled. Nothing changed.');
    expect(keyButton('T').dataset.state).toBe('free');
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
  });

  it('a bare key during a drag opens no dialog and leaves the drag going', async () => {
    await store('Y', youtube);
    await renderPage();

    await pickUp('Y');
    await pressKeys('KeyK', 'ArrowLeft', 'Space');

    expect(editor()).toBeNull();
    expect((await readItem('T'))?.link).toBe('https://youtube.com/');
  });

  it('dropping a key back on itself changes nothing', async () => {
    await store('Y', youtube);
    await renderPage();
    const set = vi.spyOn(browser.storage.sync, 'set');

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'ArrowRight', 'Space');
    await advance(1000);

    expect(set).not.toHaveBeenCalled();
    expect(await readItem('Y')).toEqual(youtube);
    expect(announced()).toContain('Dropped. Nothing changed.');
  });

  it('cannot pick up a free key', async () => {
    await store('Y', youtube);
    await renderPage();
    const set = vi.spyOn(browser.storage.sync, 'set');

    await pickUp('T');
    await pressKeys('ArrowRight', 'Space');
    await advance(1000);

    expect(set).not.toHaveBeenCalled();
    expect(keyButton('Y').dataset.state).not.toBe('drop-target');
  });

  it('a failed write leaves storage and the selection as they were', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await store('G');
    await renderPage();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE'));

    await pickUp('Y');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight', 'Space');
    await advance();

    expect(await readItem('Y')).toEqual(youtube);
    expect(await readItem('K')).toEqual(kagi);
    expect(selectedKey()).toBeNull();
    expect(error).toHaveBeenCalledWith('SpeedLink: could not drop', 'Y', 'K', 'quota-exceeded');
  });

  it('announces each step with the platform trigger', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await renderPage();

    await pickUp('Y');
    expect(announced()).toContain(`Picked up ${chord('Y')}, YouTube.`);
    await pressKeys('ArrowLeft');
    expect(announced()).toContain(`Over ${chord('T')}, free. Drop to move.`);
    await pressKeys('ArrowRight');
    expect(announced()).toContain('Not over another key. Dropping changes nothing.');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight');
    expect(announced()).toContain(`Over ${chord('K')}, Kagi. Drop to swap.`);
    await pressKeys('Space');
    expect(announced()).toContain(`Swapped ${chord('Y')} and ${chord('K')}.`);
    await advance();

    await pickUp('K');
    await pressKeys('ArrowLeft', 'Space');
    expect(announced()).toContain(`Moved to ${chord('J')}.`);
  });

  it('tells each draggable key how to drag it', async () => {
    await store('Y', youtube);
    await renderPage();
    expect(keyButton('Y').getAttribute('aria-describedby')).not.toBeNull();
    const instructions = document.getElementById(keyButton('Y').getAttribute('aria-describedby') ?? '');
    expect(instructions?.textContent).toBe(
      'Press Space to pick up this key, the arrow keys to move it to another key, Space or Enter to drop it there, and Escape to cancel.',
    );
    expect(keyButton('T').getAttribute('aria-describedby')).toBeNull();
  });

  it('a remote change that frees the dragged key cancels the drag', async () => {
    await store('Y', youtube);
    await renderPage();

    await pickUp('Y');
    await pressKeys('ArrowLeft');
    await act(() => browser.storage.sync.remove('key.Y'));
    await advance();
    expect(announced()).toContain('Cancelled. Nothing changed.');
    expect(keyButton('T').dataset.state).toBe('free');

    await pressKeys('Space');
    await advance();
    expect(await readItem('T')).toBeUndefined();
  });

  it('keys dimmed by a search still accept a drop', async () => {
    await store('Y', youtube);
    await renderPage();
    await type(searchField(), 'youtube');
    expect(keyButton('T').dataset.dimmed).toBe('true');

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Space');
    await advance();

    expect(await readItem('T')).toEqual(youtube);
  });
});

describe('loading', () => {
  it('says it is loading until the keymap arrives, with no keyboard yet', async () => {
    vi.spyOn(browser.storage.sync, 'get').mockImplementation(() => new Promise(() => {}));
    window.history.replaceState(null, '', '/options.html');
    render(<OptionsPage />);
    await advance();
    expect(screen.getByRole('status').textContent).toBe('Loading your keys…');
    expect(screen.queryByRole('button', { name: new RegExp(`^${T} K:`) })).toBeNull();
  });
});

describe('the ⌥S hint', () => {
  const hint = () => screen.queryByRole('link', { name: `Set ${chordLabel('S')} for pages where SpeedLink can’t run` });

  it('shows a link to Chrome’s shortcut settings while toggle-overlay has no key', async () => {
    overlayShortcut = '';
    const create = vi.spyOn(browser.tabs, 'create').mockImplementation(async () => tab(9));
    await renderPage();

    act(() => hint()?.click());

    expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
  });

  it.each(['Alt+S', 'Ctrl+Shift+K'])('stays away while toggle-overlay is on %s', async (shortcut) => {
    overlayShortcut = shortcut;
    await renderPage();

    expect(hint()).toBeNull();
  });

  it.each(['visibilitychange', 'focus'] as const)('goes once a key is set and the page gets a %s', async (type) => {
    overlayShortcut = '';
    await renderPage();
    expect(hint()).not.toBeNull();

    overlayShortcut = 'Alt+S';
    act(() => {
      (type === 'focus' ? window : document).dispatchEvent(new Event(type));
    });
    await advance();

    expect(hint()).toBeNull();
  });
});

describe('⌥ + key on Options', () => {
  let sent: { type: string; data: unknown }[];

  beforeEach(() => {
    sent = [];
    // happy-dom reports AltGraph whenever Alt is held; Chrome reports it only for a real AltGr.
    const ownState = KeyboardEvent.prototype.getModifierState;
    vi.spyOn(KeyboardEvent.prototype, 'getModifierState').mockImplementation(function (this: KeyboardEvent, key) {
      return key === 'AltGraph' ? false : ownState.call(this, key);
    });
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation((async (message: { type: string; data: unknown }) => {
      sent.push(message);
      return { res: { kind: 'opened', tabId: 9, switched: false } };
    }) as never);
  });

  const altKey = (code: string, init: KeyboardEventInit = {}, target: Element = document.body) => {
    const event = new KeyboardEvent('keydown', { code, altKey: true, bubbles: true, cancelable: true, ...init });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  it('opens an assigned key as Try does, and swallows the press', async () => {
    await store('G');
    await renderPage('#key=K');

    const event = altKey('KeyG');
    await advance();

    expect(sent).toEqual([expect.objectContaining({ type: 'tryKey', data: { key: 'G', force: false } })]);
    expect(event.defaultPrevented).toBe(true);
    expect(selectedKey()).toBe(`${T} K: free`);
  });

  it('⌥⇧+key forces a new tab', async () => {
    await store('G');
    await renderPage();

    altKey('KeyG', { shiftKey: true });
    await advance();

    expect(sent).toEqual([expect.objectContaining({ type: 'tryKey', data: { key: 'G', force: true } })]);
  });

  it('selects a free key in the editor, ready to be filled', async () => {
    await store('G');
    await renderPage('#key=G');

    altKey('KeyK');
    await advance();

    expect(selectedKey()).toBe(`${T} K: free`);
    expect(window.location.hash).toBe('#key=K');
    expect(chip()).toBe(chordLabel('K'));
    expect(document.activeElement).toBe(linkField());
    expect(sent).toEqual([]);
  });

  it('⌥ + the free key the dialog is already on moves focus to Link', async () => {
    await renderPage('#key=K');
    act(() => doneButton().focus());

    altKey('KeyK');
    await advance();

    expect(document.activeElement).toBe(linkField());
  });

  it('acts on a free reply: the key was freed since the page last saw it', async () => {
    // webext-core sends with a callback, so the reply goes through it.
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(((_message: unknown, callback: (r: unknown) => void) =>
      callback({ res: { kind: 'free' } })) as never);
    await store('G');
    await store('Y');
    await renderPage('#key=G');

    altKey('KeyY');
    await advance();

    expect(selectedKey()).toMatch(new RegExp(`^${T} Y:`));
  });

  it('does not select a free key with ⇧ held', async () => {
    await store('G');
    await renderPage('#key=G');

    altKey('KeyK', { shiftKey: true });
    await advance();

    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
  });

  it('leaves the free keys the browser keeps for itself alone', async () => {
    await store('G');
    await renderPage('#key=G');

    const event = altKey('KeyD');
    await advance();

    expect(event.defaultPrevented).toBe(false);
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
  });

  it('⌥S focuses the search and selects its text', async () => {
    await renderPage();
    await type(searchField(), 'git');
    act(() => searchField().blur());

    const event = altKey('KeyS');

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(searchField());
    expect(searchField().selectionStart).toBe(0);
    expect(searchField().selectionEnd).toBe(3);
  });

  it('⌥S with the dialog open leaves focus in the dialog', async () => {
    await store('G');
    await renderPage('#key=G');
    await advance();

    const event = altKey('KeyS');

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor());
  });

  it('types as usual inside the Link field', async () => {
    await store('G');
    await store('Y');
    await renderPage('#key=G');

    const event = altKey('KeyY', {}, linkField());
    await advance();

    expect(event.defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
  });

  it('sends once for a held key', async () => {
    await store('G');
    await renderPage();

    altKey('KeyG');
    altKey('KeyG', { repeat: true });
    altKey('KeyG', { repeat: true });
    await advance();

    expect(sent).toHaveLength(1);
  });

  it('shows no overlay while ⌥ is held', async () => {
    await store('G');
    await renderPage();

    altKey('AltLeft');
    await advance(600);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('#search', () => {
  const goTo = (hash: string) =>
    act(async () => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

  it('focuses the search without a reload and selects its text', async () => {
    await store('G');
    await renderPage();
    await type(searchField(), 'git');
    act(() => searchField().blur());

    await goTo('#search');

    expect(document.activeElement).toBe(searchField());
    expect(searchField().selectionEnd).toBe(3);
    expect(window.location.hash).toBe('');
  });

  it('with the dialog open, goes back to the selected key and leaves focus in the dialog', async () => {
    await store('G');
    await renderPage('#key=G');
    await advance();

    await goTo('#search');

    expect(window.location.hash).toBe('#key=G');
    expect(chip()).toBe(chordLabel('G'));
    expect(document.activeElement).toBe(editor());
  });

  it('focuses the search when the page opens on it, leaving the hash empty with nothing selected', async () => {
    await store('G');
    await renderPage('#search');

    expect(document.activeElement).toBe(searchField());
    expect(window.location.hash).toBe('');
    expect(editor()).toBeNull();
  });

  it('with nothing selected, takes the hash back to none', async () => {
    await renderPage();
    await goTo('#search');
    expect(document.activeElement).toBe(searchField());
    expect(window.location.hash).toBe('');
  });
});

/** A bare key press on the focused element (or the page), as the keyboard sends it. */
const bareKey = (
  code: string,
  init: KeyboardEventInit = {},
  target: Element = document.activeElement ?? document.body,
) => {
  const event = new KeyboardEvent('keydown', {
    code,
    key: code.slice(-1).toLowerCase(),
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

/** A ⌘V / Ctrl+V on the focused element (or the page): a `paste` event whose clipboard holds `text` as plain text. */
const paste = (text: string, target: Element = document.activeElement ?? document.body, type = 'text/plain') => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (asked: string) => (asked === type ? text : '') },
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe('bare keys on Options', () => {
  it('a letter opens its key’s dialog; a free key gets focus in Link', async () => {
    await renderPage();
    bareKey('KeyK');
    await advance();
    expect(chip()).toBe(chordLabel('K'));
    expect(window.location.hash).toBe('#key=K');
    expect(document.activeElement).toBe(linkField());
  });

  it('a digit opens an assigned key with focus on the dialog', async () => {
    await store('7');
    await renderPage();
    act(() => keyButton('G').focus());
    bareKey('Digit7');
    await advance();
    expect(chip()).toBe(chordLabel('7'));
    expect(document.activeElement).toBe(editor());
  });

  it('switches the open dialog to another key, focus on the dialog for an assigned one', async () => {
    await store('G');
    await renderPage('#key=K');
    act(() => doneButton().focus());
    bareKey('KeyG');
    await advance();
    expect(chip()).toBe(chordLabel('G'));
    expect(document.activeElement).toBe(editor());
  });

  it('switching to a free key puts focus in Link', async () => {
    await store('G');
    await renderPage('#key=G');
    await advance();
    bareKey('KeyK');
    await advance();
    expect(chip()).toBe(chordLabel('K'));
    expect(document.activeElement).toBe(linkField());
  });

  it('works from the Opens as control and the dialog buttons', async () => {
    await store('G');
    await store('Y');
    await renderPage('#key=G');
    act(() => mode('Smart switch').focus());
    bareKey('KeyY');
    await advance();
    expect(chip()).toBe(chordLabel('Y'));
    act(() => closeButton().focus());
    bareKey('KeyG');
    await advance();
    expect(chip()).toBe(chordLabel('G'));
  });

  it('saves a valid draft on the switch and discards an invalid one', async () => {
    await store('G');
    await store('Y');
    await renderPage('#key=G');
    await type(nameField(), 'Code');
    act(() => doneButton().focus());
    bareKey('KeyY');
    await advance();
    expect((await readItem('G'))?.name).toBe('Code');

    await type(linkField(), 'mailto:x@y.z');
    act(() => doneButton().focus());
    bareKey('KeyG');
    await advance(1000);
    expect((await readItem('Y'))?.link).toBe('https://github.com/');
  });

  it('collapses More options on the switch', async () => {
    await store('G', { tabMatch: 'page' });
    await store('Y', { tabMatch: 'page' });
    await renderPage('#key=G');
    act(() => moreOptions().click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('true');
    act(() => moreOptions().focus());
    bareKey('KeyY');
    await advance();
    expect(moreOptions().getAttribute('aria-expanded')).toBe('false');
  });

  it('the key already selected changes nothing', async () => {
    await store('G');
    await renderPage('#key=G');
    await type(nameField(), 'Code');
    act(() => doneButton().focus());
    bareKey('KeyG');
    await advance();
    expect(nameField().value).toBe('Code');
    expect(document.activeElement).toBe(doneButton());
  });

  it('S does nothing, dialog open or closed', async () => {
    await renderPage();
    bareKey('KeyS');
    await advance();
    expect(editor()).toBeNull();

    await goToKey('K');
    act(() => doneButton().focus());
    bareKey('KeyS');
    await advance();
    expect(chip()).toBe(chordLabel('K'));
  });

  it('a letter typed in Link, Name or the search stays there', async () => {
    await store('G');
    await renderPage();
    bareKey('KeyG', {}, searchField());
    await advance();
    expect(editor()).toBeNull();

    await goToKey('K');
    bareKey('KeyG', {}, linkField());
    bareKey('KeyG', {}, nameField());
    await advance();
    expect(chip()).toBe(chordLabel('K'));
  });

  it.each<[string, KeyboardEventInit]>([
    ['⇧', { shiftKey: true }],
    ['⌘', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
  ])('ignores a press with %s held', async (_name, init) => {
    await renderPage();
    const event = bareKey('KeyK', init);
    await advance();
    expect(editor()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it('acts once for a held key', async () => {
    await store('G');
    await renderPage('#key=G');
    act(() => doneButton().focus());
    bareKey('KeyK', { repeat: true });
    await advance();
    expect(chip()).toBe(chordLabel('G'));
  });

  it('⌥ + an assigned key still opens it as Test does with the dialog open', async () => {
    const sent: { type: string }[] = [];
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation((async (message: { type: string }) => {
      sent.push(message);
      return { res: { kind: 'opened', tabId: 9, switched: false } };
    }) as never);
    const ownState = KeyboardEvent.prototype.getModifierState;
    vi.spyOn(KeyboardEvent.prototype, 'getModifierState').mockImplementation(function (this: KeyboardEvent, key) {
      return key === 'AltGraph' ? false : ownState.call(this, key);
    });
    await store('G');
    await renderPage('#key=K');
    act(() => doneButton().focus());
    bareKey('KeyG', { altKey: true });
    await advance();
    expect(sent).toEqual([expect.objectContaining({ type: 'tryKey' })]);
    expect(chip()).toBe(chordLabel('K'));
  });
});

describe('⌘V on Options', () => {
  it('on a focused free key: opens its dialog, assigns the link once valid, focus on the dialog', async () => {
    await renderPage();
    act(() => keyButton('K').focus());
    const event = paste('docs.example.com');
    await advance();
    expect(chip()).toBe(chordLabel('K'));
    expect(linkField().value).toBe('docs.example.com');
    expect(document.activeElement).toBe(editor());
    expect(event.defaultPrevented).toBe(true);

    await advance(400);
    expect(await readItem('K')).toEqual({
      link: 'https://docs.example.com/',
      openMode: 'smart',
      tabMatch: 'page',
      closeCurrent: false,
    });
    expect(saved()).not.toBeNull();
  });

  it('with the dialog open: replaces the key’s link and keeps its name', async () => {
    await store('G', { name: 'Code' });
    await renderPage('#key=G');
    await advance();
    paste('gitlab.com');
    await advance(400);
    expect(await readItem('G')).toMatchObject({ link: 'https://gitlab.com/', name: 'Code' });
    expect(nameField().value).toBe('Code');
  });

  it('trims the pasted text', async () => {
    await renderPage('#key=K');
    act(() => doneButton().focus());
    paste('  https://docs.example.com/a \n');
    await advance(400);
    expect((await readItem('K'))?.link).toBe('https://docs.example.com/a');
  });

  it('an invalid paste shows the inline error and writes nothing', async () => {
    await store('G');
    await renderPage('#key=G');
    await advance();
    paste('mailto:me@example.com');
    await advance(1000);
    expect(linkField().value).toBe('mailto:me@example.com');
    expect(screen.getByRole('alert').textContent).toBe('Enter a web address, like github.com or https://example.com.');
    expect((await readItem('G'))?.link).toBe('https://github.com/');
    expect(editor()).not.toBeNull();
  });

  it('on a focused List row: works as on its key', async () => {
    await store('G', { name: 'Code' });
    await renderPage();
    act(() => screen.getByRole('radio', { name: 'List' }).click());
    act(() => keyButton('G').focus());
    paste('gitlab.com');
    await advance(400);
    expect(chip()).toBe(chordLabel('G'));
    expect(await readItem('G')).toMatchObject({ link: 'https://gitlab.com/', name: 'Code' });
  });

  it('with no key focused, or on the search, does nothing', async () => {
    await renderPage();
    const set = vi.spyOn(browser.storage.sync, 'set');
    paste('docs.example.com', document.body);
    act(() => searchField().focus());
    const inSearch = paste('docs.example.com');
    await advance(1000);
    expect(editor()).toBeNull();
    expect(set).not.toHaveBeenCalled();
    expect(inSearch.defaultPrevented).toBe(false);
  });

  it('inside Link or Name pastes as usual', async () => {
    await store('G');
    await renderPage('#key=G');
    const inName = paste('gitlab.com', nameField());
    const inLink = paste('gitlab.com', linkField());
    await advance(1000);
    expect(inName.defaultPrevented).toBe(false);
    expect(inLink.defaultPrevented).toBe(false);
    expect(linkField().value).toBe('https://github.com/');
  });

  it('ignores a paste with no text (an image)', async () => {
    await renderPage();
    act(() => keyButton('K').focus());
    paste('data', document.activeElement ?? document.body, 'image/png');
    await advance();
    expect(editor()).toBeNull();
  });

  it('never targets S', async () => {
    await renderPage();
    paste('docs.example.com', screen.getByText('S', { selector: '[data-slot="key-label"]' }));
    await advance();
    expect(editor()).toBeNull();
  });
});

describe('Name from an open tab’s title', () => {
  beforeEach(() => {
    openTabs = [
      ...openTabs,
      tab(2, { url: 'https://docs.example.com/guide?utm=x', title: 'Docs guide (old)', lastAccessed: 5 }),
      tab(3, { url: 'https://docs.example.com/guide/', title: 'Docs guide', lastAccessed: 9 }),
      tab(4, { url: 'https://docs.example.com/guide', title: 'Secret', lastAccessed: 50, incognito: true }),
    ];
  });

  it('fills Name for a pasted link from the most recently used matching tab, never incognito', async () => {
    await renderPage();
    act(() => keyButton('K').focus());
    paste('docs.example.com/guide');
    await advance(400);
    expect(await readItem('K')).toMatchObject({ link: 'https://docs.example.com/guide', name: 'Docs guide' });
    await advance();
    expect(nameField().value).toBe('Docs guide');
  });

  it('fills Name for a typed link, once at the settle', async () => {
    await renderPage('#key=K');
    await type(linkField(), 'https://docs.example.com');
    await advance(100);
    await type(linkField(), 'https://docs.example.com/guide');
    expect(nameField().value).toBe('');
    await advance(400);
    expect((await readItem('K'))?.name).toBe('Docs guide');
    expect(nameField().value).toBe('Docs guide');
  });

  it('leaves Name empty when no tab matches', async () => {
    await renderPage('#key=K');
    await type(linkField(), 'https://docs.example.com/other');
    await advance(1000);
    expect((await readItem('K'))?.name).toBeUndefined();
    expect(nameField().value).toBe('');
  });

  it('never overwrites a Name that is there', async () => {
    await store('G', { name: 'Code' });
    await renderPage('#key=G');
    await type(linkField(), 'https://docs.example.com/guide');
    await advance(1000);
    expect((await readItem('G'))?.name).toBe('Code');
  });

  it('leaves an unnamed key unnamed when only its open mode changes', async () => {
    await store('G', { link: 'https://docs.example.com/guide' });
    await renderPage('#key=G');
    act(() => mode('New tab').click());
    await advance(1000);
    expect(await readItem('G')).toMatchObject({ openMode: 'new' });
    expect((await readItem('G'))?.name).toBeUndefined();
  });

  it('keeps a Name cleared in this dialog session empty', async () => {
    await store('G', { name: 'Code' });
    await renderPage('#key=G');
    await type(nameField(), '');
    await type(linkField(), 'https://docs.example.com/guide');
    await advance(1000);
    expect((await readItem('G'))?.name).toBeUndefined();
    expect(nameField().value).toBe('');
  });

  it('takes a title that changed after Options opened', async () => {
    openTabs = [...openTabs.slice(0, 1), tab(5, { url: 'https://late.example.com/', title: 'Loading…' })];
    await renderPage('#key=K');
    openTabs = [...openTabs.slice(0, 1), tab(5, { url: 'https://late.example.com/', title: 'Late page' })];
    await act(() => fakeBrowser.tabs.onUpdated.trigger(5, { title: 'Late page' }, openTabs[1] as Tab));
    await advance(100);
    await type(linkField(), 'late.example.com');
    await advance(400);
    expect((await readItem('K'))?.name).toBe('Late page');
  });
});
