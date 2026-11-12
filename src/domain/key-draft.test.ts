import { describe, expect, it } from 'vitest';
import { checkDraft, draftOf, hintLink, type KeyDraft, keyStatus, mergeRemote } from './key-draft';
import { validShortcut } from './test-shortcut';

const github = validShortcut({ link: 'https://github.com/', name: 'GitHub', tabMatch: 'page', future: [1] });

const draft = (fields: Partial<KeyDraft> = {}): KeyDraft => ({ ...draftOf(github), ...fields });

describe('draftOf', () => {
  it('shows a shortcut as raw fields, a missing name as empty', () => {
    expect(draftOf(validShortcut({ link: 'https://x.com/' }))).toEqual({
      link: 'https://x.com/',
      name: '',
      openMode: 'smart',
      tabMatch: 'site',
      closeCurrent: false,
    });
  });

  it('gives a free key an empty draft with the defaults', () => {
    expect(draftOf(undefined)).toEqual({
      link: '',
      name: '',
      openMode: 'smart',
      tabMatch: 'site',
      closeCurrent: false,
    });
  });
});

describe('checkDraft', () => {
  it('is the same when the draft only differs from the stored shortcut by normalization', () => {
    expect(checkDraft(draft({ link: ' github.com ', name: ' GitHub ' }), github)).toEqual({ kind: 'same' });
  });

  it('is the same for an untouched free key', () => {
    expect(checkDraft(draftOf(undefined), undefined)).toEqual({ kind: 'same' });
  });

  it('adds https:// to a scheme-less link', () => {
    const check = checkDraft(draft({ link: 'gitlab.com/me' }), github);
    expect(check).toMatchObject({ kind: 'valid', shortcut: { link: 'https://gitlab.com/me' } });
  });

  it('adds http:// to localhost', () => {
    const check = checkDraft(draft({ link: 'localhost:3000' }), github);
    expect(check).toMatchObject({ kind: 'valid', shortcut: { link: 'http://localhost:3000/' } });
  });

  it('leaves out an empty or whitespace-only name', () => {
    const check = checkDraft(draft({ name: '   ' }), github);
    expect(check.kind).toBe('valid');
    expect(check.kind === 'valid' && 'name' in check.shortcut).toBe(false);
  });

  it('carries the stored shortcut’s unknown fields through', () => {
    const check = checkDraft(draft({ openMode: 'new' }), github);
    expect(check).toEqual({
      kind: 'valid',
      shortcut: {
        link: 'https://github.com/',
        name: 'GitHub',
        openMode: 'new',
        tabMatch: 'page',
        closeCurrent: false,
        future: [1],
      },
    });
  });

  it('makes a free key’s draft a shortcut once its link is valid', () => {
    expect(checkDraft({ ...draftOf(undefined), link: 'github.com' }, undefined)).toEqual({
      kind: 'valid',
      shortcut: { link: 'https://github.com/', openMode: 'smart', tabMatch: 'site', closeCurrent: false },
    });
  });

  it('rejects a non-web scheme and shows the error', () => {
    expect(checkDraft(draft({ link: 'mailto:me@example.com' }), github)).toEqual({ kind: 'invalid', showError: true });
  });

  it('rejects an emptied link on an assigned key and shows the error', () => {
    expect(checkDraft(draft({ link: '  ' }), github)).toEqual({ kind: 'invalid', showError: true });
  });

  it('rejects a free key’s draft with no link yet, without an error', () => {
    expect(checkDraft({ ...draftOf(undefined), openMode: 'new' }, undefined)).toEqual({
      kind: 'invalid',
      showError: false,
    });
  });
});

describe('mergeRemote', () => {
  const remote = validShortcut({ link: 'https://gitlab.com/' });

  it('a clean draft adopts the stored value', () => {
    expect(mergeRemote(draft(), false, remote)).toEqual(draftOf(remote));
  });

  it('a dirty draft is kept', () => {
    const typing = draft({ link: 'githu' });
    expect(mergeRemote(typing, true, remote)).toBe(typing);
  });

  it('a clean draft of a key cleared elsewhere becomes a free draft', () => {
    expect(mergeRemote(draft(), false, undefined)).toEqual(draftOf(undefined));
  });

  it('a dirty draft of a key cleared elsewhere stays as a draft on the free key', () => {
    const typing = draft({ name: 'Code' });
    expect(mergeRemote(typing, true, undefined)).toBe(typing);
  });
});

describe('keyStatus', () => {
  it('is free on a free key', () => {
    expect(keyStatus(undefined, false)).toEqual({ kind: 'free' });
  });

  it('is open when the shortcut is open in a tab now', () => {
    expect(keyStatus(github, true)).toEqual({ kind: 'open' });
  });

  it('is the open mode otherwise', () => {
    expect(keyStatus(validShortcut({ link: 'https://x.com/', openMode: 'bg' }), false)).toEqual({
      kind: 'mode',
      openMode: 'bg',
    });
  });
});

describe('hintLink', () => {
  it('is the draft’s link, normalized, when valid', () => {
    expect(hintLink(draft({ link: 'gitlab.com' }), github)).toBe('https://gitlab.com/');
  });

  it('is the stored link while the draft’s link is invalid', () => {
    expect(hintLink(draft({ link: 'mailto:x' }), github)).toBe('https://github.com/');
  });

  it('is null on a free key with no valid link yet', () => {
    expect(hintLink(draftOf(undefined), undefined)).toBeNull();
  });
});
