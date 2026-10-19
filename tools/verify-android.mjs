/**
 * Surge — Android toolchain audit
 * ---------------------------------------------------------------------------
 * `./gradlew assembleDebug` is the one gate this environment cannot run (no
 * Android SDK), so the version facts it fails on are pinned statically here.
 * The one that actually bit us:
 *
 *   :app:checkDebugAarMetadata FAILED
 *     Dependency 'androidx.browser:browser:1.9.0' requires libraries and
 *     applications that depend on it to compile against version 36 ...
 *     :app is currently compiled against android-35.
 *
 * Capacitor 8 is an API 36 stack: every plugin module declares
 * `compileSdk = 36`, and androidx.browser 1.9 / androidx.core 1.17 publish AAR
 * metadata that hard-requires consumers to be on 36+. So this asserts:
 *
 *   1. the maintained app + plugin modules compile/target against 36
 *   2. the overlay normalises the GENERATED android/ project (variables.gradle
 *      + the AGP version) instead of trusting a stale on-disk snapshot
 *   3. no doc/UI string still advertises the old 35 baseline
 *   4. our compileSdk is at least whatever Capacitor declares (catches a
 *      Capacitor bump that outruns us)
 *
 * Deliberately written without regex escapes so it stays readable.
 *
 *   node tools/verify-android.mjs [--strict]
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STRICT = process.argv.includes('--strict');

/** The API level the whole stack must agree on. */
const MIN_API = 36;

/** Minimum Android Gradle Plugin that fully supports compileSdk 36. */
const MIN_AGP = [8, 13, 0];

const problems = [];
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Leading integer in `s`, or null. No regex, by design. */
const leadingInt = (s) => {
  let out = '';
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (out) break;
  }
  return out ? Number(out) : null;
};

/** Trailing integer in `s` (e.g. `... : 36`), or null. */
const trailingInt = (s) => {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') out = ch + out;
    else if (out) break;
  }
  return out ? Number(out) : null;
};

/**
 * Groovy DSL value for a key: `compileSdk 36`, `targetSdk 36`,
 * `compileSdkVersion = 36`. The longer key is skipped when the shorter one is
 * asked for, so `compileSdk` never picks up the `compileSdkVersion` line.
 */
const sdkValue = (text, key) => {
  for (const line of text.split('\n')) {
    const at = line.indexOf(key);
    if (at < 0) continue;
    if (key === 'compileSdk' && line.slice(at).startsWith('compileSdkVersion')) continue;
    if (key === 'targetSdk' && line.slice(at).startsWith('targetSdkVersion')) continue;
    const v = leadingInt(line.slice(at + key.length).replace('=', ''));
    if (v != null) return v;
  }
  return null;
};

/* --------------------------------- 1. the modules we maintain ------------- */

const MODULES = [
  'tools/templates/app-build.gradle',
  'plugins/surge-native/android/build.gradle',
];

let assertions = 0;
for (const rel of MODULES) {
  if (!existsSync(resolve(ROOT, rel))) {
    problems.push(`MISSING ${rel}`);
    continue;
  }
  const g = read(rel);
  for (const key of ['compileSdk', 'targetSdk']) {
    assertions++;
    const v = sdkValue(g, key);
    if (v == null) problems.push(`${rel}: no ${key} found`);
    else if (v < MIN_API) problems.push(`${rel}: ${key} is ${v}, needs >= ${MIN_API} (androidx AAR metadata)`);
  }
}

/* --------------------- 2. the overlay must fix the generated tree --------- */

