import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { KEYBOARD_ORDER } from '@/domain/keys';
import { createOccupiedKeys } from './occupied-keys';

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('createOccupiedKeys', () => {
  it('treats every key as assigned before the first read lands', () => {
    const occupied = createOccupiedKeys();

    expect(KEYBOARD_ORDER.every((key) => occupied.isAssigned(key))).toBe(true);
    occupied.dispose();
  });

  it('answers from the stored keymap once ready, an unreadable item counting as free', async () => {
    await browser.storage.sync.set({ 'key.G': { link: 'https://github.com/' }, 'key.H': { name: 'no link' } });
    const occupied = createOccupiedKeys();

    await occupied.ready;

    expect(occupied.isAssigned('G')).toBe(true);
    expect(occupied.isAssigned('H')).toBe(false);
    expect(occupied.isAssigned('Y')).toBe(false);
    occupied.dispose();
  });

  it('learns about a key assigned and a key cleared after it was ready', async () => {
    await browser.storage.sync.set({ 'key.G': { link: 'https://github.com/' } });
    const occupied = createOccupiedKeys();
    await occupied.ready;

    await browser.storage.sync.set({ 'key.Y': { link: 'https://youtube.com/' } });
    await vi.waitFor(() => expect(occupied.isAssigned('Y')).toBe(true));
    await browser.storage.sync.remove('key.G');
    await vi.waitFor(() => expect(occupied.isAssigned('G')).toBe(false));
    occupied.dispose();
  });

  it('stops updating after dispose', async () => {
    const occupied = createOccupiedKeys();
    await occupied.ready;

    occupied.dispose();
    await browser.storage.sync.set({ 'key.Y': { link: 'https://youtube.com/' } });
    await browser.storage.sync.get(null);

    expect(occupied.isAssigned('Y')).toBe(false);
  });

  it('never writes storage', async () => {
    await browser.storage.sync.set({ 'key.G': { name: 'no link' } });
    const set = vi.spyOn(browser.storage.sync, 'set');
    const remove = vi.spyOn(browser.storage.sync, 'remove');
    const occupied = createOccupiedKeys();

    await occupied.ready;
    occupied.dispose();

    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
