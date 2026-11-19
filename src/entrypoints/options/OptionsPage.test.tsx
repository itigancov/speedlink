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

const keyButton = (key: string) => screen.getByRole('button', { name: new RegExp(`^${T} ${key}:`) });
const selectedKey = () => screen.queryByRole('button', { pressed: true })?.getAttribute('aria-label') ?? null;

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
const searchField = () => screen.getByRole('searchbox', { name: 'Find a link, site or key' }) as HTMLInputElement;
const press = (target: Element, key: string) => act(() => fireEvent.keyDown(target, { key, code: key }));

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
  it('selects nothing and shows no editor without a hash', async () => {
    await store('G');
    await renderPage();
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('opens the editor on the key in #key=K', async () => {
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

  it('opens the editor on a clicked key and mirrors it to the hash', async () => {
    await renderPage();
    act(() => keyButton('K').click());
    expect(selectedKey()).toBe(`${T} K: free`);
    expect(chip()).toBe(chordLabel('K'));
    expect(window.location.hash).toBe('#key=K');
  });

  it('a click on another key moves the editor there', async () => {
    await store('G', { name: 'GitHub' });
    await renderPage('#key=K');
    act(() => keyButton('G').click());
    expect(chip()).toBe(chordLabel('G'));
    expect(title()).toBe('GitHub');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
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
});

describe('closing the editor', () => {
  it('× closes it', async () => {
    await renderPage('#key=K');
    act(() => screen.getByRole('button', { name: 'Close editor' }).click());
    expect(editor()).toBeNull();
  });

  it('Done closes it', async () => {
    await renderPage('#key=K');
    act(() => doneButton().click());
    expect(editor()).toBeNull();
  });

  it('a second click on the selected key closes it', async () => {
    await renderPage('#key=K');
    act(() => keyButton('K').click());
    expect(editor()).toBeNull();
    expect(selectedKey()).toBeNull();
  });

  it('↵ on the selected key closes it, as a second click does', async () => {
    await renderPage();
    act(() => keyButton('K').focus());
    act(() => keyButton('K').click());
    // A button turns ↵ into a click; happy-dom doesn't, so the click stands for it.
    fireEvent.keyDown(keyButton('K'), { key: 'Enter', code: 'Enter' });
    act(() => keyButton('K').click());
    expect(editor()).toBeNull();
  });

  it('Esc outside a field closes it', async () => {
    await renderPage('#key=K');
    press(document.body, 'Escape');
    expect(editor()).toBeNull();
  });

  it('Esc on the selected key closes it', async () => {
    await renderPage('#key=K');
    act(() => keyButton('K').focus());
    press(keyButton('K'), 'Escape');
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

  it('Esc in the search keeps its own meaning', async () => {
    await renderPage('#key=K');
    act(() => searchField().focus());
    press(searchField(), 'Escape');
    expect(editor()).not.toBeNull();
  });

  it('a click on the header, the background or the card leaves it open', async () => {
    await renderPage('#key=K');
    act(() => screen.getByRole('banner').click());
    act(() => screen.getByRole('heading', { level: 1 }).click());
    act(() => document.body.click());
    expect(editor()).not.toBeNull();
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
  it('a click keeps focus on the key', async () => {
    await renderPage();
    act(() => keyButton('K').focus());
    act(() => keyButton('K').click());
    expect(document.activeElement).toBe(keyButton('K'));
  });

  it('closing returns focus to the key', async () => {
    await renderPage('#key=K');
    act(() => doneButton().focus());
    act(() => doneButton().click());
    await advance();
    expect(document.activeElement).toBe(keyButton('K'));
  });

  it('Tab from the selected key reaches the editor: it is the only key in the tab order, right before it', async () => {
    await renderPage('#key=K');
    const tabbable = Array.from(document.querySelectorAll<HTMLElement>('button, input, a, [tabindex]')).filter(
      (element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled,
    );
    const at = tabbable.indexOf(keyButton('K'));
    expect(tabbable.filter((element) => element.dataset.slot === 'key-cap')).toEqual([keyButton('K')]);
    expect(tabbable[at + 1]).toBe(screen.getByRole('button', { name: 'Close editor' }));
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
    act(() => keyButton('Y').click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('true');
    act(() => keyButton('K').click());
    expect(moreOptions().getAttribute('aria-expanded')).toBe('false');
  });

  it('collapses again on a key switch', async () => {
    await store('G', { tabMatch: 'page' });
    await renderPage('#key=G');
    act(() => moreOptions().click());
    act(() => keyButton('K').click());
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
      `Press a key to select it · ${pasteLabel()} pastes a link onto it · Drag to swap`,
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
    act(() => keyButton('K').click());
    await advance();

    expect((await readItem('G'))?.name).toBe('Code');
    expect(await readItem('K')).toBeUndefined();
  });

  it('drops an invalid draft when switching keys', async () => {
    await store('G');
    await renderPage('#key=G');
    const set = vi.spyOn(browser.storage.sync, 'set');

    await type(linkField(), 'mailto:x@y.z');
    act(() => keyButton('K').click());
    await advance(1000);
    act(() => keyButton('G').click());

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
    await renderPage('#key=G');
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
    await renderPage('#key=G');
    await type(searchField(), 'zzz');
    expect(dimmed()).toHaveLength(35);
    const s = keyButton('S');
    expect(s.dataset.dimmed).toBeUndefined();
    expect(s.getAttribute('aria-label')).toBe(`${T} S: reserved for the overlay`);
  });

  it('never changes the selection while typing; the selected key stays marked though dimmed', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');
    await type(searchField(), 'youtube');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
    expect(keyButton('G').dataset.dimmed).toBe('true');
    expect(chip()).toBe(chordLabel('G'));
    expect(window.location.hash).toBe('#key=G');
  });

  it('leaves the used count alone', async () => {
    await store('G');
    await renderPage('#key=G');
    await type(searchField(), 'zzz');
    expect(screen.getByText(/1 of 35 keys in use\./)).toBeDefined();
  });

  it('updates the dimming when a shortcut changes elsewhere', async () => {
    await store('G');
    await renderPage('#key=G');
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

  it('/ on a checkbox or radio still jumps to the search', async () => {
    await renderPage('#key=K');
    act(() => moreOptions().click());
    const close = screen.getByRole('checkbox', { name: 'Close the tab I’m on afterwards' });
    act(() => close.focus());
    slash(close);
    expect(document.activeElement).toBe(searchField());
  });

  it('/ in Link, Name or the search field is not taken over', async () => {
    await renderPage('#key=K');
    for (const field of [linkField(), nameField(), searchField()]) {
      act(() => field.focus());
      const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
      act(() => {
        field.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(field);
    }
  });
});

describe('List view', () => {
  const showList = () => act(() => screen.getByRole('radio', { name: 'List' }).click());
  /** Body rows as their cells' text: Key, Name, Link, Opens as. */
  const rows = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent));
  const row = (key: string) => keyButton(key).closest('tr') as HTMLTableRowElement;

  it('lists only assigned keys, in keyboard order, with their name, link and open mode', async () => {
    await store('G', { name: 'GitHub', openMode: 'new' });
    await store('Y', { link: 'https://youtube.com/watch', openMode: 'bg' });
    await store('1', { link: 'http://localhost:3000/', name: 'Dev', openMode: 'this' });
    await renderPage('#key=G');
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
    await renderPage('#key=G');
    showList();
    expect(rows().map((cells) => cells[3])).toEqual(['This tab', 'Smart switch · closes current']);
  });

  it('shows the open-now dot on the key, following the tabs', async () => {
    await store('G');
    await renderPage('#key=G');
    showList();
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com`);

    openTabs = [...openTabs, tab(2, { url: 'https://github.com/me' })];
    await act(() => fakeBrowser.tabs.onCreated.trigger(openTabs[1] as Tab));
    await advance(100);
    expect(keyButton('G').getAttribute('aria-label')).toBe(`${T} G: github.com, open in a tab`);
  });

  it('a click anywhere on a row switches to the Keyboard view with that key’s editor open', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    showList();

    act(() => (row('Y').querySelectorAll('td')[2] as HTMLElement).click());
    await advance();
    expect(screen.getByRole('radio', { name: 'Keyboard' }).getAttribute('aria-checked')).toBe('true');
    expect(chip()).toBe(chordLabel('Y'));
    expect(title()).toBe('youtube.com');
    expect(selectedKey()).toMatch(new RegExp(`^${T} Y:`));
    expect(window.location.hash).toBe('#key=Y');
    expect(document.activeElement).toBe(keyButton('Y'));
  });

  it('keeps the selection when switching views: the row is marked, no editor, and back reopens it', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');
    showList();
    expect(editor()).toBeNull();
    expect(row('G').getAttribute('aria-selected')).toBe('true');
    expect(row('Y').getAttribute('aria-selected')).toBe('false');
    expect(window.location.hash).toBe('#key=G');

    act(() => screen.getByRole('radio', { name: 'Keyboard' }).click());
    expect(chip()).toBe(chordLabel('G'));
  });

  it('shows edits and Clear key made in the editor', async () => {
    await store('G', { name: 'GitHub' });
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');

    await type(nameField(), 'Code');
    await advance(400);
    showList();
    expect(rows()[1]?.[1]).toBe('Code');

    act(() => screen.getByRole('radio', { name: 'Keyboard' }).click());
    act(() => inEditor().getByRole('button', { name: 'Clear key' }).click());
    await advance();
    showList();
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
    await renderPage('#key=G');
    showList();
    await type(searchField(), 'GOOGLE');
    expect(rows().map((cells) => cells[0])).toEqual(['M']);
  });

  it('says "No keys match" for no match, and for a query matching only a free key', async () => {
    await store('G');
    await renderPage('#key=G');
    showList();
    await type(searchField(), 'zzz');
    expect(rows()).toEqual([['No keys match']]);
    await type(searchField(), 'w');
    expect(rows()).toEqual([['No keys match']]);
  });

  it('keeps the query across a view switch', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');
    await type(searchField(), 'tube');
    showList();
    expect(rows().map((cells) => cells[0])).toEqual(['Y']);
    act(() => screen.getByRole('radio', { name: 'Keyboard' }).click());
    expect(searchField().value).toBe('tube');
    expect(keyButton('G').dataset.dimmed).toBe('true');
  });

  it('updates the matching rows when a shortcut changes elsewhere', async () => {
    await store('G');
    await renderPage('#key=G');
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
    await renderPage('#key=Y');
    act(() => searchField().focus());
    await type(searchField(), 'm');
    press(searchField(), 'Enter');

    expect(selectedKey()).toMatch(new RegExp(`^${T} M:`));
    expect(window.location.hash).toBe('#key=M');
    expect(document.activeElement).toBe(linkField());
    expect(linkField().value).toBe('https://mail.google.com/');
    expect(searchField().value).toBe('m');
  });

  it('↵ picks the first match in keyboard order, a free key by its label in Keyboard view', async () => {
    await store('G', { link: 'https://github.com/' });
    await store('M', { link: 'https://gmail.com/' });
    await renderPage('#key=M');
    await type(searchField(), '.com');
    press(searchField(), 'Enter');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));

    await type(searchField(), 'w');
    press(searchField(), 'Enter');
    expect(selectedKey()).toBe(`${T} W: free`);
  });

  it('↵ in List view acts as a click on the first visible row: Keyboard view, editor open, focus in Link', async () => {
    await store('G', { name: 'Pull requests' });
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage();
    act(() => screen.getByRole('radio', { name: 'List' }).click());
    act(() => searchField().focus());
    await type(searchField(), 'q');
    press(searchField(), 'Enter');
    await advance();

    expect(screen.getByRole('radio', { name: 'Keyboard' }).getAttribute('aria-checked')).toBe('true');
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
    expect(screen.getByRole('radio', { name: 'List' }).getAttribute('aria-checked')).toBe('true');
  });

  it('↵ with no match changes nothing', async () => {
    await store('G');
    await renderPage('#key=G');
    act(() => searchField().focus());
    await type(searchField(), 'zzz');
    press(searchField(), 'Enter');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
    expect(document.activeElement).toBe(searchField());
  });

  it('↵ saves a pending valid draft to the old key, as a click does', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');
    await type(nameField(), 'Code');
    await type(searchField(), 'y');
    press(searchField(), 'Enter');
    await advance();
    expect((await readItem('G'))?.name).toBe('Code');
  });

  it('Esc clears the query and keeps focus; a second Esc leaves the field', async () => {
    await store('G');
    await renderPage('#key=G');
    act(() => searchField().focus());
    await type(searchField(), 'zzz');

    press(searchField(), 'Escape');
    expect(searchField().value).toBe('');
    expect(document.activeElement).toBe(searchField());
    expect(keyButton('G').dataset.dimmed).toBeUndefined();

    press(searchField(), 'Escape');
    expect(document.activeElement).not.toBe(searchField());
  });

  it('Esc in Link leaves the query alone', async () => {
    await store('G');
    await renderPage('#key=G');
    await type(searchField(), 'git');
    act(() => linkField().focus());
    press(linkField(), 'Escape');
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
      fireEvent.keyDown(document.activeElement ?? document.body, { code, key: KEY_OF_CODE[code] ?? code });
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

  it('swaps two shortcuts with every field intact; the selection and hash follow the dragged key', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await store('G');
    await renderPage('#key=G');

    await pickUp('Y');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight', 'Space');
    await advance();

    expect(await readItem('K')).toEqual(youtube);
    expect(await readItem('Y')).toEqual(kagi);
    expect(selectedKey()).toBe(`${T} K: YouTube`);
    expect(window.location.hash).toBe('#key=K');
    expect(saved()).not.toBeNull();
  });

  it('moves onto a free key and frees the old one', async () => {
    await store('Y', youtube);
    await renderPage('#key=Y');

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Space');
    await advance();

    expect(await readItem('T')).toEqual(youtube);
    expect(await readItem('Y')).toBeUndefined();
    expect(selectedKey()).toBe(`${T} T: YouTube`);
    expect(window.location.hash).toBe('#key=T');
    expect(keyButton('Y').getAttribute('aria-label')).toBe(`${T} Y: free`);
  });

  it('passes over S with the arrows', async () => {
    await store('A');
    await renderPage('#key=A');

    await pickUp('A');
    await pressKeys('ArrowRight');
    expect(keyButton('S').dataset.state).toBe('reserved');
    expect(keyButton('D').dataset.state).toBe('drop-target');
    await pressKeys('Space');
    await advance();

    expect(await readItem('D')).toBeDefined();
    expect(await readItem('A')).toBeUndefined();
  });

  it('saves a valid edit made within the debounce first, and moves it with the shortcut', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await renderPage('#key=Y');

    await type(nameField(), 'Videos');
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
    await pickUp('Y');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight', 'Space');
    await advance(1000);

    expect(await readItem('Y')).toEqual({ ...kagi, name: 'Search' });
    expect(await readItem('K')).toEqual(youtube);
    expect(nameField().value).toBe('YouTube');
  });

  it('discards an invalid draft and moves the stored shortcut', async () => {
    await store('Y', youtube);
    await renderPage('#key=Y');

    await type(linkField(), 'mailto:me@example.com');
    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Space');
    await advance(1000);

    expect(await readItem('T')).toEqual(youtube);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => keyButton('Y').click());
    expect(linkField().value).toBe('');
  });

  it('Esc cancels without a write', async () => {
    await store('Y', youtube);
    await renderPage('#key=Y');
    const set = vi.spyOn(browser.storage.sync, 'set');

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Escape');
    await advance(1000);

    expect(set).not.toHaveBeenCalled();
    expect(announced()).toContain('Cancelled. Nothing changed.');
    expect(keyButton('T').dataset.state).toBe('free');
    expect(selectedKey()).toBe(`${T} Y: YouTube`);
    expect(chip()).toBe(chordLabel('Y'));
  });

  it('with the editor closed, a drop leaves nothing selected', async () => {
    await store('Y', youtube);
    await renderPage();

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Space');
    await advance();

    expect(await readItem('T')).toEqual(youtube);
    expect(selectedKey()).toBeNull();
    expect(editor()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('with the editor open on another key, it reopens on the key the dragged shortcut moved to', async () => {
    await store('Y', youtube);
    await store('G');
    await renderPage('#key=G');

    await pickUp('Y');
    await pressKeys('ArrowLeft', 'Space');
    await advance();

    expect(chip()).toBe(chordLabel('T'));
    expect(title()).toBe('YouTube');
    expect(window.location.hash).toBe('#key=T');
  });

  it('dropping a key back on itself changes nothing', async () => {
    await store('Y', youtube);
    await renderPage('#key=Y');
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
    await renderPage('#key=Y');
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
    await renderPage('#key=G');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.storage.sync, 'set').mockRejectedValue(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE'));

    await pickUp('Y');
    await pressKeys('ArrowDown', 'ArrowRight', 'ArrowRight', 'Space');
    await advance();

    expect(await readItem('Y')).toEqual(youtube);
    expect(await readItem('K')).toEqual(kagi);
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
    expect(error).toHaveBeenCalledWith('SpeedLink: could not drop', 'Y', 'K', 'quota-exceeded');
  });

  it('announces each step with the platform trigger', async () => {
    await store('Y', youtube);
    await store('K', kagi);
    await renderPage('#key=Y');

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
    await renderPage('#key=Y');
    expect(keyButton('Y').getAttribute('aria-describedby')).not.toBeNull();
    const instructions = document.getElementById(keyButton('Y').getAttribute('aria-describedby') ?? '');
    expect(instructions?.textContent).toBe(
      'Press Space to pick up this key, the arrow keys to move it to another key, Space or Enter to drop it there, and Escape to cancel.',
    );
    expect(keyButton('T').getAttribute('aria-describedby')).toBeNull();
  });

  it('a remote change that frees the dragged key cancels the drag', async () => {
    await store('Y', youtube);
    await renderPage('#key=Y');

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
    await renderPage('#key=Y');
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

  it('focuses the search without a reload, and goes back to the selected key', async () => {
    await store('G');
    await renderPage('#key=G');
    await type(searchField(), 'git');
    act(() => searchField().blur());

    await goTo('#search');

    expect(document.activeElement).toBe(searchField());
    expect(searchField().selectionEnd).toBe(3);
    expect(window.location.hash).toBe('#key=G');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
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