const OVERLAY = 'tools/android-overlay.mjs';
if (!existsSync(resolve(ROOT, OVERLAY))) {
  problems.push(`MISSING ${OVERLAY}`);
} else {
  const o = read(OVERLAY);

  // variables.gradle: the generated file the plugin modules read their SDK from.
  if (!o.includes('variables.gradle') || !o.includes('compileSdkVersion') || !o.includes('targetSdkVersion')) {
    problems.push(`${OVERLAY}: does not normalise variables.gradle compileSdkVersion/targetSdkVersion`);
  } else if (!o.includes('${lead}36')) {
    problems.push(`${OVERLAY}: variables.gradle normalisation does not target ${MIN_API}`);
  }

  // AGP: 8.7 only "recommends" 35; 8.13 is the first line that fully supports 36.
  if (!o.includes('com.android.tools.build:gradle')) {
    problems.push(`${OVERLAY}: does not pin the Android Gradle Plugin version`);
  } else {
    const at = o.indexOf('const want = [');
    const seg = at < 0 ? '' : o.slice(at + 14, o.indexOf(']', at));
    const agp = seg ? seg.split(',').map((n) => Number(n.trim())) : null;
    if (!agp || !Number.isFinite(agp[0])) {
      problems.push(`${OVERLAY}: could not read the AGP version pin`);
    } else if (agp[0] < MIN_AGP[0] || (agp[0] === MIN_AGP[0] && agp[1] < MIN_AGP[1])) {
      problems.push(`${OVERLAY}: AGP pin ${agp.join('.')} predates full compileSdk 36 support (needs ${MIN_AGP.slice(0, 2).join('.')}+)`);
    }
  }

  // The app module is restored from the template only when it looks stale; that
  // predicate has to notice an out-of-date compileSdk or the fix never lands in
  // an android/ folder that already exists on disk.
  if (!o.includes('compileSdk 36')) {
    problems.push(`${OVERLAY}: the app/build.gradle staleness test ignores compileSdk, so a stale generated file is kept`);
  }

  // AGP 8.13 needs Gradle >= 8.13, and the wrapper only exists inside the CLI's
  // .tar.gz — so the overlay must read it from there AND be able to upgrade a
  // stale distribution, or the AGP bump turns an AAR error into a Gradle error.
  if (!o.includes('android-template.tar.gz')) {
    problems.push(`${OVERLAY}: does not read the gradle wrapper out of the Capacitor template tarball`);
  }
  if (!o.includes('const AGP_GRADLE_MIN = [8, 13]')) {
    problems.push(`${OVERLAY}: does not upgrade a Gradle wrapper that is too old for the pinned AGP`);
  }
}

/* --------------- 2c. every applied plugin has a classpath ----------------- */
/**
 * The failure this guards: `plugins/surge-native/android/build.gradle` (and the
 * app template) do `apply plugin: 'kotlin-android'` / `'com.chaquo.python'`,
 * neither of which is on the Capacitor template's buildscript classpath. A
 * regenerated android/ project then dies with
 *
 *   A problem occurred evaluating project ':surge-native'.
 *   > Plugin with id 'kotlin-android' not found
 *
 * and, because script evaluation aborts before the `android { }` block runs, a
 * misleading follow-up:
 *
 *   project ':surge-native' does not specify `compileSdk` in build.gradle
 *
 * So: every plugin our modules apply must be backed by a classpath the overlay
 * guarantees.
 */
{
  const CLASS_FOR = {
    'kotlin-android': 'org.jetbrains.kotlin:kotlin-gradle-plugin',
    'com.chaquo.python': 'com.chaquo.python:gradle',
    'com.android.application': 'com.android.tools.build:gradle',
    'com.android.library': 'com.android.tools.build:gradle',
  };

  const applied = new Map(); // plugin id -> module files that apply it
  for (const rel of MODULES) {
    if (!existsSync(resolve(ROOT, rel))) continue;
    for (const line of read(rel).split('\n')) {
      // Two shapes, both meaningful:
      //   apply plugin: 'kotlin-android'
      //   surgeApplyPlugin('kotlin-android', 'org.jetbrains…')   (guarded apply)
      const guardAt = line.indexOf('surgeApplyPlugin(');
      const applyAt = line.indexOf('apply plugin:');
      const marker =
        guardAt >= 0
          ? guardAt + 'surgeApplyPlugin('.length
          : applyAt >= 0
            ? applyAt + 'apply plugin:'.length
            : -1;
      if (marker < 0) continue;
      const open = line.indexOf(String.fromCharCode(39), marker);
      const close = open < 0 ? -1 : line.indexOf(String.fromCharCode(39), open + 1);
      if (close > open) {
        const id = line.slice(open + 1, close);
        if (!applied.has(id)) applied.set(id, []);
        if (!applied.get(id).includes(rel)) applied.get(id).push(rel);
      }
    }
  }

  const overlaySrc = existsSync(resolve(ROOT, OVERLAY)) ? read(OVERLAY) : '';
  for (const [id, mods] of applied) {
    const coord = CLASS_FOR[id];
    if (!coord) {
      problems.push(`${OVERLAY}: plugin '${id}' is applied by a module but this audit does not know its classpath`);
      continue;
    }
    if (!overlaySrc.includes(coord)) {
      problems.push(`plugin '${id}' is applied but '${coord}' is never declared — "Plugin with id '${id}' not found"`);
    }
  }

  // Chaquopy's own documentation: "The Chaquopy plugin can only be used in one
  // module per app ... If you use it in multiple modules, the build may fail."
  // Applying it in both :app and :surge-native also produced conflicting
  // versions (3.11 vs 3.8) and an invalid `pyc {}` call.
  const chaquopy = applied.get('com.chaquo.python') ?? [];
  if (chaquopy.length > 1) {
    problems.push(
      `com.chaquo.python is applied in ${chaquopy.length} modules (${chaquopy.join(', ')}) — Chaquopy allows exactly one module per app`,
    );
  }
}

