/**
 * Surge — CSS generator
 * ---------------------------------------------------------------------------
 * Emits `src/styles/themes.css`: every theme x every mode as a static class,
 * plus the theme-independent geometry/motion tokens.
 *
 * Static CSS (rather than runtime-only JS) means the very first paint is
 * already correctly themed — no flash of unstyled/default palette while Vue
 * boots, which matters a lot for an Android splash → app handoff.
 *
 *   node tools/gen-css.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND_THEMES,
  buildTokens,
  tokensToCssVars,
  SPACE,
  RADIUS,
  ELEVATION,
  MOTION,
  SIZES,
  BREAKPOINTS,
  Z,
  DEFAULT_THEME_ID,
  DEFAULT_MODE,
  typeScaleToCssVars,
} from './themes.mjs';
import { rgbTriplet } from './color.mjs';
import { kebab } from './themes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../src/styles/themes.css');

/** Keys are camelCase in JS but must be emitted kebab-case to match the CSS. */
const vars = (obj, prefix, transform = (v) => v) =>
  Object.entries(obj)
    .map(([k, v]) => `  ${prefix}${kebab(k)}: ${transform(v)};`)
    .join('\n');

const elevationVars = (dark) =>
  Object.entries(ELEVATION)
    .map(([lvl, e]) => {
      const a = dark ? e.alphaDark : e.alphaLight;
      return `  --s-elevation-${lvl}: 0 ${e.y}px ${e.blur}px ${e.spread}px rgb(0 0 0 / ${a});`;
    })
    .join('\n');

/** Elevation also gets a tonal overlay in dark mode, per M3. */
const tonalOverlayVars = (colors, dark) => {
  if (!dark) return '';
  const tri = rgbTriplet(colors.primary);
  return [
    `  --s-elevation-overlay-1: rgb(${tri} / 0.05);`,
    `  --s-elevation-overlay-2: rgb(${tri} / 0.08);`,
    `  --s-elevation-overlay-3: rgb(${tri} / 0.11);`,
    `  --s-elevation-overlay-4: rgb(${tri} / 0.12);`,
    `  --s-elevation-overlay-5: rgb(${tri} / 0.14);`,
  ].join('\n');
};

const blocks = [];

/* ---- 1. theme-independent tokens on :root -------------------------------- */
blocks.push(`/* ===========================================================================
   Surge — generated design tokens
   DO NOT EDIT BY HAND. Regenerate with:  node tools/gen-css.mjs
   Source of truth: tools/themes.mjs + tools/color.mjs
   =========================================================================== */

:root {
  /* ---- spacing ---- */
${vars(SPACE, '--s-space-')}

  /* ---- radius ---- */
${vars(RADIUS, '--s-radius-')}

  /* ---- motion ---- */
${vars(MOTION, '--s-motion-')}

  /* ---- sizes / touch targets ---- */
${vars(SIZES, '--s-size-')}

  /* ---- breakpoints ---- */
${vars(BREAKPOINTS, '--s-bp-')}

  /* ---- z-index ladder ---- */
${vars(Z, '--s-z-')}

  /* ---- type scale (M3 expressive, theme-independent) ---- */
${typeScaleToCssVars()}

  /* ---- font stacks (system only: no network fetch, instant render) ---- */
  --s-font-sans: "Roboto Flex", "Roboto", system-ui, -apple-system, "Segoe UI",
    "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --s-font-mono: "Roboto Mono", ui-monospace, "SF Mono", "JetBrains Mono",
    Menlo, Consolas, monospace;

  /* ---- default theme (overridden immediately by the theme class) ---- */
  color-scheme: ${DEFAULT_MODE};
}
`);

/* ---- 2. one block per theme x mode --------------------------------------- */
for (const theme of BRAND_THEMES) {
  for (const mode of ['light', 'dark']) {
    const bundle = buildTokens(theme, mode);
    const dark = mode === 'dark';
    const selector =
      theme.id === DEFAULT_THEME_ID && mode === DEFAULT_MODE
        ? `.theme-${theme.id}.mode-${mode},\n.theme-${theme.id}:not([class*="mode-"])`
        : `.theme-${theme.id}.mode-${mode}`;

    blocks.push(`/* ${theme.name} — ${mode}${dark ? ' (default)' : ''} */
${selector} {
${tokensToCssVars(bundle)}

  /* ---- elevation shadows ---- */
${elevationVars(dark)}

${tonalOverlayVars(bundle.colors, dark)}

  /* ---- derived alphas ---- */
  --s-scrim: rgb(0 0 0 / ${bundle.colors.scrimAlpha});
  --s-state-layer: rgb(${rgbTriplet(bundle.colors.onSurface)} / 0.08);
  --s-state-layer-hover: rgb(${rgbTriplet(bundle.colors.onSurface)} / 0.05);
  --s-state-layer-pressed: rgb(${rgbTriplet(bundle.colors.onSurface)} / 0.12);
  --s-state-layer-primary: rgb(${rgbTriplet(bundle.colors.primary)} / 0.12);
  --s-shimmer: rgb(${rgbTriplet(bundle.colors.onSurface)} / 0.06);

  color-scheme: ${mode};
}
`);
  }
}

/* ---- 3. system auto-mode -------------------------------------------------- */
blocks.push(`/* System preference drives the mode when the user picks "Follow system".
   The theme class stays; only the mode class flips, so these act as the
   fallback for users with JS disabled or before hydration. */
@media (prefers-color-scheme: dark) {
  .theme-auto:not(.mode-light):not(.mode-dark) {
${tokensToCssVars(buildTokens(BRAND_THEMES.find((t) => t.id === DEFAULT_THEME_ID), 'dark'))}
${elevationVars(true)}
    --s-scrim: rgb(0 0 0 / 0.62);
    color-scheme: dark;
  }
}
@media (prefers-color-scheme: light) {
  .theme-auto:not(.mode-light):not(.mode-dark) {
${tokensToCssVars(buildTokens(BRAND_THEMES.find((t) => t.id === DEFAULT_THEME_ID), 'light'))}
${elevationVars(false)}
    --s-scrim: rgb(0 0 0 / 0.42);
    color-scheme: light;
  }
}
`);

/* ---- 4. Android status/nav bar hints ------------------------------------- */
blocks.push(`/* Consumed by the StatusBar / NavigationBar Capacitor plugins on boot. */
:root {
  --s-android-statusbar: var(--s-surface-container);
  --s-android-navbar: var(--s-surface-container);
  --s-android-statusbar-style: dark; /* "dark" = dark icons, for light surfaces */
}
${BRAND_THEMES.map((t) => `.theme-${t.id}.mode-dark { --s-android-statusbar-style: light; }`).join('\n')}
`);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, blocks.join('\n'), 'utf8');

const bytes = Buffer.byteLength(blocks.join('\n'));
console.log(`wrote ${outPath.replace(process.cwd() + '/', '')}  (${(bytes / 1024).toFixed(1)} KB, ${BRAND_THEMES.length * 2} palettes)`);
