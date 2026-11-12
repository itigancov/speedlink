// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { triggerWord } from '@/platform/platform-labels';
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
