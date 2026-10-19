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
 * Runs the overlay inside a try/catch so a half-generated or missing platform
 * can never break an install.
 */

try {
  await import('./android-overlay.mjs');
} catch (e) {
  console.warn(`[surge] android overlay skipped: ${e?.message ?? e}`);
  console.warn('        Run `bun run android:prep` after `cap add android`.');
}
