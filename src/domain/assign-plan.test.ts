import { describe, expect, it } from 'vitest';
import { planAssign, planUndo, UNDO_LIFETIME_MS, type UndoRecord, undoRecord } from './assign-plan';
import type { Keymap } from './keymap-ops';
import { KEYBOARD_ORDER, type Key } from './keys';
import type { Shortcut } from './shortcut';
import { validShortcut } from './test-shortcut';

const page = { url: 'https://docs.example.com/guide?page=2', title: 'The Guide' };
/** What the page becomes on a key: its tab title as the name, the default settings. */
const saved = validShortcut({ link: 'https://docs.example.com/guide?page=2', name: 'The Guide' });
const github = validShortcut({
  link: 'github.com',
  name: 'GitHub',
  openMode: 'bg',
  tabMatch: 'exact',
  closeCurrent: true,
});

describe('planAssign', () => {
  it('puts the page on a free key, named after its title, with the default settings', () => {
    expect(planAssign({}, 'K', page)).toEqual({
      kind: 'written',
      change: { K: saved },
      undo: { keys: { K: null }, written: { K: saved } },
    });
  });

  it.each([
    'chrome://settings/',
    'file:///Users/me/notes.html',
    'about:blank',
    'https://chromewebstore.google.com/detail/abc',
    'https://www.google.com/_/chrome/newtab?ie=UTF-8',
  ])("writes nothing for a page that can't go on a key: %s", (url) => {
    expect(planAssign({}, 'K', { url, title: 'Anything' })).toEqual({ kind: 'unusable' });
  });

  it.each(['', '   '])('saves a page with the title %j without a name', (title) => {
    const plan = planAssign({}, 'K', { url: page.url, title });

    expect(plan.kind === 'written' && plan.change.K).toEqual(validShortcut({ link: page.url }));
  });

  it('trims the title', () => {
    const plan = planAssign({}, 'K', { url: page.url, title: '  The Guide \n' });

    expect(plan.kind === 'written' && plan.change.K).toEqual(saved);
  });

  it('applies the given open mode, the rest staying default', () => {
    const plan = planAssign({}, 'K', page, { openMode: 'new' });

    expect(plan.kind === 'written' && plan.change.K).toEqual(
      validShortcut({ link: page.url, name: 'The Guide', openMode: 'new' }),
    );
  });

  it('reports a conflict on an occupied key, with the existing shortcut and its Move target', () => {
    expect(planAssign({ G: github }, 'G', page)).toEqual({ kind: 'conflict', existing: github, moveTarget: 'I' });
  });

  it('replaces: the old shortcut goes, its settings not inherited, and undo remembers it', () => {
    expect(planAssign({ G: github }, 'G', page, { resolve: 'replace' })).toEqual({
      kind: 'written',
      change: { G: saved },
      undo: { keys: { G: github }, written: { G: saved } },
    });
  });

  it('moves: the old shortcut goes to its Move target, and undo frees that key and restores the original', () => {
    expect(planAssign({ G: github }, 'G', page, { resolve: 'move' })).toEqual({
      kind: 'written',
      change: { G: saved, I: github },
      undo: { keys: { G: github, I: null }, written: { G: saved, I: github } },
    });
  });

  it('reports a conflict with no Move target when no key is free, even when asked to move', () => {
    const full: Keymap = Object.fromEntries(KEYBOARD_ORDER.map((key): [Key, Shortcut] => [key, github]));

    expect(planAssign(full, 'G', page, { resolve: 'move' })).toEqual({
      kind: 'conflict',
      existing: github,
      moveTarget: null,
    });
  });
});

const NOW = 1_000_000;

/** The record an assign on `keymap` leaves, written at NOW under `id`. */
function assigned(keymap: Keymap, key: Key, resolve?: 'replace' | 'move', id = 'a1'): UndoRecord {
  const plan = planAssign(keymap, key, page, { resolve });
  if (plan.kind !== 'written') throw new Error(`no assign: ${plan.kind}`);
  return undoRecord(plan.undo, id, NOW);
}

describe('planUndo', () => {
  it('frees a key the assign put a page on', () => {
    const record = assigned({}, 'K');

    expect(planUndo({ K: saved }, record, { id: 'a1', now: NOW + 1000 })).toEqual({
      kind: 'undone',
      change: { K: null },
    });
  });

  it('brings a replaced shortcut back on its key', () => {
    const record = assigned({ G: github }, 'G', 'replace');

    expect(planUndo({ G: saved }, record, { id: 'a1', now: NOW })).toEqual({ kind: 'undone', change: { G: github } });
  });

  it('after a Move, puts the old shortcut back and frees the key it was moved to', () => {
    const record = assigned({ G: github }, 'G', 'move');

    expect(planUndo({ G: saved, I: github }, record, { id: 'a1', now: NOW })).toEqual({
      kind: 'undone',
      change: { G: github, I: null },
    });
  });

  it('leaves other keys alone', () => {
    const record = assigned({}, 'K');
    const mail = validShortcut({ link: 'mail.google.com' });

    expect(planUndo({ K: saved, M: mail }, record, { id: 'a1', now: NOW })).toEqual({
      kind: 'undone',
      change: { K: null },
    });
  });

  it('matches what was written by its fields, not by identity (a record read back from storage)', () => {
    const record = JSON.parse(JSON.stringify(assigned({ G: github }, 'G', 'move'))) as UndoRecord;

    expect(planUndo({ G: saved, I: github }, record, { id: 'a1', now: NOW }).kind).toBe('undone');
  });

  it.each<[string, Keymap]>([
    ['the key was edited', { K: validShortcut({ link: page.url, name: 'Renamed' }) }],
    ['the key was cleared', {}],
  ])('is stale when %s since the assign', (_, keymap) => {
    expect(planUndo(keymap, assigned({}, 'K'), { id: 'a1', now: NOW })).toEqual({ kind: 'stale' });
  });

  it('is stale when a replaced key was put back by hand since', () => {
    const record = assigned({ G: github }, 'G', 'replace');

    expect(planUndo({ G: github }, record, { id: 'a1', now: NOW })).toEqual({ kind: 'stale' });
  });

  it('after a Move, is stale when only the moved-to key changed, the original untouched', () => {
    const record = assigned({ G: github }, 'G', 'move');
    const other = validShortcut({ link: 'https://intranet.example/' });

    expect(planUndo({ G: saved, I: other }, record, { id: 'a1', now: NOW })).toEqual({ kind: 'stale' });
    expect(planUndo({ G: saved }, record, { id: 'a1', now: NOW })).toEqual({ kind: 'stale' });
  });

  it('is stale with no record', () => {
    expect(planUndo({ K: saved }, undefined, { id: 'a1', now: NOW })).toEqual({ kind: 'stale' });
  });

  it("is stale for another assign's id", () => {
    const record = assigned({}, 'K', undefined, 'newer');

    expect(planUndo({ K: saved }, record, { id: 'a1', now: NOW })).toEqual({ kind: 'stale' });
  });

  it('is stale once the 60 s backstop has passed', () => {
    const record = assigned({}, 'K');
    expect(record.expiresAt).toBe(NOW + 60_000);
    expect(UNDO_LIFETIME_MS).toBe(60_000);

    expect(planUndo({ K: saved }, record, { id: 'a1', now: NOW + 59_999 }).kind).toBe('undone');
    expect(planUndo({ K: saved }, record, { id: 'a1', now: NOW + 60_000 })).toEqual({ kind: 'stale' });
  });
});