/* --------------------------- 3. no stale 35 claims ------------------------ */

const CLAIM_FILES = ['README.md', 'src/views/SettingsView.vue', 'mockup/build-mockup.mjs'];
const STALE = ['compileSdk 35', 'targetSdk 35', 'compileSdkVersion = 35', 'targetSdkVersion = 35', 'Android SDK | 35'];
for (const rel of CLAIM_FILES) {
  if (!existsSync(resolve(ROOT, rel))) continue;
  for (const line of read(rel).split('\n')) {
    if (STALE.some((s) => line.includes(s))) problems.push(`stale baseline -> ${rel}: ${line.trim()}`);
  }
}

/* -------------- 4. stay ahead of Capacitor's own declared SDK ------------- */

const CAP = 'node_modules/@capacitor/android/capacitor/build.gradle';
let capApi = null;
if (existsSync(resolve(ROOT, CAP))) {
  const line = read(CAP).split('\n').find((l) => l.includes('compileSdk') && l.includes(':'));
  capApi = line ? trailingInt(line) : null;
  if (capApi != null) {
    const ours = sdkValue(read(MODULES[0]), 'compileSdk');
    if (ours != null && ours < capApi) {
      problems.push(`Capacitor declares compileSdk ${capApi}, we build with ${ours} — bump the modules and the overlay`);
    }
  }
}

/* ------------------- 5. gradle is never invoked unprepared ---------------- */
/**
 * `cap sync android` does not create the wrapper, so a script that shells out to
 * ./gradlew on its own is one bare sync away from
 *     bash: ./gradlew: No such file or directory
 * Every gradle-invoking script must reconcile first.
 */
{
  let pkg = { scripts: {} };
  try { pkg = JSON.parse(read('package.json')); } catch { /* reported below */ }
  const script = (k) => pkg.scripts?.[k] ?? '';
  for (const key of ['android:build', 'android:bundle']) {
    if (!script(key).includes('android-overlay.mjs')) {
      problems.push(`package.json: "${key}" runs gradle without the overlay first — no gradlew means "No such file or directory"`);
    }
  }
  if (!script('android:run').includes('android-overlay.mjs')) {
    problems.push('package.json: "android:run" does not run the overlay before `cap run`');
  }
  // `npm install` is the one command everyone runs after pulling; without a
  // postinstall hook the generated android/ project never gets reconciled and
  // the build fails on a missing plugin classpath.
  if (!script('postinstall').includes('postinstall.mjs')) {
    problems.push('package.json: no "postinstall" hook — a bare `npm install` leaves android/build.gradle without the Kotlin/Chaquopy classpaths');
  }
}

