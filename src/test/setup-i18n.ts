// fakeBrowser leaves `i18n.getMessage` unmocked. Serve it from the real locale file, as Chrome serves the built
// `_locales/en/messages.json`, so tests assert on the shipped text.
import { resolve } from 'node:path';
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const messages = generateChromeMessages(await parseMessagesFile(resolve(import.meta.dirname, '../locales/en.yml')));

fakeBrowser.i18n.getMessage = (name: string, substitutions?: string | (string | number)[]) => {
  const subs = substitutions === undefined ? [] : [substitutions].flat().map(String);
  const message = messages[name]?.message ?? '';
  return message.replace(/\$(\$|[1-9])/g, (_, ref: string) => (ref === '$' ? '$' : (subs[Number(ref) - 1] ?? '')));
};
