// PostCSS for the HUD's stylesheet only (product spec §12.3; the HUD spike's config). Vite runs it after the
// Tailwind plugin. Extension pages keep rem, so they still follow the browser's font size setting.
import remToPx from 'postcss-rem-to-responsive-pixel';

/** The HUD's stylesheet, imported `?inline` by the content script. */
const isHudCss = (file) => typeof file === 'string' && /[/\\]src[/\\]assets[/\\]hud\.css$/.test(file.split('?')[0]);

/**
 * Renames Tailwind's `--tw-*` custom properties to `--sl-tw-*`, in `@property` rules, declaration names and values.
 * WXT hoists the `@property` rules into the host page's <head>, where they would retype a Tailwind v3 page's own.
 */
const renameTailwindProperties = () => ({
  postcssPlugin: 'speedlink-rename-tw',
  prepare(result) {
    if (!isHudCss(result.opts.from)) return {};
    return {
      AtRule: {
        property(rule) {
          rule.params = rule.params.replaceAll('--tw-', '--sl-tw-');
        },
      },
      Declaration(declaration) {
        if (declaration.prop.startsWith('--tw-')) declaration.prop = `--sl-tw-${declaration.prop.slice(5)}`;
        if (declaration.value.includes('--tw-')) declaration.value = declaration.value.replaceAll('--tw-', '--sl-tw-');
      },
    };
  },
});
renameTailwindProperties.postcss = true;

export default {
  plugins: [
    // rem → px first: the host page's root font size must not scale the HUD.
    remToPx({ rootValue: 16, propList: ['*'], transformUnit: 'px', exclude: (file) => !isHudCss(file) }),
    renameTailwindProperties(),
  ],
};
