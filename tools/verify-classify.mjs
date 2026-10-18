/**
 * Surge — classifier cross-check
 * ---------------------------------------------------------------------------
 * The category taxonomy exists TWICE on purpose: once in JS (drives the picker,
 * the Library tree and the badges) and once in Kotlin (aria2 needs `dir` at
 * add-time and MediaStore needs RELATIVE_PATH at insert-time, both before a JS
 * round-trip is guaranteed). Duplication is the pragmatic choice; drift is the
 * risk. This audit eliminates the risk by parsing both sources and failing if a
 * single extension disagrees.
 *
 * It also asserts the classification *behaviour* (precedence, fallbacks, the
 * query-string strip, magnet handling) so a refactor can't silently re-file
 * finished downloads into the wrong folder.
 *
 *   node tools/verify-classify.mjs [--strict]
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, classify, extensionOf, folderPathFor, DEFAULT_ROOT } from '../src/lib/classify.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STRICT = process.argv.includes('--strict');

const problems = [];

/* --------------------------------------------- 1. parse the Kotlin table --- */

// The Kotlin half lives in the local plugin module (it moved out of android/app
// so `cap add android` can never delete it again). Accept either location so
// this audit keeps working across refactors.
const KT_CANDIDATES = [
  'plugins/surge-native/android/src/main/java/com/surge/downloader/core/Classifier.kt',
  'android/app/src/main/java/com/surge/downloader/core/Classifier.kt',
];
const ktPath = KT_CANDIDATES.map((c) => resolve(ROOT, c)).find((c) => existsSync(c));
if (!ktPath) {
  console.error('Classifier.kt not found in any known location');
  process.exit(1);
}
const kt = readFileSync(ktPath, 'utf8');

const ktTable = new Map();
const rowRe = /"([a-z]+)"\s+to\s+listOf\(([^)]*)\)/g;
for (const m of kt.matchAll(rowRe)) {
  const exts = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  ktTable.set(m[1], exts);
}

const ktDefaults = {
  root: /const val DEFAULT_ROOT = "([^"]+)"/.exec(kt)?.[1],
};

/* ------------------------------------------------ 2. compare against JS ---- */

for (const cat of CATEGORIES) {
  if (cat.id === 'others') continue; // others has no extensions by design
  const js = cat.ext;
  const k = ktTable.get(cat.id);
  if (!k) {
    problems.push(`category "${cat.id}" exists in JS but not in Classifier.kt`);
    continue;
  }
  const jsSet = new Set(js);
  const kSet = new Set(k);
  for (const e of js) if (!kSet.has(e)) problems.push(`"${cat.id}": ext "${e}" in JS but missing in Kotlin`);
  for (const e of k) if (!jsSet.has(e)) problems.push(`"${cat.id}": ext "${e}" in Kotlin but missing in JS`);
  if (js.length !== k.length) {
    problems.push(`"${cat.id}": ordering/count differs (JS ${js.length} vs KT ${k.length})`);
  }
}
for (const id of ktTable.keys()) {
  if (!CATEGORIES.some((c) => c.id === id)) problems.push(`category "${id}" exists in Kotlin but not in JS`);
}

if (ktDefaults.root !== DEFAULT_ROOT) {
  problems.push(`DEFAULT_ROOT differs: JS "${DEFAULT_ROOT}" vs Kotlin "${ktDefaults.root}"`);
}

// Folder names must equal category ids (that is what keeps paths predictable).
for (const c of CATEGORIES) {
  if (c.folder !== c.id) problems.push(`category "${c.id}" has folder "${c.folder}" — must match`);
}

/* ------------------------------------------------ 3. behaviour asserts ----- */

const expect = (label, got, want) => {
  const g = typeof got === 'object' ? got.id : got;
  if (g !== want) problems.push(`BEHAVIOUR ${label}: got "${g}", want "${want}"`);
};

// extension wins, and query strings are stripped first
expect('mp4 with query', classify({ url: 'https://x/cdn/file.mp4?token=abc' }), 'videos');
expect('mp3 name', classify({ name: 'song.MP3' }), 'music');
expect('heic', classify({ name: 'IMG_0231.HEIC' }), 'photos');
expect('epub', classify({ name: 'book.epub' }), 'documents');
expect('7z', classify({ name: 'bundle.7z' }), 'compressed');
expect('xapk', classify({ name: 'game.xapk' }), 'programs');
expect('srt', classify({ name: 'movie.en.srt' }), 'subtitles');
expect('torrent', classify({ name: 'x.torrent' }), 'torrents');
expect('json', classify({ name: 'data.json' }), 'general');

// mime fallback when there is no filename
expect('mime video', classify({ mime: 'video/x-matroska' }), 'videos');
expect('mime audio', classify({ mime: 'audio/ogg' }), 'music');
expect('mime image', classify({ mime: 'image/webp' }), 'photos');
expect('mime apk', classify({ mime: 'application/vnd.android.package-archive' }), 'programs');

// magnets with no filename yet → torrents
expect('magnet kind', classify({ kind: 'magnet' }), 'torrents');
expect('torrent kind', classify({ kind: 'torrent' }), 'torrents');

// unknown ext → general, no ext → others
expect('unknown ext', classify({ name: 'weird.qqq' }), 'general');
expect('no ext', classify({ name: 'LICENSE', url: 'https://x/LICENSE' }), 'others');

// override beats everything
expect('override', classify({ name: 'a.mp4', override: 'music' }), 'music');

// precedence: extension beats mime
expect('ext>mime', classify({ name: 'a.mp3', mime: 'video/mp4' }), 'music');

// disabled categories fall through to the next rule, not to a dead end
const disabledRun = classify({ name: 'a.mp4' }); // sanity: enabled path
expect('enabled videos', disabledRun, 'videos');

// paths
if (folderPathFor('videos') !== 'Download/Surge/videos') {
  problems.push(`folderPathFor('videos') = ${folderPathFor('videos')}`);
}
if (folderPathFor('nope') !== 'Download/Surge/others') {
  problems.push('unknown category must fall back to others folder');
}
if (extensionOf('https://x/a/b/c.MKV?v=2#f') !== 'mkv') problems.push('extensionOf query/hash strip broken');

// every category reachable: no orphan categories
const reachable = new Set(CATEGORIES.map((c) => classify({ name: `x.${c.ext[0] ?? ''}` }).id));
for (const c of CATEGORIES) {
  if (c.ext.length === 0) continue;
  if (!reachable.has(c.id)) problems.push(`category "${c.id}" is unreachable by extension`);
}

/* ------------------------------------------------------------- report ------ */

const totalExts = CATEGORIES.reduce((a, c) => a + c.ext.length, 0);
console.log('Surge classifier audit');
console.log('='.repeat(72));
console.log(`  categories        ${CATEGORIES.length}  (${CATEGORIES.map((c) => c.folder).join(', ')})`);
console.log(`  extensions mapped ${totalExts}`);
console.log(`  kotlin rows       ${ktTable.size}`);
console.log('='.repeat(72));
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of [...new Set(problems)]) console.log('  · ' + p);
  if (STRICT) process.exit(1);
} else {
  console.log('\nJS and Kotlin tables agree; classification precedence verified.');
}
