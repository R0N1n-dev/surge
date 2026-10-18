/**
 * Surge — design-token verification
 * ---------------------------------------------------------------------------
 * Runs every theme x every mode through the token builder and asserts the
 * colour pairings that carry text actually meet WCAG AA (4.5:1). This is the
 * guard rail that stops a new palette from silently shipping unreadable UI.
 *
 *   node tools/verify-tokens.mjs          → human readable report
 *   node tools/verify-tokens.mjs --strict → non-zero exit on any failure
 */

import { BRAND_THEMES, buildTokens } from './themes.mjs';
import { contrast } from './color.mjs';

const STRICT = process.argv.includes('--strict');

/** [background token, foreground token, minimum ratio] */
const REQUIRED_PAIRS = [
  ['primary', 'onPrimary', 4.5],
  ['primaryContainer', 'onPrimaryContainer', 4.5],
  ['secondary', 'onSecondary', 4.5],
  ['secondaryContainer', 'onSecondaryContainer', 4.5],
  ['tertiary', 'onTertiary', 4.5],
  ['tertiaryContainer', 'onTertiaryContainer', 4.5],
  ['accent', 'onAccent', 4.5],
  ['accentContainer', 'onAccentContainer', 4.5],
  ['surface', 'onSurface', 7],
  ['surfaceContainer', 'onSurface', 7],
  ['surfaceContainerHigh', 'onSurface', 7],
  ['background', 'onBackground', 7],
  ['error', 'onError', 4.5],
  ['errorContainer', 'onErrorContainer', 4.5],
  ['success', 'onSuccess', 4.5],
  ['successContainer', 'onSuccessContainer', 4.5],
  ['warning', 'onWarning', 4.5],
  ['info', 'onInfo', 4.5],
  ['inverseSurface', 'inverseOnSurface', 7],
  ['brand', 'onBrand', 4.5],
];

/** Large text / UI-component pairings only need 3:1 (WCAG 1.4.11). */
const NON_TEXT_PAIRS = [
  ['surface', 'outline'],
  ['surface', 'primary'],
  ['surfaceContainer', 'primary'],
  ['surface', 'stateActive'],
  ['surface', 'stateDone'],
  ['surface', 'stateError'],
];

let failures = 0;
let checks = 0;
const rows = [];

for (const theme of BRAND_THEMES) {
  for (const mode of ['light', 'dark']) {
    const { colors } = buildTokens(theme, mode);
    const bad = [];
    for (const [bg, fg, min] of REQUIRED_PAIRS) {
      checks++;
      const ratio = contrast(colors[bg], colors[fg]);
      if (ratio < min) bad.push(`${bg}/${fg} ${ratio.toFixed(2)}<${min}`);
    }
    for (const [bg, fg] of NON_TEXT_PAIRS) {
      checks++;
      const ratio = contrast(colors[bg], colors[fg]);
      if (ratio < 3) bad.push(`(ui) ${bg}/${fg} ${ratio.toFixed(2)}<3`);
    }
    if (bad.length) failures++;
    rows.push({
      id: theme.id,
      mode,
      ok: bad.length === 0,
      detail: bad.join(' | '),
      surface: colors.surface,
      primary: colors.primary,
      brand: colors.brand,
    });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('Surge token audit');
console.log('='.repeat(96));
for (const r of rows) {
  console.log(
    `${r.ok ? '  ok ' : ' FAIL'}  ${pad(r.id, 20)} ${pad(r.mode, 6)} ` +
      `surface=${r.surface}  primary=${r.primary}  brand=${r.brand}` +
      (r.detail ? `\n         ↳ ${r.detail}` : ''),
  );
}
console.log('='.repeat(96));
console.log(`${checks} contrast checks · ${rows.length - failures}/${rows.length} theme+mode combos passing`);

if (failures && STRICT) process.exit(1);
