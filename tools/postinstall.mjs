/**
 * Surge — postinstall
 * ---------------------------------------------------------------------------
 * `bun install` is the first thing anyone runs after pulling, and it is the only
 * moment where we can reconcile the GENERATED android/ project without asking
 * the user to remember a second command. The 2026-10 bug report ("Plugin with id
 * 'kotlin-android' not found") was exactly this: the source had the fix, but the
 * generated android/build.gradle still lacked the classpath because the overlay
 * had never been run.
 *
 * Runs as a subprocess so a half-generated (or entirely absent) platform can
 * never break an install. Creating the platform itself is `bun run android:prep`.
 */

import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const overlay = fileURLToPath(new URL('./android-overlay.mjs', import.meta.url));
const r = spawnSync(process.execPath, [overlay], { stdio: 'inherit' });

if (r.status !== 0) {
  console.warn('[surge] android overlay hit a problem — run `bun run android:prep` to repair android/.');
}
