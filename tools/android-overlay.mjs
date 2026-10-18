/**
 * Surge — Android overlay
 * ---------------------------------------------------------------------------
 * `cap add android` regenerates the platform folder from the Capacitor template.
 * That is fine for CODE now (all Kotlin lives in the surge-native plugin package
 * and is auto-registered), but the template also drops a handful of resources
 * that would OVERRIDE the plugin's merged resources — because app-module
 * resources win over library resources:
 *
 *   · mipmap ic_launcher files  → stock blue Capacitor icon beats ours
 *   · drawable splash files     → stock splash beats ours
 *   · values/styles.xml        → stock purple AppTheme beats ours
 *   · xml/file_paths.xml       → stock paths beat ours
 *
 * This script deletes exactly those conflicting stock files (idempotently) and
 * re-asserts the two app-level Gradle facts the template resets:
 * arm64-only abiFilters and the JDK 21 toolchain.
 *
 * Run it after ANY `cap add android` / `cap sync android`:
 *
 *   node tools/android-overlay.mjs
 *
 * It is wired into `npm run cap:sync` and `npm run cap:add:android` so the
 * normal flow can't forget it.
 */

import { existsSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, chmodSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const APP = join(ROOT, 'android/app/src/main');
const RES = join(APP, 'res');

let removed = 0;
let patched = 0;

/* ------------------------------------------------ 1. delete stock clashes -- */

const CONFLICTS = [
  /^mipmap-[^/]+\/ic_launcher.*$/,
  /^mipmap-[^/]+\/ic_launcher_round.*$/,
  /^drawable[^/]*\/splash.*$/,
  /^values\/styles\.xml$/,
  /^xml\/file_paths\.xml$/,
  /^values\/strings\.xml$/, // template's app_name; plugin supplies the real one
];

if (existsSync(RES)) {
  for (const dir of readdirSync(RES)) {
    const d = join(RES, dir);
    if (!statSync(d).isDirectory()) continue;
    for (const f of readdirSync(d)) {
      const rel = `${dir}/${f}`;
      const ours = existsSync(join(ROOT, 'plugins/surge-native/android/src/main/res', rel));
      if (!ours && CONFLICTS.some((re) => re.test(rel))) {
        rmSync(join(d, f), { force: true });
        removed++;
        console.log(`  removed stock  res/${rel}`);
      }
    }
  }
} else {
  console.log('  (no app res dir — nothing to overlay)');
}

/* ------------------------------------------- 2. re-assert Gradle invariants -- */

const GRADLE = join(ROOT, 'android/app/build.gradle');
if (existsSync(GRADLE)) {
  let g = readFileSync(GRADLE, 'utf8');
  const before = g;

  if (!/abiFilters/.test(g)) {
    g = g.replace(
      /defaultConfig\s*\{/,
      "defaultConfig {\n        // Surge: arm64-only engine binaries (see plugins/surge-native).\n        ndk { abiFilters 'arm64-v8a' }",
    );
  }
  if (!/VERSION_21/.test(g)) {
    g = g.replace(
      /compileOptions\s*\{/,
      'compileOptions {\n        sourceCompatibility JavaVersion.VERSION_21\n        targetCompatibility JavaVersion.VERSION_21',
    );
    if (!/kotlinOptions/.test(g)) {
      g = g.replace(/buildTypes\s*\{/, "kotlinOptions { jvmTarget = '21' }\n\n    buildTypes {");
    }
  }
  if (g !== before) {
    writeFileSync(GRADLE, g, 'utf8');
    patched++;
    console.log('  patched        android/app/build.gradle (abiFilters / JDK 21)');
  }
} else {
  console.log('  (android/app/build.gradle missing — run `cap add android` first)');
}

/* --------------------- 2b. API 36 + AGP baseline --------------------------- */
/**
 * Capacitor 8 is built for API 36. `@capacitor/android`, `@capacitor/browser`
 * and the other plugin modules all declare `compileSdk = 36`, and the androidx
 * libraries they pull in (androidx.browser:1.9.0, androidx.core:1.17.0) publish
 * AAR metadata that REQUIRES every consumer to compile against 36 or later. A
 * consumer left on android-35 dies with:
 *
 *   :app:checkDebugAarMetadata FAILED
 *     Dependency 'androidx.browser:browser:1.9.0' requires libraries and
 *     applications that depend on it to compile against version 36 ...
 *     :app is currently compiled against android-35.
 *
 * So the two facts the platform template owns are pinned here instead of being
 * left to whichever snapshot of android/ happens to be on disk. Both edits are
 * idempotent.
 *
 *   android/variables.gradle  compileSdkVersion / targetSdkVersion -> 36
 *   android/build.gradle      com.android.tools.build:gradle      -> 8.13.0
 *
 * AGP 8.13.0 is what the installed Capacitor 8 CLI template ships and is the
 * line that fully supports compileSdk 36 (8.7 only "recommends" 35 and will
 * keep nagging). The Gradle wrapper copied in step 4 matches it.
 */
{
  const VARIABLES = join(ROOT, 'android/variables.gradle');
  if (existsSync(VARIABLES)) {
    const before = readFileSync(VARIABLES, 'utf8');
    const after = before
      .replace(/(compileSdkVersion\s*=\s*)(\d+)/, (_m, lead) => `${lead}36`)
      .replace(/(targetSdkVersion\s*=\s*)(\d+)/, (_m, lead) => `${lead}36`);
    if (after !== before) {
      writeFileSync(VARIABLES, after, 'utf8');
      patched++;
      console.log('  patched        android/variables.gradle (compileSdk/targetSdk -> 36)');
    }
  }

  const ROOT_GRADLE = join(ROOT, 'android/build.gradle');
  if (existsSync(ROOT_GRADLE)) {
    const before = readFileSync(ROOT_GRADLE, 'utf8');
    const m = /com\.android\.tools\.build:gradle:([\d.]+)/.exec(before);
    const want = [8, 13, 0];
    const have = m ? m[1].split('.').map(Number) : null;
    const older =
      !have ||
      have[0] < want[0] ||
      (have[0] === want[0] && have[1] < want[1]);
    if (older) {
      const after = m
        ? before.replace(m[0], `com.android.tools.build:gradle:${want.join('.')}`)
        : before.replace(
            /dependencies\s*\{/,
            `dependencies {\n        classpath 'com.android.tools.build:gradle:${want.join('.')}'`,
          );
      writeFileSync(ROOT_GRADLE, after, 'utf8');
      patched++;
      console.log(`  patched        android/build.gradle (AGP ${m ? m[1] : 'missing'} -> ${want.join('.')})`);
    }
  }
}

/* ------------------------------------- 3. capacitor.settings.gradle -------- */
/**
 * `cap add android` generates capacitor.settings.gradle (the include list for
 * every plugin module). `cap sync` does NOT - and this repo ships a maintained
 * android/ folder that never went through `cap add`, so without this file
 * Gradle dies on `apply from: 'capacitor.settings.gradle'`.
 *
 * Derive it from package.json exactly the way the CLI would.
 */
const SETTINGS = join(ROOT, 'android/capacitor.settings.gradle');
{
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const lines = [
    '// Generated by tools/android-overlay.mjs - mirrors `cap add android`.',
    '// Do not edit by hand; re-run `bun run android:prep` instead.',
    "include ':capacitor-android'",
    "project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')",
    '',
  ];
  for (const d of deps.sort()) {
    if (d === '@capacitor/core' || d === '@capacitor/cli' || d === '@capacitor/assets') continue;
    if (d.startsWith('@capacitor/')) {
      const short = d.replace('@capacitor/', '');
      const dir = join(ROOT, 'node_modules', d, 'android');
      if (existsSync(dir)) {
        lines.push(`include ':capacitor-${short}'`);
        lines.push(`project(':capacitor-${short}').projectDir = new File('../node_modules/${d}/android')`);
      }
    } else {
      // local file: plugins (surge-native)
      const pj = join(ROOT, 'node_modules', d, 'package.json');
      const direct = join(ROOT, 'plugins', d, 'package.json');
      const manifest = existsSync(pj) ? pj : existsSync(direct) ? direct : null;
      if (!manifest) continue;
      const mp = JSON.parse(readFileSync(manifest, 'utf8'));
      if (!mp.capacitor?.android?.src) continue;
      const rel = mp.capacitor.android.src;
      const abs = resolve(dirname(manifest), rel);
      if (!existsSync(abs)) continue;
      lines.push(`include ':${d}'`);
      lines.push(`project(':${d}').projectDir = new File('${relative(join(ROOT, 'android'), abs).split('\\').join('/')}')`);
    }
  }
  const body = lines.join('\n') + '\n';
  if (!existsSync(SETTINGS) || readFileSync(SETTINGS, 'utf8') !== body) {
    writeFileSync(SETTINGS, body, 'utf8');
    patched++;
    console.log('  generated      android/capacitor.settings.gradle');
  }
}

/* --------------------------------------------- 4. gradle wrapper ------------ */
/**
 * ./gradlew only exists after `cap add android` (or an Android Studio sync).
 * The Capacitor CLI ships the whole platform project as a .tar.gz, so the
 * wrapper has to be READ OUT OF THE TARBALL rather than searched for on disk —
 * the old lookup never looked inside it, always fell through to "no gradle
 * wrapper found", and left whatever stale wrapper android/ already had.
 *
 * That matters for the API 36 work above: AGP 8.13 needs Gradle >= 8.13. The
 * template ships 8.14.3, so we both seed missing wrapper files and upgrade an
 * existing gradle-wrapper.properties whose distribution is too old to run it.
 */
const AGP_GRADLE_MIN = [8, 13];
{
  const TARBALLS = [
    join(ROOT, 'node_modules/@capacitor/cli/assets/android-template.tar.gz'),
    join(ROOT, 'node_modules/@capacitor/android/assets/android-template.tar.gz'),
  ];
  const WRAPPER = ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties'];

  const tarball = TARBALLS.find((t) => existsSync(t));
  const packed = tarball ? readTarGz(tarball, WRAPPER) : new Map();

  let source = packed.size ? 'capacitor template' : null;
  if (!source) {
    // Fallback for a layout where the template is already extracted.
    let templateRoot = findInTree(join(ROOT, 'node_modules/@capacitor/cli'), 'gradlew', 6);
    if (!templateRoot) templateRoot = findInTree(join(ROOT, 'node_modules/@capacitor/android'), 'gradlew', 6);
    if (!templateRoot) templateRoot = findInTree(join(ROOT, 'node_modules/@ionic'), 'gradlew', 7);
    if (templateRoot) {
      for (const w of WRAPPER) {
        const src = join(templateRoot, w);
        if (existsSync(src)) packed.set(w, readFileSync(src));
      }
      if (packed.size) source = templateRoot;
    }
  }

  const PROPS = 'gradle/wrapper/gradle-wrapper.properties';
  const dstProps = join(ROOT, 'android', PROPS);

  if (source) {
    // 1. seed anything that is missing (gradlew shim, jar, properties)
    for (const w of WRAPPER) {
      const dst = join(ROOT, 'android', w);
      if (existsSync(dst)) continue;
      const buf = packed.get(w);
      if (!buf) continue;
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, buf);
      if (w === 'gradlew' || w === 'gradlew.bat') {
        try { chmodSync(dst, 0o755); } catch { /* windows ignores */ }
      }
      removed++; // reuse counter as "files touched"
      console.log(`  copied wrapper android/${w}`);
    }

    // 2. upgrade a distribution too old to run the pinned AGP
    const ref = packed.get(PROPS)?.toString('utf8');
    if (ref && existsSync(dstProps)) {
      const cur = readFileSync(dstProps, 'utf8');
      const curV = gradleVersionIn(cur);
      const refV = gradleVersionIn(ref);
      if (curV && isOlder(curV, AGP_GRADLE_MIN)) {
        writeFileSync(dstProps, ref, 'utf8');
        patched++;
        console.log(`  patched        android/gradle/wrapper (Gradle ${curV.join('.')} -> ${(refV ?? AGP_GRADLE_MIN).join('.')})`);
      }
    }
  } else {
    console.log('  WARNING: no gradle wrapper found in @capacitor/cli assets.');
    console.log('           Open android/ in Android Studio once (it injects the wrapper),');
    console.log('           or run `gradle wrapper --gradle-version 8.14.3`.');
  }
}

/** Minimal tar reader: pulls only the named members out of a .tar.gz. */
function readTarGz(file, wanted) {
  const out = new Map();
  let tar;
  try { tar = gunzipSync(readFileSync(file)); } catch { return out; }
  let at = 0;
  while (at + 512 <= tar.length) {
    const raw = tar.toString('utf8', at, at + 100);
    const nul = raw.indexOf('\0');
    const name = (nul >= 0 ? raw.slice(0, nul) : raw).trim();
    if (!name) break;
    const size = parseInt(tar.toString('utf8', at + 124, at + 136).trim() || '0', 8) || 0;
    const body = at + 512;
    if (wanted.includes(name)) out.set(name, tar.subarray(body, body + size));
    at = body + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** `[8, 14, 3]` from a gradle-wrapper.properties distributionUrl, or null. */
function gradleVersionIn(text) {
  const at = text.indexOf('gradle-');
  if (at < 0) return null;
  const head = text.slice(at + 7).split('-')[0];
  const parts = head.split('.').map((n) => parseInt(n, 10));
  if (parts.length < 2 || !parts.every((n) => Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2] ?? 0];
}

/** a < b for two [major, minor, patch] tuples. */
function isOlder(a, b) {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/** Depth-limited search for a filename; returns its directory or null. */
function findInTree(dir, name, depth) {
  if (depth < 0 || !existsSync(dir)) return null;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === name) return dir;
    if (e.isDirectory()) {
      const hit = findInTree(p, name, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

/* ------------------------------------------------- 5. misc missing files ---- */
{
  const proguard = join(ROOT, 'android/app/proguard-rules.pro');
  if (!existsSync(proguard)) {
    writeFileSync(proguard, '# Surge keeps its own rules in the plugin module.\n-keep class com.surge.downloader.** { *; }\n', 'utf8');
    patched++;
    console.log('  created        android/app/proguard-rules.pro');
  }
}

/* ------------------------------- 5b. app res := plugin res (identity wins) -- */
/**
 * App-module resources beat library resources in the merge. The Capacitor
 * template ships its own blue icon / splash / purple styles, so the only way to
 * guarantee Surge's identity survives ANY regeneration is to also place it at
 * app level. Single source of truth stays the plugin res tree; this copies it
 * over the stock files (idempotent - copying twice changes nothing).
 */
{
  const srcRes = join(ROOT, 'plugins/surge-native/android/src/main/res');
  const dstRes = RES;
  if (existsSync(srcRes)) {
    let copied = 0;
    const walk = (from, to) => {
      mkdirSync(to, { recursive: true });
      for (const e of readdirSync(from, { withFileTypes: true })) {
        const a = join(from, e.name);
        const b = join(to, e.name);
        if (e.isDirectory()) walk(a, b);
        else {
          writeFileSync(b, readFileSync(a));
          copied++;
        }
      }
    };
    walk(srcRes, dstRes);
    patched++;
    console.log(`  synced res     ${copied} file(s) plugin -> android/app/src/main/res`);
  }
}

/* --------------------------- 5c. app/build.gradle must be the maintained one */
/**
 * A stale generated app/build.gradle (left over from an older snapshot, or from
 * a fresh `cap add`) either carries the old top-level chaquopy block - which
 * crashes Gradle with "Could not find method pyc()" - or lacks the arm64/JDK21
 * invariants. Detect both and restore the maintained template.
 */
{
  const tpl = join(ROOT, 'tools/templates/app-build.gradle');
  const cur = GRADLE;
  if (existsSync(tpl) && existsSync(cur)) {
    const g = readFileSync(cur, 'utf8');
    const stale = /chaquopy/.test(g) || !/abiFilters/.test(g) || !/VERSION_21/.test(g) || !/compileSdk 36/.test(g);
    const differ = g !== readFileSync(tpl, 'utf8');
    if (stale && differ) {
      writeFileSync(cur, readFileSync(tpl, 'utf8'), 'utf8');
      patched++;
      console.log('  restored       android/app/build.gradle from tools/templates/');
    }
  }
}

/* ---------------------- 5d. belt 1: MainActivity registers the plugins ----- */
/**
 * `cap add android` writes a stock MainActivity with no registrations. Restore
 * ours (which registers all seven plugins) on every overlay run, so a
 * regenerated platform can never produce "plugin is not implemented" again.
 */
{
  const tpl = join(ROOT, 'tools/templates/MainActivity.kt');
  const dst = join(APP, 'java/com/surge/downloader/MainActivity.kt');
  if (existsSync(tpl)) {
    const want = readFileSync(tpl, 'utf8');
    if (!existsSync(dst) || readFileSync(dst, 'utf8') !== want) {
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, want, 'utf8');
      patched++;
      console.log('  restored       app MainActivity.kt (registers 7 plugins)');
    }
  }
}

/* --------------- 5e. belt 2: merge plugin classpaths into the bridge json --- */
/**
 * The bridge auto-registers whatever is listed in
 * android/app/src/main/assets/capacitor.plugins.json. The CLI writes that file
 * for npm plugins; for a local file: plugin written in Kotlin it may omit our
 * classes, which is exactly the "not implemented" failure. Merge them in,
 * idempotently, preserving everything the CLI wrote.
 */
{
  const CLASSES = [
    'com.surge.downloader.plugins.DownloaderPlugin',
    'com.surge.downloader.plugins.TorrentPlugin',
    'com.surge.downloader.plugins.MediaPlugin',
    'com.surge.downloader.plugins.StoragePlugin',
    'com.surge.downloader.plugins.WidgetPlugin',
    'com.surge.downloader.plugins.NotifierPlugin',
    'com.surge.downloader.plugins.SafeAreaPlugin',
  ];
  const json = join(APP, 'assets/capacitor.plugins.json');
  if (existsSync(dirname(json))) {
    let list = [];
    if (existsSync(json)) {
      try { list = JSON.parse(readFileSync(json, 'utf8')); } catch { list = []; }
    }
    const have = new Set(list.map((e) => e.classpath));
    let added = 0;
    for (const c of CLASSES) {
      if (!have.has(c)) {
        list.push({ pkg: 'surge-native', classpath: c });
        added++;
      }
    }
    if (added) {
      writeFileSync(json, JSON.stringify(list, null, 2), 'utf8');
      patched++;
      console.log(`  merged         ${added} plugin classpath(s) into assets/capacitor.plugins.json`);
    }
  } else {
    console.log('  note: assets/ missing - run `cap sync android` first, then `bun run android:prep`');
  }
}

/* --------------------------------------------------------------- 6. jniLibs -- */

const JNI = join(ROOT, 'plugins/surge-native/android/src/main/jniLibs/arm64-v8a');
const have = existsSync(JNI) && readdirSync(JNI).some((f) => f.endsWith('.so'));
if (!have) {
  console.log(`\n  info: ${relative(ROOT, JNI)}/ is empty - that is fine.`);
  console.log('        All three engines now resolve from Maven/Gradle:');
  console.log('          HTTP     -> core/HttpEngine.kt (OkHttp, segmented)');
  console.log('          torrents -> org.libtorrent4j (arm64 JNI from Maven)');
  console.log('          ffmpeg   -> com.arthenica:ffmpeg-kit-full');
}

console.log(`\noverlay done — ${removed} stock resource(s) removed, ${patched} gradle patch(es).`);
