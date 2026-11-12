// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ROW_STAGGER } from '@/domain/key-grid';
import { KEYBOARD_ROWS, type Key, type KeyLabel } from '@/domain/keys';
import { chordLabel, triggerWord } from '@/platform/platform-labels';
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
const selectedKey = () => screen.getByRole('button', { pressed: true }).getAttribute('aria-label');

const readItem = async (key: string): Promise<{ link?: string; name?: string } | undefined> =>
  (await browser.storage.sync.get(`key.${key}`))[`key.${key}`] as never;

const linkField = () => screen.getByLabelText('Link') as HTMLInputElement;
const nameField = () => screen.getByLabelText('Name — shown in the overlay') as HTMLInputElement;
const type = (field: HTMLInputElement, value: string) => act(() => fireEvent.change(field, { target: { value } }));
const saved = () => screen.queryByText('Saved');

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
});

afterEach(() => {
  vi.useRealTimers();
});

describe('selection', () => {
  it('selects the key in #key=K', async () => {
    await store('G');
    await store('Y');
    await renderPage('#key=Y');
    expect(selectedKey()).toMatch(new RegExp(`^${T} Y:`));
  });

  it('selects the first assigned key in keyboard order without a hash', async () => {
    await store('G');
    await store('W');
    await renderPage();
    expect(selectedKey()).toMatch(new RegExp(`^${T} W:`));
  });

  it('selects 1 on an empty keymap', async () => {
    await renderPage();
    expect(selectedKey()).toBe(`${T} 1: free`);
  });

  it('ignores #key=S and selects as without a hash', async () => {
    await store('G');
    await renderPage('#key=S');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));
  });

  it('never selects S by a click', async () => {
    await renderPage();
    expect((keyButton('S') as HTMLButtonElement).disabled).toBe(true);
  });

  it('selects a clicked key and mirrors it to the hash', async () => {
    await renderPage();
    act(() => keyButton('K').click());
    expect(selectedKey()).toBe(`${T} K: free`);
    expect(window.location.hash).toBe('#key=K');
  });

  it('mirrors the initial selection to the hash', async () => {
    await store('G');
    await renderPage();
    expect(window.location.hash).toBe('#key=G');
  });

  it('switches on hashchange', async () => {
    await renderPage();
    await act(async () => {
      window.location.hash = '#key=J';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(selectedKey()).toBe(`${T} J: free`);
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
      tabMatch: 'site',
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

  it('says "open in a tab now" in the status line of an open key', async () => {
    await store('G');
    openTabs = [...openTabs, tab(2, { url: 'https://github.com/' })];
    await renderPage('#key=G');
    expect(screen.getByText(/· open in a tab now$/)).toBeDefined();
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

describe('Try', () => {
  const tryButton = () => screen.getByRole('button', { name: /^Try / }) as HTMLButtonElement;
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

  it('is labelled with the platform chord', async () => {
    await store('G');
    await renderPage('#key=G');
    expect(tryButton().textContent).toMatch(/^Try (⌥G|Alt\+G)$/);
  });
});

describe('the inspector fields', () => {
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
    expect(screen.getByText('Reuses a tab on https://github.com/, ignoring ?query and #anchors.')).toBeDefined();

    act(() => screen.getByRole('radio', { name: 'Any page of the site' }).click());
    expect(screen.getByText('Reuses any tab on github.com — e.g. a video you left open.')).toBeDefined();

    act(() => screen.getByRole('radio', { name: /^New tab/ }).click());
    expect(screen.queryByText(/Reuses/)).toBeNull();
  });

  it('disables close current and shows it unchecked for This tab, keeping the stored value', async () => {
    await store('G', { closeCurrent: true });
    await renderPage('#key=G');
    const close = () => screen.getByRole('checkbox', { name: 'Close the tab I’m on afterwards' });
    expect(close().getAttribute('aria-checked')).toBe('true');

    act(() => screen.getByRole('radio', { name: /^This tab/ }).click());
    expect(close().getAttribute('aria-checked')).toBe('false');
    expect(close().hasAttribute('disabled')).toBe(true);
    await advance(400);
    expect(await readItem('G')).toMatchObject({ openMode: 'this', closeCurrent: true });

    act(() => screen.getByRole('radio', { name: /^Smart switch/ }).click());
    expect(close().getAttribute('aria-checked')).toBe('true');
  });

  it('reads the status line from the open mode', async () => {
    await store('G', { openMode: 'bg' });
    await renderPage('#key=G');
    expect(screen.getByText(/ \+ G · Background tab$/)).toBeDefined();
  });

  it('reads "Free key" and "paste a link to assign" on a free key', async () => {
    await renderPage('#key=K');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Free key');
    expect(screen.getByText(/ \+ K · paste a link to assign$/)).toBeDefined();
  });
});

const searchField = () => screen.getByRole('searchbox', { name: 'Find a link, site or key' }) as HTMLInputElement;
const press = (target: Element, key: string) => act(() => fireEvent.keyDown(target, { key }));

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

  it('selects a key by a click anywhere on its row, marks the row selected and mirrors the hash', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');
    showList();
    expect(row('G').getAttribute('aria-selected')).toBe('true');
    expect(row('Y').getAttribute('aria-selected')).toBe('false');

    act(() => (row('Y').querySelectorAll('td')[2] as HTMLElement).click());
    expect(row('Y').getAttribute('aria-selected')).toBe('true');
    expect(row('G').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('youtube.com');
    expect(window.location.hash).toBe('#key=Y');
  });

  it('keeps the selection when switching views', async () => {
    await store('G');
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');
    showList();
    act(() => keyButton('Y').click());
    act(() => screen.getByRole('radio', { name: 'Keyboard' }).click());
    expect(selectedKey()).toMatch(new RegExp(`^${T} Y:`));
  });

  it('shows edits and Clear key live', async () => {
    await store('G', { name: 'GitHub' });
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=G');
    showList();

    await type(nameField(), 'Code');
    await advance(400);
    expect(rows()[1]?.[1]).toBe('Code');

    act(() => screen.getByRole('button', { name: 'Clear key' }).click());
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

  it('↵ in List view picks the first visible row, never a free key', async () => {
    await store('G', { name: 'Pull requests' });
    await store('Y', { link: 'https://youtube.com/' });
    await renderPage('#key=Y');
    act(() => screen.getByRole('radio', { name: 'List' }).click());
    await type(searchField(), 'q');
    press(searchField(), 'Enter');
    expect(selectedKey()).toMatch(new RegExp(`^${T} G:`));

    // W is free, so the list shows "No keys match" and ↵ keeps G, which the list now hides.
    await type(searchField(), 'w');
    press(searchField(), 'Enter');
    expect(window.location.hash).toBe('#key=G');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Pull requests');
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
      // A keycap shows its label as its first span; anything else isn't laid out here.
      const label = (this.dataset.slot === 'key-cap' ? this.querySelector('span')?.textContent : '') as KeyLabel;
      const row = KEYBOARD_ROWS.findIndex((labels) => labels.includes(label));
      if (row === -1) return measure.call(this);
      const column = KEYBOARD_ROWS[row]?.indexOf(label) ?? 0;
      return new DOMRect(((ROW_STAGGER[row] ?? 0) + column) * 64, row * 64, 56, 56);
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
