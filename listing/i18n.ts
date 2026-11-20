// The product's components read their text with the global `i18n.t`, which WXT provides inside the extension. The
// listing renders some of them (the overlay tiles) to static markup in Node, so it installs the same lookup there,
// served from the real locale file as `src/test/setup-i18n.ts` does for the tests.
import { resolve } from 'node:path';
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build';

export async function installI18n(): Promise<void> {
  const messages = generateChromeMessages(
    await parseMessagesFile(resolve(import.meta.dirname, '../src/locales/en.yml')),
  );
  const t = (key: string, substitutions: (string | number)[] = []) =>
    (messages[key.replaceAll('.', '_')]?.message ?? '').replace(/\$(\$|[1-9])/g, (_, ref: string) =>
      ref === '$' ? '$' : String(substitutions[Number(ref) - 1] ?? ''),
    );
  Object.assign(globalThis, { i18n: { t } });
}
