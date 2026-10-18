/**
 * Surge — CSS token audit
 * ---------------------------------------------------------------------------
 * Every `var(--s-…)` referenced anywhere in the stylesheets or the generated
 * mockup must be defined in the generated themes.css. A typo in a token name is
 * otherwise silent: the property just falls back to `initial` and the UI quietly
 * breaks on one screen. This catches it at build time.
 *
 *   node tools/verify-css.mjs [--strict]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const STRICT = process.argv.includes('--strict');

const collectFiles = (dir, exts, out = []) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'android'].includes(entry)) continue;
      collectFiles(p, exts, out);
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
};

const defined = new Set();
const used = new Map(); // token -> [file:line]

const DEFINED_RE = /(--s-[a-z0-9-]+)\s*:/g;
const USED_RE = /var\(\s*(--s-[a-z0-9-]+)/g;

const scan = (path, mode) => {
  const text = readFileSync(path, 'utf8');
  const rel = relative(root, path);
  text.split('\n').forEach((line, idx) => {
    if (mode === 'define') {
      for (const m of line.matchAll(DEFINED_RE)) defined.add(m[1]);
    }
    for (const m of line.matchAll(USED_RE)) {
      const key = `${rel}:${idx + 1}`;
      if (!used.has(m[1])) used.set(m[1], []);
      used.get(m[1]).push(key);
    }
  });
};

// themes.css is the definition source.
const themesCss = resolve(root, 'src/styles/themes.css');
scan(themesCss, 'define');

// Everything else is a consumer (and may also define local vars).
const files = [
  ...collectFiles(resolve(root, 'src'), ['.css', '.vue', '.js']),
  ...collectFiles(resolve(root, 'mockup'), ['.html', '.mjs']),
];
for (const f of files) {
  if (f === themesCss) continue;
  scan(f, 'use');
  // Vue SFCs may declare their own scoped tokens.
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(DEFINED_RE)) defined.add(m[1]);
}

const missing = [...used.keys()].filter((t) => !defined.has(t)).sort();

console.log(`tokens defined : ${defined.size}`);
console.log(`tokens used    : ${used.size}`);
console.log(`files scanned  : ${files.length}`);

if (missing.length) {
  console.log(`\nUNDEFINED TOKENS (${missing.length}):`);
  for (const t of missing) {
    console.log(`  ${t}`);
    for (const loc of used.get(t).slice(0, 4)) console.log(`      ${loc}`);
  }
  if (STRICT) process.exit(1);
} else {
  console.log('\nno undefined --s-* tokens.');
}

// Report tokens defined but never used — dead weight in the generated CSS.
const unused = [...defined].filter((t) => !used.has(t) && !t.startsWith('--s-android-')).sort();
if (unused.length) {
  console.log(`\nunused tokens (${unused.length}) — informational only:`);
  console.log('  ' + unused.slice(0, 40).join(', ') + (unused.length > 40 ? ' …' : ''));
}
