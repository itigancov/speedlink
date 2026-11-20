import { describe, expect, it } from 'vitest';
import { planAssign, planUndo, undoFor, undoRecord } from './assign-plan';
import { planExactPage, planMove, planRemove, planSetOpenMode } from './edit-plan';
import { applyChange, type Keymap } from './keymap-ops';
import { validShortcut } from './test-shortcut';

const github = validShortcut({ link: 'https://github.com/', name: 'GitHub', openMode: 'bg', closeCurrent: true });
const mail = validShortcut({ link: 'https://mail.google.com/', name: 'Mail' });
const keymap: Keymap = { G: github, M: mail };

describe('planSetOpenMode', () => {
  it('changes only the open mode, touching only the key', () => {
    expect(planSetOpenMode(keymap, 'G', 'new')).toEqual({
      kind: 'written',
      change: { G: { ...github, openMode: 'new' } },
    });
  });

  it('is missing on a free key', () => {
    expect(planSetOpenMode(keymap, 'K', 'new')).toEqual({ kind: 'missing' });
  });
});

describe('planRemove', () => {
  it('frees the key, and its undo holds the shortcut', () => {
    expect(planRemove(keymap, 'G')).toEqual({
      kind: 'written',
      change: { G: null },
      undo: { keys: { G: github }, written: { G: null } },
    });
  });

  it('is missing on a free key', () => {
    expect(planRemove(keymap, 'K')).toEqual({ kind: 'missing' });
  });

  it('is undone to exactly what the key held', () => {
    const plan = planRemove(keymap, 'G');
    if (plan.kind !== 'written') throw new Error('not written');
    const after = applyChange(keymap, plan.change);
    const record = undoRecord(plan.undo, 'u1', 0);

    expect(planUndo(after, record, { id: 'u1', now: 1 })).toEqual({ kind: 'undone', change: { G: github } });
  });
});

describe('planMove', () => {
  it('moves the shortcut to a free key, freeing the source', () => {
    expect(planMove(keymap, 'G', 'K')).toEqual({
      kind: 'written',
      shortcut: github,
      change: { G: null, K: github },
      undo: { keys: { G: github, K: null }, written: { G: null, K: github } },
    });
  });

  it('is a conflict on a taken key, nothing written', () => {
    expect(planMove(keymap, 'G', 'M')).toEqual({ kind: 'conflict', existing: mail });
  });

  it('replaces a taken key: the source is freed and the old shortcut dropped, not swapped', () => {
    expect(planMove(keymap, 'G', 'M', 'replace')).toEqual({
      kind: 'written',
      shortcut: github,
      change: { G: null, M: github },
      undo: { keys: { G: github, M: mail }, written: { G: null, M: github } },
    });
  });

  it('is undone to both keys after a replace', () => {
    const plan = planMove(keymap, 'G', 'M', 'replace');
    if (plan.kind !== 'written') throw new Error('not written');
    const after = applyChange(keymap, plan.change);
    const record = undoRecord(plan.undo, 'u1', 0);

    expect(planUndo(after, record, { id: 'u1', now: 1 })).toEqual({
      kind: 'undone',
      change: { G: github, M: mail },
    });
  });

  it('refuses a move onto itself', () => {
    expect(planMove(keymap, 'G', 'G')).toEqual({ kind: 'refused' });
    expect(planMove(keymap, 'G', 'G', 'replace')).toEqual({ kind: 'refused' });
  });

  it('is missing when the source is free', () => {
    expect(planMove(keymap, 'K', 'L')).toEqual({ kind: 'missing' });
  });
});

describe('planExactPage', () => {
  const inbox = 'https://mail.google.com/mail/u/0/#inbox';

  it('points the link at the tab URL with the exact tab match, keeping the rest', () => {
    const plan = planExactPage(keymap, 'G', inbox);

    expect(plan).toEqual({
      kind: 'written',
      change: { G: { ...github, link: inbox, tabMatch: 'exact' } },
    });
  });

  it('is missing on a free key', () => {
    expect(planExactPage(keymap, 'K', inbox)).toEqual({ kind: 'missing' });
  });

  it.each(['', 'chrome://settings/', 'about:blank', 'file:///a.html'])(
    "is unusable for a tab URL that isn't a link: %j",
    (url) => {
      expect(planExactPage(keymap, 'G', url)).toEqual({ kind: 'unusable' });
    },
  );
});

describe('undoFor', () => {
  it('matches the undo planAssign produced, for a replace', () => {
    const page = { url: 'https://docs.example.com/', title: 'Docs' };
    const plan = planAssign(keymap, 'G', page, { resolve: 'replace' });
    if (plan.kind !== 'written') throw new Error('not written');

    expect(undoFor(keymap, plan.change)).toEqual(plan.undo);
    expect(plan.undo.keys).toEqual({ G: github });
  });
});
