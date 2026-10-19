/**
 * Surge — provision or repair the generated `android/` platform, then reconcile it.
 * ---------------------------------------------------------------------------
 * `android/` is not committed (.gitignore): `cap add android` creates it from the
 * Capacitor CLI template that already sits in node_modules. This script makes
 * that step implicit so a clean clone needs exactly one command:
 *
 *   bun run android:prep    # web bundle (if missing) → cap add (if missing) → overlay
 *
 * `android:build`, `android:bundle`, `android:run` and `cap:sync` all call it.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const PLATFORM = join(ROOT, 'android/settings.gradle');
const OVERLAY = join(ROOT, 'tools/android-overlay.mjs');

const run = (args, label) => {
  console.log(`\nSurge: ${label}`);
  const r = spawnSync(node, args, { cwd: ROOT, stdio: 'inherit' });
  return r.status ?? 1;
};

// 1. `cap add android` copies web assets, so dist/ has to exist first.
if (!existsSync(join(ROOT, 'dist/index.html'))) {
  const status = run([join(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], 'building the web bundle (dist/ was missing)…');
  if (status !== 0) {
    console.error('\nSurge: `vite build` failed — fix the errors above, then re-run bun run android:prep.');
    process.exit(status);
  }
}

// 2. create the platform if this machine has never had one
if (!existsSync(PLATFORM)) {
  const status = run(
    [join(ROOT, 'node_modules/@capacitor/cli/bin/capacitor'), 'add', 'android'],
    'creating android/ from the Capacitor template (first run on this machine)…',
  );
  if (status !== 0 || !existsSync(PLATFORM)) {
    console.error('\nSurge: `cap add android` did not produce android/settings.gradle.');
    console.error('       If the folder exists but is incomplete, remove it and retry:');
    console.error('         rm -rf android && bun run android:prep');
    process.exit(status || 1);
  }
}

// 3. reconcile: SDK 36, AGP 8.13, plugin classpaths, wrapper, settings, icons…
const overlay = spawnSync(node, [OVERLAY], { cwd: ROOT, stdio: 'inherit' });
process.exit(overlay.status ?? 0);
