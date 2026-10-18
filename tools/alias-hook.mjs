/**
 * Surge — Node ESM loader hook for the `@/` alias.
 * ---------------------------------------------------------------------------
 * `vite.config.js` aliases `@` to `src/`, so app modules can `import '@/lib/…'`.
 * Plain `node` has no idea what that means, which stopped the runtime audits
 * (tools/verify-stores.mjs) from importing real stores. Register this hook
 * before those imports and Node resolves the alias exactly like Vite does.
 *
 *   import { register } from 'node:module';
 *   register(new URL('./alias-hook.mjs', import.meta.url));
 */

import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = resolvePath(ROOT, 'src', specifier.slice(2));
    return next(pathToFileURL(target).href, context);
  }
  return next(specifier, context);
}
