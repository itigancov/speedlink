// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, type MockInstance, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { KEYBOARD_ORDER, type Key } from '@/domain/keys';
import type { AssignPageReply } from '@/platform/messaging';
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
  render(<PopupPage actions={{ assignPage, openOptions, close }} platform={platform} tabId={tabId} />);
  await settle();
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name });
const isDisabled = (element: HTMLElement) => (element as HTMLButtonElement).disabled;
/** The key on the drop zone's big keycap, or null with none picked. */
const pickedKey = () => screen.getByTestId('picked-key').querySelector('[data-slot=key-cap]')?.textContent ?? null;
const chips = () =>
  within(screen.getByRole('group', { name: 'Free & fitting:' }))
    .queryAllByRole('button')
    .map((chip) => chip.textContent);
const miniKey = (key: string) => button(new RegExp(`^Option ${key}:`));
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

  it('shows the favicon once it loads', async () => {
    vi.stubGlobal(
      'Image',
      class extends EventTarget {
        complete = true;
        naturalWidth = 16;
        src = '';
        crossOrigin: string | null = null;
      },
    );
    tabs = [activeTab({ favIconUrl: 'https://github.com/favicon.ico' })];
    const { container } = render(<PopupPage actions={{ assignPage, openOptions, close }} platform="mac" />);
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe('https://github.com/favicon.ico'),
    );
  });

  it('shows the monogram without a favicon', async () => {
    await renderPopup();
    expect(screen.getByText('PR')).toBeDefined();
  });

  it('says which keys already open this tab', async () => {
    await store('Y', { link: 'https://github.com/' });
    await store('2', { link: PAGE_URL, tabMatch: 'exact' });
    await store('T', { link: 'https://github.com/other', tabMatch: 'exact' });
    await renderPopup();
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
    expect(chips()).toEqual(['⌥G', '⌥P', '⌥R', '⌥A']);
    expect(pickedKey()).toBe('G');
    expect(button('⌥G').getAttribute('aria-pressed')).toBe('true');
    expect(primary().textContent).toBe('Save to ⌥G');
    expect(screen.getByText('Press a key to put this page on it')).toBeDefined();
  });

  it('picks the first free key in keyboard order when no key fits', async () => {
    await fillAllBut('3', 'Z');
    await renderPopup();
    expect(chips()).toEqual([]);
    expect(pickedKey()).toBe('3');
  });

  it('picks a physical key press by its position', async () => {
    await renderPopup();
    await press('KeyK', { key: 'л' });
    expect(pickedKey()).toBe('K');
    expect(primary().textContent).toBe('Save to ⌥K');
    expect(miniKey('K').getAttribute('aria-pressed')).toBe('true');
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
    fireEvent.click(button('⌥R'));
    expect(pickedKey()).toBe('R');
    fireEvent.click(miniKey('7'));
    expect(pickedKey()).toBe('7');
  });

  it('labels mini-keyboard keys with their shortcut or as free, and keeps S out', async () => {
    await store('Y', { name: 'YouTube' });
    await renderPopup();
    expect(miniKey('Y').getAttribute('aria-label')).toBe('Option Y: YouTube');
    expect(miniKey('K').getAttribute('aria-label')).toBe('Option K: free');
    expect(isDisabled(miniKey('S'))).toBe(true);
  });

  it('leaves key presses inside "Opens as" to the select', async () => {
    await renderPopup();
    await press('KeyK', {}, screen.getByRole('combobox', { name: 'Opens as' }));
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
    const select = screen.getByRole('combobox', { name: 'Opens as' });
    expect(select.textContent).toBe('Smart switch');
    await act(() => {
      fireEvent.keyDown(select, { key: 'Enter' });
    });
    fireEvent.click(screen.getByRole('option', { name: 'Background tab' }));
    await settle();

    fireEvent.click(primary());

    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'G', tabId: 7, openMode: 'bg' });
  });

  it('↵ on a focused button activates that button, not the save', async () => {
    await renderPopup();
    const chip = button('⌥R');
    chip.focus();
    await press('Enter', { key: 'Enter' }, chip);
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
    expect(isDisabled(button('⌥R'))).toBe(true);
    expect(isDisabled(miniKey('K'))).toBe(true);
    expect(isDisabled(screen.getByRole('combobox', { name: 'Opens as' }))).toBe(true);
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
    expect(alert.textContent).toBe('⌥K already opens Kagi.ReplaceMove it to ⌥A');
    expect(within(alert).getByText('Kagi').tagName).toBe('STRONG');
    expect(primary().textContent).toBe('Replace ⌥K');
  });

  it.each([
    ['the primary button', () => primary()],
    ['Replace in the alert', () => within(screen.getByRole('alert')).getByRole('button', { name: 'Replace' })],
  ])('%s replaces', async (_, target) => {
    await renderPopup();
    await press('KeyK');
    fireEvent.click(target());
    expect(assignPage).toHaveBeenCalledExactlyOnceWith({ key: 'K', tabId: 7, openMode: 'smart', resolve: 'replace' });
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
    await press('KeyP');
    expect(screen.getByRole('alert').textContent).toMatch(/^⌥P already opens Pulls\./);
  });

  it('shows the conflict as soon as the picked key is taken elsewhere', async () => {
    await renderPopup();
    expect(pickedKey()).toBe('G');
    await act(() => store('G', { name: 'Gmail' }));
    await settle();
    expect(screen.getByRole('alert').textContent).toMatch(/^⌥G already opens Gmail\./);
    expect(chips()).toEqual(['⌥P', '⌥R', '⌥A', '⌥I']);
  });
});

describe('all 35 keys in use', () => {
  it('has no chips and no picked key, says so, and saves nothing until a key is pressed', async () => {
    await fillAllBut();
    await renderPopup();

    expect(chips()).toEqual([]);
    expect(screen.getByText('All 35 keys are in use — press one to replace it')).toBeDefined();
    expect(isDisabled(primary())).toBe(true);
    await press('Enter', { key: 'Enter' });
    expect(assignPage).not.toHaveBeenCalled();

    await press('KeyK');
    expect(primary().textContent).toBe('Replace ⌥K');
    expect(queryButton(/^Move it to/)).toBeNull();
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Replace' })).toBeDefined();
  });
});

describe('an unusable page', () => {
  it.each(['chrome://extensions/', 'https://chromewebstore.google.com/detail/abc'])(
    'on %s, says so and disables the picker and Save',
    async (url) => {
      tabs = [activeTab({ url, title: 'Extensions' })];
      await renderPopup();

      expect(screen.getByText('This page can’t be put on a key')).toBeDefined();
      expect(isDisabled(primary())).toBe(true);
      expect(isDisabled(miniKey('K'))).toBe(true);
      await press('KeyK');
      await press('Enter', { key: 'Enter' });
      expect(assignPage).not.toHaveBeenCalled();
    },
  );

  it('still opens the keymap', async () => {
    tabs = [activeTab({ url: 'chrome://extensions/' })];
    await renderPopup();
    fireEvent.click(button('Open keymap'));
    await settle();
    expect(openOptions).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('the frame', () => {
  it('shows the footer tip', async () => {
    await renderPopup();
    expect(screen.getByText('Tip: hold ⌥ Option on any page to see all keys')).toBeDefined();
  });

  it('reads Alt + K off a Mac', async () => {
    await renderPopup({ platform: 'other' });
    expect(primary().textContent).toBe('Save to Alt+G');
    expect(screen.getByText('Alt +')).toBeDefined();
    expect(screen.getByText('Tip: hold Alt on any page to see all keys')).toBeDefined();
  });
});