/* --------------------- 6. android/ must not be a gitlink ------------------ */
/**
 * It was tracked as gitlink mode 160000 with no .gitmodules. Consequences: a
 * clone materialises an EMPTY android/ folder (so `cap add android` refuses with
 * "platform already exists"), and nothing under it can ever be committed — which
 * is why `android/gradlew` could never ship.
 */
{
  const r = spawnSync('git', ['ls-files', '-s', 'android'], { cwd: ROOT, encoding: 'utf8' });
  if ((r.stdout ?? '').trim().startsWith('160000')) {
    problems.push(
      'android/ is tracked as a gitlink (160000) with no .gitmodules — clones get an empty folder that blocks `cap add`; run `git rm --cached android`',
    );
  }
}

/* --------------- 7. on-machine reconciliation (only if android/ exists) --- */
/**
 * CI has no android/ folder; a developer machine does. When it is present, audit
 * the GENERATED project as well — this is the "why does it still fail?" check.
 * It names the exact missing piece and the one command that repairs it.
 */
{
  const APP_GRADLE = resolve(ROOT, 'android/app/build.gradle');
  if (existsSync(APP_GRADLE)) {
    const rootGradle = resolve(ROOT, 'android/build.gradle');
    const rootText = existsSync(rootGradle) ? readFileSync(rootGradle, 'utf8') : '';
    for (const coord of [
      'com.android.tools.build:gradle',
      'org.jetbrains.kotlin:kotlin-gradle-plugin',
      'com.chaquo.python:gradle',
    ]) {
      if (!rootText.includes(coord)) {
        problems.push(`android/build.gradle is missing ${coord} — run: npm run android:prep`);
      }
    }

    const vars = resolve(ROOT, 'android/variables.gradle');
    if (existsSync(vars) && !readFileSync(vars, 'utf8').includes('compileSdkVersion = 36')) {
      problems.push('android/variables.gradle is not on compileSdk 36 — run: npm run android:prep');
    }
    if (!readFileSync(APP_GRADLE, 'utf8').includes('compileSdk 36')) {
      problems.push('android/app/build.gradle is not on compileSdk 36 — run: npm run android:prep');
    }

    const settings = resolve(ROOT, 'android/capacitor.settings.gradle');
    if (!existsSync(settings)) {
      problems.push('android/capacitor.settings.gradle is missing — run: npm run android:prep');
    } else {
      const s = readFileSync(settings, 'utf8');
      const line = s.split('\n').find((l) => l.includes("project(':surge-native')")) ?? '';
      if (!line.includes('plugins/surge-native')) {
        problems.push(
          `:surge-native is wired to a node_modules copy (${line.trim() || 'missing'}) — run: npm run android:prep so Gradle builds the tracked source`,
        );
      }
    }

    for (const w of ['gradlew', 'gradle/wrapper/gradle-wrapper.properties']) {
      if (!existsSync(resolve(ROOT, 'android', w))) {
        problems.push(`android/${w} is missing — run: npm run android:prep (it unpacks the wrapper from the Capacitor CLI template)`);
      }
    }
  }
}

/* ------------------------------------------------------------- report ----- */

console.log('Surge Android toolchain audit');
console.log('='.repeat(72));
console.log(`  modules checked  ${MODULES.length}  (target API ${MIN_API})`);
console.log(`  sdk assertions   ${assertions}`);
console.log(`  capacitor sdk    ${capApi ?? 'n/a (node_modules not installed)'}`);
console.log('='.repeat(72));
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of [...new Set(problems)]) console.log('  · ' + p);
  if (STRICT) process.exit(1);
} else {
  console.log('\ncompileSdk/targetSdk, the overlay normalisation and the AGP pin all agree.');
}
