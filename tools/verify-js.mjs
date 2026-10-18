/**
 * Surge — JS / Vue static audit
 * ---------------------------------------------------------------------------
 * We build offline (no npm registry in this environment), so a real `vite build`
 * is not available as a gate. This is the next best thing: it catches the class
 * of errors a build would catch before any browser is involved —
 *
 *   1. syntax errors in every .js / .mjs file and every SFC <script> block
 *   2. unresolved imports (@/ aliases and relative paths)
 *   3. unbalanced tags inside SFC <template> blocks
 *   4. components referenced in templates but never imported/registered
 *   5. icon names used in templates that do not exist in the sprite
 *
 *   node tools/verify-js.mjs [--strict]
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { ICONS } from './icons.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STRICT = process.argv.includes('--strict');
const tmp = mkdtempSync(join(os.tmpdir(), 'surge-check-'));

const problems = [];
let files = 0;
let sfc = 0;

const walk = (dir, re, out = [], isRoot = true) => {
  for (const e of readdirSync(dir)) {
    // 'android' is only skipped at the repo root (the platform folder); the
    // plugin module legitimately lives at plugins/*/android/.
    const skip = ['node_modules', 'dist', '.git', 'mockup', 'build'];
    if (isRoot) skip.push('android');
    if (skip.includes(e)) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, re, out, false);
    else if (re.test(e)) out.push(p);
  }
  return out;
};

const SRC = walk(join(ROOT, 'src'), /\.(js|mjs|vue)$/)
  .concat(walk(join(ROOT, 'tools'), /\.(js|mjs)$/));

/** Kotlin sources get the nullability/import lint (kotlinc is unavailable here). */
const KTSRC = walk(join(ROOT, 'plugins'), /\.kt$/);

/* ---------------------------------------------------------- 1. syntax ------ */

function syntaxCheck(code, label, isVue) {
  const f = join(tmp, `${label.replace(/[^\w.-]+/g, '_')}${isVue ? '.sfc' : ''}.mjs`);
  writeFileSync(f, code, 'utf8');
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    const msg = (r.stderr || '').split('\n').slice(0, 6).join('\n').replace(new RegExp(f, 'g'), label);
    problems.push(`SYNTAX ${label}\n${msg}`);
  }
}

/* ------------------------------------------------------- 2. imports -------- */

const ALIAS = { '@': join(ROOT, 'src') };

function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(ALIAS['@'], spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return { external: true }; // bare specifier -> node_modules (vue, pinia…)
  for (const cand of [base, `${base}.js`, `${base}.mjs`, `${base}.vue`, join(base, 'index.js')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return { path: cand };
  }
  return { missing: base };
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

/* ------------------------------------------------------- 3. templates ------ */

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'use', 'path', 'circle', 'rect', 'line', 'stop', 'polygon', 'polyline', 'ellipse']);

