/**
 * Surge — mockup structural audit
 * ---------------------------------------------------------------------------
 * The mockup is generated from template literals, so a stray tag or an
 * unbalanced `<div>` is easy to introduce and invisible until you open it.
 * This walks the emitted HTML and fails on:
 *
 *   1. unbalanced / mis-nested tags
 *   2. elements whose closing tag does not match
 *   3. CSS classes used in markup but never declared in any stylesheet
 *   4. `<use href="#i-…">` targets missing from the injected sprite
 *   5. frames that would let position:fixed escape (no transformed ancestor)
 *
 *   node tools/verify-mockup.mjs [--strict]
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const STRICT = process.argv.includes('--strict');

const html = readFileSync(resolve(root, 'mockup/surge-mockup.html'), 'utf8');
const css = [
  readFileSync(resolve(root, 'src/styles/themes.css'), 'utf8'),
  readFileSync(resolve(root, 'src/styles/base.css'), 'utf8'),
  readFileSync(resolve(root, 'src/styles/components.css'), 'utf8'),
  html.slice(html.indexOf('<style>'), html.indexOf('</style>')),
].join('\n');

const problems = [];

/* ------------------------------------------------------------ 1. tag pairs -- */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polygon',
  'polyline', 'ellipse', 'stop', 'use',
]);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const stack = [];
let tagCount = 0;

for (const m of html.matchAll(TAG_RE)) {
  const raw = m[0];
  const name = m[1].toLowerCase();
  if (VOID.has(name) || raw.endsWith('/>')) continue;
  tagCount++;
  if (raw.startsWith('</')) {
    const top = stack.pop();
    if (top !== name) {
      const line = html.slice(0, m.index).split('\n').length;
      problems.push(`tag mismatch at line ${line}: expected </${top ?? 'nothing'}>, found </${name}>`);
      // Re-push so one typo does not cascade into hundreds of errors.
      if (top) stack.push(top);
    }
  } else {
    stack.push(name);
  }
}
if (stack.length) problems.push(`${stack.length} unclosed tag(s): ${stack.slice(-8).join(' > ')}`);

/* ------------------------------------------------- 2. declared CSS classes -- */

const declared = new Set();
for (const m of css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) declared.add(m[1]);

const usedClasses = new Map();
for (const m of html.matchAll(/class="([^"]*)"/g)) {
  const line = html.slice(0, m.index).split('\n').length;
  for (const c of m[1].split(/\s+/).filter(Boolean)) {
    if (!usedClasses.has(c)) usedClasses.set(c, line);
  }
}

// Classes that are applied conditionally at runtime, or are state hooks rather
// than styled selectors, are legitimate here.
const ALLOWED_DYNAMIC = new Set(['is-dark']);
const undeclared = [...usedClasses.keys()].filter(
  (c) => !declared.has(c) && !ALLOWED_DYNAMIC.has(c) && !c.startsWith('theme-') && !c.startsWith('mode-'),
);
for (const c of undeclared) {
  problems.push(`class "${c}" used (line ${usedClasses.get(c)}) but never declared in CSS`);
}

/* ------------------------------------------------------- 3. sprite symbols -- */

const symbols = new Set([...html.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]));
const used = new Set([...html.matchAll(/<use href="#i-([a-z0-9-]+)"/g)].map((m) => m[1]));
for (const u of used) {
  if (!symbols.has(u)) problems.push(`icon reference #i-${u} has no matching <symbol> in the sprite`);
}

/* ------------------------------------------- 4. fixed-position containment -- */

const screenRule = css.match(/\.phone__screen\s*\{[^}]*\}/);
if (screenRule) {
  const body = screenRule[0];
  if (!/transform\s*:/.test(body) && !/contain\s*:[^;]*paint/.test(body)) {
    problems.push('.phone__screen lacks transform/contain:paint — position:fixed children will escape the frame');
  }
} else {
  problems.push('.phone__screen rule not found');
}

/* ------------------------------------------------------------- 5. sanity --- */

const frames = (html.match(/class="phone theme-/g) || []).length;
if (frames < 10) problems.push(`only ${frames} phone frames rendered — expected 14`);

const cssSize = css.length;
if (cssSize < 40000) problems.push(`inlined CSS is suspiciously small (${cssSize} bytes)`);

/* ------------------------------------------------------------------ report -- */

console.log('Surge mockup audit');
console.log('='.repeat(72));
console.log(`  bytes            ${(html.length / 1024).toFixed(0)} KB`);
console.log(`  phone frames     ${frames}`);
console.log(`  tags parsed      ${tagCount}`);
console.log(`  classes used     ${usedClasses.size}  (declared in CSS: ${declared.size})`);
console.log(`  sprite symbols   ${symbols.size}  (referenced: ${used.size})`);
console.log('='.repeat(72));

if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of [...new Set(problems)].slice(0, 60)) console.log(`  · ${p}`);
  if (STRICT) process.exit(1);
} else {
  console.log('\nall structural checks passed.');
}
