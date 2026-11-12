import { describe, expect, it } from 'vitest';
import { classifySendError, isRestrictedUrl } from './restricted';

describe('isRestrictedUrl', () => {
  it.each([
    'chrome://extensions/',
    'chrome://newtab/',
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html',
    'chrome-untrusted://print/',
    'chrome-search://local-ntp/local-ntp.html',
    'devtools://devtools/bundled/inspector.html',
    'edge://settings',
    'about:blank',
    'view-source:https://example.com/',
    'file:///Users/me/notes.html',
    'https://chromewebstore.google.com/detail/speedlink/abc',
    'https://chrome.google.com/webstore/detail/abc',
    'https://chrome.google.com/webstore',
    'https://www.google.com/_/chrome/newtab?ie=UTF-8',
    'data:text/html,hi',
    '',
    'not a url',
  ])('%s is restricted', (url) => {
    expect(isRestrictedUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/',
    'http://localhost:3000/',
    'https://chrome.google.com/',
    'https://chrome.google.com/webstorex',
    'https://google.com/search?q=chrome',
    'https://docs.google.com/document/d/1',
  ])('%s is not restricted', (url) => {
    expect(isRestrictedUrl(url)).toBe(false);
  });
});

describe('classifySendError', () => {
  it.each([
    ['Cannot access a chrome:// URL', 'restricted'],
    ['Cannot access a chrome-extension:// URL of different extension', 'restricted'],
    [
      'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
      'restricted',
    ],
    [
      'Cannot access contents of url "https://example.com/file.pdf". Extension manifest must request permission.',
      'restricted',
    ],
    ['The extensions gallery cannot be scripted.', 'restricted'],
    ['Could not establish connection. Receiving end does not exist.', 'no-receiver'],
    ['Receiving end does not exist.', 'no-receiver'],
    ['No tab with id: 12.', 'other'],
    ['', 'other'],
  ] as const)('%s → %s', (message, kind) => {
    expect(classifySendError(message)).toBe(kind);
  });
});