function checkTemplate(tpl, label) {
  const stack = [];
  const TAG = /<\/?([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  for (const m of tpl.matchAll(TAG)) {
    const raw = m[0];
    const name = m[1];
    if (VOID_TAGS.has(name.toLowerCase()) || raw.endsWith('/>')) continue;
    if (raw.startsWith('</')) {
      const top = stack.pop();
      if (top !== name) problems.push(`TEMPLATE ${label}: </${top ?? '?'}> closed by </${name}>`);
    } else stack.push(name);
  }
  if (stack.length) problems.push(`TEMPLATE ${label}: unclosed <${stack.join('>, <')}>`);
}

/* ------------------------------------------------------------- run --------- */

for (const file of SRC) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  files++;

  if (file.endsWith('.vue')) {
    sfc++;
    const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(text);
    if (script) syntaxCheck(script[1], rel, true);
    const tpl = /<template>([\s\S]*?)<\/template>\s*(?:<style|<\/?script[^>]*>|$)/.exec(text) ||
      /<template>([\s\S]*)<\/template>/.exec(text);
    if (tpl) checkTemplate(tpl[1], rel);
    // component usage vs imports
    const imported = new Set([...text.matchAll(/import\s+([\w$]+)\s+from/g)].map((m) => m[1]));
    const used = new Set([...(tpl?.[1] ?? '').matchAll(/<([A-Z][\w]*)/g)].map((m) => m[1]));
    for (const u of used) {
      if (!imported.has(u) && !['RouterView', 'RouterLink', 'KeepAlive', 'Transition', 'Teleport', 'Suspense'].includes(u)) {
        problems.push(`COMPONENT ${rel}: <${u}> used but not imported`);
      }
    }
    var scan = script?.[1] ?? '';
  } else {
    syntaxCheck(text, rel, false);
    var scan = text;
  }

  // icon existence
  for (const m of scan.matchAll(/(?:name=|Icon name=|:name=)"?([a-z][a-z0-9-]+)"?/g)) {
    // only flag ones that are clearly icon props
    if (!/icon/i.test(m.input.slice(Math.max(0, m.index - 40), m.index))) continue;
    if (!ICONS[m[1]]) problems.push(`ICON ${rel}: "${m[1]}" is not in the sprite`);
  }
  for (const m of text.matchAll(/i\(\s*'([a-z][a-z0-9-]+)'/g)) {
    if (!ICONS[m[1]]) problems.push(`ICON ${rel}: i('${m[1]}') is not in the sprite`);
  }
  // Dynamic bindings like :name="tab.icon" resolve from data tables; check the
  // table values too, or a renamed icon silently renders nothing.
  for (const m of scan.matchAll(/\bicon:\s*'([a-z][a-z0-9-]+)'/g)) {
    if (!ICONS[m[1]]) problems.push(`ICON ${rel}: icon: '${m[1]}' is not in the sprite`);
  }

  // imports
  for (const re of [IMPORT_RE, SIDE_EFFECT_RE]) {
    for (const m of scan.matchAll(re)) {
      const r = resolveImport(m[1], file);
      if (r.missing) problems.push(`IMPORT ${rel}: cannot resolve "${m[1]}"`);
    }
  }
}

/* ------------------------------------------------- 6. WebView compat ------- */
/**
 * APIs that are newer than the oldest System WebView we must survive (Chrome
 * 70-era devices still get security updates and still run this app). A single
 * unsupported call in the boot path is a black screen, not a degraded feature,
 * so these are hard errors rather than lint noise.
 */
const FORBIDDEN = [
  [/\.at\(/g, 'Array.prototype.at (Chrome 92+)'],
  [/replaceAll\(/g, 'String.replaceAll (Chrome 85+)'],
  [/structuredClone\(/g, 'structuredClone (Chrome 98+)'],
  [/findLast\(|findLastIndex\(/g, 'Array.findLast (Chrome 97+)'],
  [/toSorted\(|toReversed\(|toSpliced\(/g, 'copy-within methods (Chrome 110+)'],
  [/Object\.hasOwn\(/g, 'Object.hasOwn (Chrome 93+)'],
  [/Array\.fromAsync\(/g, 'Array.fromAsync (Chrome 121+)'],
];
const FORBIDDEN_REAL = FORBIDDEN.slice(0, 7);

for (const file of SRC) {
  if (!file.endsWith('.js') && !file.endsWith('.vue')) continue;
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  for (const [re, why] of FORBIDDEN_REAL) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').length;
      problems.push(`COMPAT ${rel}:${line}: ${why}`);
    }
  }
}

// color-mix / backdrop-filter must always ship a preceding fallback declaration.
for (const file of SRC) {
  if (!file.endsWith('.css')) continue;
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (!/color-mix\(/.test(line)) return;
    const prop = /^\s*([a-z-]+):/.exec(line)?.[1];
    const prev = lines.slice(0, idx).reverse().find((l) => l.trim() && !l.trim().startsWith('/*'));
    if (!prop || !prev?.includes(`${prop}:`) || prev.includes('color-mix(')) {
      problems.push(`COMPAT ${rel}:${idx + 1}: color-mix on '${prop}' has no preceding fallback`);
    }
  });
  lines.forEach((line, idx) => {
    if (!/backdrop-filter:/.test(line) || /-webkit-/.test(line)) return;
    const prev = lines[idx - 1] ?? '';
    if (!prev.includes('-webkit-backdrop-filter')) {
      problems.push(`COMPAT ${rel}:${idx + 1}: backdrop-filter without -webkit- prefix`);
    }
  });
}

/* ------------------------------------- 7. Kotlin nullable-accessor lint ---- */
/**
 * Capacitor's PluginCall.getInt/getBoolean/getLong are @Nullable, so a bare use
 * is a Kotlin compile error ("inferred Boolean? but Boolean was expected").
 * We cannot run kotlinc here, so the two shapes that actually bite are linted:
 * a bare `= call.getInt(...)` assignment, and a bare call/getInt(...) argument.
 */
for (const file of KTSRC) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, idx) => {
    const bare = /=\s*call\.(getInt|getBoolean|getLong|getFloat)\([^)]*\)\s*(?:$|\/\/)/.test(line);
    const arg = /[,()]\s*call\.(getInt|getBoolean|getLong|getFloat)\([^)]*\)(?=[,)])/.test(line) && !/\?\?/.test(line);
    if (bare || arg) {
      problems.push(`KOTLIN-NULLABILITY ${rel}:${idx + 1}: nullable PluginCall accessor used without elvis`);
    }
  });
}
for (const file of KTSRC) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  if (/getSystemService\(Context\./.test(text) && !/import android\.content\.Context/.test(text)) {
    problems.push(`KOTLIN-IMPORT ${rel}: uses Context.* without importing android.content.Context`);
  }
}

/* ------------------------- 8. library-must-not-reference-app lint --------- */
/**
 * Android dependency direction is app -> library. A library module referencing
 * the app's MainActivity compiles nowhere; the launcher activity must be
 * resolved via PackageManager. Catch it here since kotlinc is unavailable.
 */
for (const file of KTSRC) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  if (/import com\.surge\.downloader\.MainActivity|MainActivity::class/.test(text)) {
    problems.push(`KOTLIN-MODULE ${rel}: library module references app MainActivity; use packageManager.getLaunchIntentForPackage()`);
  }
}

/* ------------------- 9. native-bridge contract (regression guards) --------- */
/**
 * Three WebView-side invariants that no compiler checks and that a refactor can
 * break silently, so they are pinned here:
 *   · the plugin handle stays in scope for the 1 Hz poll callback
 *   · the poll's `sniffed` payload is republished as an event (Browser tab)
 *   · every plugin the bridge calls is actually declared in loadPlugins()
 */
{
  const bridgeFile = resolve(ROOT, 'src/lib/native.js');
  if (existsSync(bridgeFile)) {
    const text = readFileSync(bridgeFile, 'utf8');
    const rel = relative(ROOT, bridgeFile);

    if (/try\s*\{\s*\n\s*const p = await loadPlugins\(\)/.test(text)) {
      problems.push(`BRIDGE ${rel}: 'const p' is scoped to the try block but the poll loop uses it`);
    }
    if (!/if \(p\) setInterval\(/.test(text)) {
      problems.push(`BRIDGE ${rel}: the native poll loop is not guarded by the plugin handle`);
    }
    if (!/r\.sniffed/.test(text) || !/emit\('sniffed'/.test(text)) {
      problems.push(`BRIDGE ${rel}: poll 'sniffed' payload is never surfaced as an event`);
    }

    const used = new Set([...text.matchAll(/\bp\.([A-Z][A-Za-z]+)\./g)].map((m) => m[1]));
    for (const name of used) {
      if (!new RegExp(`(?:^|[\\s{,])${name}\\s*:`).test(text)) {
        problems.push(`BRIDGE ${rel}: p.${name} is called but '${name}' is not declared in loadPlugins()`);
      }
    }
  }
}

/* -------------------------------- 11. bridge + pinia contracts ------------ */
/**
 * Two runtime contracts no compiler checks, and both have already shipped a
 * crash that surfaced to users as a generic "Something went wrong" toast.
 *
 *  1. Every `bridge.x()` a view calls must exist on the bridge object. A typo
 *     is a TypeError on the first click, not a build error.
 *
 *  2. Pinia setup-stores UNWRAP refs, so `store.selection` is the Set itself.
 *     Writing `store.selection.value` yields undefined — `[...undefined]` and
 *     `.has()` then throw during render.
 */
{
  const bridgeFile = resolve(ROOT, 'src/lib/native.js');
  if (existsSync(bridgeFile)) {
    const text = readFileSync(bridgeFile, 'utf8');
    const start = text.indexOf('export const bridge = {');
    const body = start < 0 ? '' : text.slice(start);
    const methods = new Set();
    for (const line of body.split('\n')) {
      const t = line.trim();
      const async = t.startsWith('async ') ? t.slice(6) : t;
      const paren = async.indexOf('(');
      if (paren > 0 && (t.startsWith('async ') || t.includes('('))) {
        const name = async.slice(0, paren).trim();
        if (name && name !== 'export' && !name.includes(' ')) methods.add(name);
      }
    }
    for (const file of SRC) {
      const rel = relative(ROOT, file);
      // Only app code: tools/ contains these very needles.
      if (!rel.startsWith('src/') || rel === 'src/lib/native.js') continue;
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        let idx = 0;
        while ((idx = line.indexOf('bridge.', idx)) >= 0) {
          idx += 7;
          let name = '';
          while (idx < line.length && /[A-Za-z0-9_$]/.test(line[idx])) name += line[idx++];
          if (name && !methods.has(name)) {
            problems.push(`BRIDGE ${rel}: bridge.${name}() is not implemented in lib/native.js`);
          }
        }
      }
    }
  }

  const storesDir = join(ROOT, 'src/stores');
  if (existsSync(storesDir)) {
    /**
     * Collect, per store: the `defineStore` id, the hook that creates it, and
     * the names it returns that are backed by ref()/computed() — those are the
     * ones Pinia unwraps on the store instance.
     */
    const propsByStore = new Map();
    const hookToStore = new Map();
    for (const f of readdirSync(storesDir)) {
      if (!f.endsWith('.js')) continue;
      const text = readFileSync(join(storesDir, f), 'utf8');
      const refs = new Set();
      for (const line of text.split('\n')) {
        const t = line.trim();
        for (const kw of ['const ', 'let ']) {
          if (!t.startsWith(kw)) continue;
          const rest = t.slice(kw.length);
          const eq = rest.indexOf(' = ');
          if (eq < 0) continue;
          const rhs = rest.slice(eq + 3);
          if (rhs.startsWith('ref(') || rhs.startsWith('computed(')) refs.add(rest.slice(0, eq).trim());
        }
      }
      const ret = text.lastIndexOf('return {');
      if (ret < 0) continue;
      const props = new Set();
      for (const line of text.slice(ret).split('\n')) {
        let t = line.trim();
        if (t.endsWith(',')) t = t.slice(0, -1);
        if (!t || t === 'return {' || t === '};') continue;
        if (t.includes(':') || t.includes('(') || t.includes(' ') || t.includes('{') || t.includes('}')) continue;
        if (refs.has(t)) props.add(t);
      }
      // `export const useUiStore = defineStore('ui', () => {`
      const cAt = text.indexOf('export const ');
      const eqAt = cAt < 0 ? -1 : text.indexOf(' =', cAt);
      const hook = cAt < 0 || eqAt < 0 ? '' : text.slice(cAt + 13, eqAt).trim();
      const dAt = text.indexOf('defineStore(');
      const q1 = dAt < 0 ? -1 : text.indexOf(String.fromCharCode(39), dAt);
      const q2 = q1 < 0 ? -1 : text.indexOf(String.fromCharCode(39), q1 + 1);
      const id = q2 > q1 ? text.slice(q1 + 1, q2) : hook;
      if (hook) hookToStore.set(hook, id);
      propsByStore.set(id, props);
    }

    const IDENT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$';
    /**
     * Index of `needle` where it is not merely a prefix of a longer name.
     * `ui.selection.value.has(…)` matches (`.` is not an identifier char), while
     * `state.items.values()` does not (trailing `s`).
     */
    const exact = (text, needle) => {
      let i = text.indexOf(needle);
      while (i >= 0) {
        const after = text[i + needle.length];
        if (after === undefined || !IDENT_CHARS.includes(after)) return i;
        i = text.indexOf(needle, i + 1);
      }
      return -1;
    };

    for (const file of SRC) {
      const rel = relative(ROOT, file);
      if (!rel.startsWith('src/') || rel.startsWith('src/stores/')) continue;
      const text = readFileSync(file, 'utf8');
      const bindings = new Map(); // local var -> store id
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('const ')) continue;
        const eq = t.indexOf(' = ');
        if (eq < 0) continue;
        const rhs = t.slice(eq + 3).trim();
        const paren = rhs.indexOf('(');
        const hook = paren > 0 ? rhs.slice(0, paren) : '';
        if (hookToStore.has(hook)) bindings.set(t.slice(6, eq).trim(), hookToStore.get(hook));
      }
      for (const [name, id] of bindings) {
        for (const prop of propsByStore.get(id) ?? []) {
          const needle = `${name}.${prop}.value`;
          if (exact(text, needle) >= 0) {
            problems.push(`PINIA ${rel}: '${needle}' — setup-store refs are unwrapped (stores/${id}.js); drop the .value`);
          }
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- report --- */

console.log('Surge source audit');
console.log('='.repeat(72));
console.log(`  files scanned : ${files} (${sfc} single-file components) + ${KTSRC.length} kotlin`);
console.log('='.repeat(72));
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of [...new Set(problems)]) console.log('  · ' + p);
  if (STRICT) process.exit(1);
} else {
  console.log('\nno syntax, import, template, component or icon problems.');
}
