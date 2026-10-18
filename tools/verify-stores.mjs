/**
 * Surge — store contract audit (runtime)
 * ---------------------------------------------------------------------------
 * The other audits read source; this one actually CONSTRUCTS the stores and
 * exercises them, because the bug that shipped a user-visible
 * "Something went wrong — the queue is safe." toast was a runtime one:
 *
 *   Pinia setup-stores UNWRAP refs on the store instance, so `store.selection`
 *   is the Set itself. Code reaching for `store.selection.value` got
 *   `undefined`, and then `[...undefined]` (batch actions) and `undefined.has()`
 *   (every download card render) threw.
 *
 * `verify-js.mjs` catches that shape statically; this proves the contract holds
 * on the real objects, and that every store can be instantiated outside a
 * component (no window/localStorage at import time, no missing export).
 *
 *   node tools/verify-stores.mjs [--strict]
 */

import { createPinia, setActivePinia } from 'pinia';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STRICT = process.argv.includes('--strict');

// Teach plain node the `@/` alias so the stores' own imports resolve.
register(new URL('./alias-hook.mjs', import.meta.url));

/* --------------------------------------------------------------- DOM shim ---
 * The theme store stamps classes on <html> and writes inline custom properties;
 * localStorage holds the persisted choice. A real WebView has all of it, plain
 * node does not — a small stub is what lets this audit actually exercise
 * setPalette()/setMode() instead of only reading the store surface.
 */
const htmlClasses = new Set();
const noop = () => {};
globalThis.document = {
  documentElement: {
    classList: {
      add: (...c) => c.forEach((x) => htmlClasses.add(x)),
      remove: (...c) => c.forEach((x) => htmlClasses.delete(x)),
      contains: (c) => htmlClasses.has(c),
      [Symbol.iterator]: () => htmlClasses[Symbol.iterator](),
    },
    style: { setProperty: noop, removeProperty: noop },
  },
  addEventListener: noop,
  removeEventListener: noop,
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ setAttribute: noop, appendChild: noop, style: {} }),
};
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

const problems = [];
const checks = [];

const ok = (label, cond, detail = '') => {
  checks.push({ label, pass: !!cond });
  if (!cond) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
};

setActivePinia(createPinia());

/* ------------------------------------------------------------------ ui ---- */
const { useUiStore } = await import(resolve(ROOT, 'src/stores/ui.js'));
const ui = useUiStore();

ok('ui.selection is a Set (not a ref)', ui.selection instanceof Set, `got ${typeof ui.selection}`);
ok('ui.selection.value is undefined (the trap)', ui.selection.value === undefined);
ok('ui.selectedIds() returns an array', Array.isArray(ui.selectedIds()));
ok('ui.selecting starts false', ui.selecting === false);
ok('ui.snack starts null', ui.snack === null);
ok('ui.filter starts a string', typeof ui.filter === 'string');

// the old expression must be what threw — documented so nobody "restores" it
let oldThrew = false;
try { const ids = [...ui.selection.value]; void ids; } catch { oldThrew = true; }
ok('the old [...selection.value] form throws', oldThrew, 'it should, that is the bug');

ui.toggleSelect('a');
ui.toggleSelect('b');
ok('toggleSelect adds ids', ui.selectedIds().length === 2, JSON.stringify(ui.selectedIds()));
ok('ui.selecting flips true', ui.selecting === true);
ok('selection.has() works on a card', ui.selection.has('a'));
ui.toggleSelect('a');
ok('toggleSelect removes ids', ui.selectedIds().length === 1);
ui.selectAll(['x', 'y', 'z']);
ok('selectAll replaces the selection', ui.selectedIds().length === 3);
ui.clearSelection();
ok('clearSelection empties it', ui.selectedIds().length === 0 && ui.selecting === false);

/* ---------------------------------------------------------- downloads ---- */
const { useDownloadsStore } = await import(resolve(ROOT, 'src/stores/downloads.js'));
const dl = useDownloadsStore();
ok('dl.items is an array', Array.isArray(dl.items));
ok('dl.filtered is an array', Array.isArray(dl.filtered));
ok('dl.counts has the filter keys', ['all', 'active', 'queued', 'complete', 'failed'].every((k) => k in dl.counts));
ok('dl.history is an array', Array.isArray(dl.history));
ok('dl.storedBytes is a number', typeof dl.storedBytes === 'number');
try {
  await dl.batch('pause'); // the line that used to throw on an empty selection
  ok('dl.batch() runs on the (now fixed) selection path', true);
} catch (e) {
  ok('dl.batch() runs on the (now fixed) selection path', false, String(e && e.message));
}

/* --------------------------------------------------------------- theme --- */
const { useThemeStore, PALETTES } = await import(resolve(ROOT, 'src/stores/theme.js'));
const theme = useThemeStore();
ok('theme.palette is a string', typeof theme.palette === 'string');
ok('theme.mode is a string', typeof theme.mode === 'string');
ok('theme.paletteMeta resolves', !!theme.paletteMeta?.name);
ok('theme.palettes exposes all 9', PALETTES.length === 9 || theme.palettes.length === 9, String(theme.palettes.length));
theme.setPalette('eco-organic');
ok('setPalette switches the store value', theme.palette === 'eco-organic');
ok('setPalette stamps the theme class on <html>', htmlClasses.has('theme-eco-organic'), [...htmlClasses].join(' '));
theme.setMode('light');
ok('setMode stamps the mode class on <html>', htmlClasses.has('mode-light'), [...htmlClasses].join(' '));
ok('mode class replaces the previous one', !htmlClasses.has('mode-dark'), [...htmlClasses].join(' '));
theme.setPalette('bright-tech');
theme.setMode('dark');

/* ------------------------------------------------------------ settings -- */
const { useSettingsStore } = await import(resolve(ROOT, 'src/stores/settings.js'));
const settings = useSettingsStore();
ok('settings.root is a string', typeof settings.root === 'string');
ok('settings.disabled is a Set', settings.disabled instanceof Set);
ok('settings.pathFor() builds a folder path', String(settings.pathFor('videos')).endsWith('/videos'));
ok('settings.activeCategories is an array', Array.isArray(settings.activeCategories));

/* ------------------------------------------------------------- report ---- */
const passed = checks.filter((c) => c.pass).length;
console.log('Surge store contract audit');
console.log('='.repeat(72));
console.log(`  stores constructed  ui, downloads, theme, settings`);
console.log(`  runtime assertions  ${passed}/${checks.length}`);
console.log('='.repeat(72));
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log('  · ' + p);
  if (STRICT) process.exit(1);
} else {
  console.log('\nevery store constructs and behaves; Pinia ref-unwrapping honoured.');
}
