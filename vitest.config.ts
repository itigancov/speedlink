import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup-i18n.ts', 'src/test/setup-dom.ts'],
    // Component tests (`*.test.tsx`) opt into happy-dom with a `@vitest-environment happy-dom` docblock.
  },
});
