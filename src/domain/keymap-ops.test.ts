import { describe, expect, it } from 'vitest';
import { applyChange, assign, clear, type Keymap, move, put, swap } from './keymap-ops';
import { KEYBOARD_ORDER } from './keys';
import { validShortcut } from './test-shortcut';

const github = validShortcut({ link: 'github.com', name: 'GitHub' });
const youtube = validShortcut({ link: 'youtube.com', openMode: 'new', tabMatch: 'exact' });
const mail = validShortcut({ link: 'mail.google.com', name: 'Mail' });

describe('applyChange', () => {
  it('writes and frees only the touched keys, returning a new keymap', () => {
    const keymap: Keymap = { G: github, Y: youtube };
    const next = applyChange(keymap, { Y: null, M: mail });
    expect(next).toEqual({ G: github, M: mail });
    expect(keymap).toEqual({ G: github, Y: youtube });
  });

  it('keeps the keymap as is for an empty change', () => {
    expect(applyChange({ G: github }, {})).toEqual({ G: github });
  });
});

describe('assign', () => {
  it('writes a free key straight away', () => {
    expect(assign({ G: github }, 'Y', youtube)).toEqual({ kind: 'written', change: { Y: youtube } });
  });

  it('ignores resolve on a free key', () => {
    expect(assign({}, 'Y', youtube, 'move')).toEqual({ kind: 'written', change: { Y: youtube } });
    expect(assign({}, 'Y', youtube, 'replace')).toEqual({ kind: 'written', change: { Y: youtube } });
  });

  it('reports a conflict on an occupied key, with the existing shortcut and a fitting Move target', () => {
    expect(assign({ G: github }, 'G', mail)).toEqual({ kind: 'conflict', existing: github, moveTarget: 'I' });
  });

  it('replaces the old shortcut, with the new one carrying nothing of it', () => {
    expect(assign({ G: github }, 'G', mail, 'replace')).toEqual({ kind: 'written', change: { G: mail } });
  });

  it('moves the old shortcut to its Move target', () => {
    expect(assign({ G: github, Y: youtube }, 'G', mail, 'move')).toEqual({
      kind: 'written',
      change: { G: mail, I: github },
    });
  });

  it('returns the conflict without a Move target when every key is in use', () => {
    const full: Keymap = Object.fromEntries(KEYBOARD_ORDER.map((key) => [key, youtube]));
    const fullWithGithub: Keymap = { ...full, G: github };
    expect(assign(fullWithGithub, 'G', mail)).toEqual({ kind: 'conflict', existing: github, moveTarget: null });
    expect(assign(fullWithGithub, 'G', mail, 'move')).toEqual({
      kind: 'conflict',
      existing: github,
      moveTarget: null,
    });
    expect(assign(fullWithGithub, 'G', mail, 'replace')).toEqual({ kind: 'written', change: { G: mail } });
  });
});

describe('put', () => {
  it('writes the key unconditionally', () => {
    expect(put('G', mail)).toEqual({ G: mail });
  });
});

describe('swap', () => {
  it('exchanges two occupied keys', () => {
    expect(swap({ G: github, Y: youtube, M: mail }, 'G', 'Y')).toEqual({ G: youtube, Y: github });
  });

  it('moves a shortcut onto a free key, freeing the old one', () => {
    expect(swap({ G: github }, 'G', 'H')).toEqual({ G: null, H: github });
    expect(swap({ G: github }, 'H', 'G')).toEqual({ G: null, H: github });
  });

  it('changes nothing for the same key or two free keys', () => {
    expect(swap({ G: github }, 'G', 'G')).toEqual({});
    expect(swap({ G: github }, 'A', 'B')).toEqual({});
  });
});

describe('move', () => {
  it('moves a shortcut to a free key, freeing the source', () => {
    expect(move({ G: github, Y: youtube }, 'G', 'H')).toEqual({ ok: true, value: { G: null, H: github } });
  });

  it('fails when the source is free', () => {
    expect(move({ Y: youtube }, 'G', 'H')).toEqual({ ok: false, error: 'source-free' });
  });

  it('fails when the target is occupied', () => {
    expect(move({ G: github, Y: youtube }, 'G', 'Y')).toEqual({ ok: false, error: 'target-occupied' });
    expect(move({ G: github }, 'G', 'G')).toEqual({ ok: false, error: 'target-occupied' });
  });
});

describe('clear', () => {
  it('frees an occupied key', () => {
    expect(clear({ G: github, Y: youtube }, 'G')).toEqual({ G: null });
  });

  it('changes nothing for a free key', () => {
    expect(clear({ Y: youtube }, 'G')).toEqual({});
  });
});
