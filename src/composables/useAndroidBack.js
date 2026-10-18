/**
 * Surge — Android hardware/gesture back
 * ---------------------------------------------------------------------------
 * Proper platform back behaviour: back walks your actual navigation history
 * (previous section), unwinds transient layers first (dialog → sheet → speedial),
 * and only exits from Home when there is nowhere left to go.
 *
 * Registering a `backButton` listener with the Capacitor App plugin SUPPRESSES
 * the bridge's default handling, so this is the single source of truth for back
 * on device. On the web preview we leave the browser's own back alone.
 *
 * Order of precedence, per platform-guideline:
 *   1. dismiss an open confirm dialog          (resolve it as "cancel")
 *   2. dismiss an open bottom sheet
 *   3. collapse the FAB speedial
 *   4. pop SPA history (router.back)           ← "previous section"
 *   5. from a tab root, go Home
 *   6. on Home with empty history, exit the app
 */

import { onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui.js';

export function useAndroidBack() {
  const router = useRouter();
  const ui = useUiStore();
  let remove = null;
  let nativeExit = null;

  function canGoBackInApp() {
    // Vue Router records the PREVIOUS entry's path in history.state.back when
    // the entry was produced by a router.push/replace inside the SPA. `current`
    // is always set (it is this very entry), so testing it claims history
    // exists even on a cold deep-link: a widget tap or share intent lands
    // straight on /add, where router.back() is a no-op that traps the user.
    const st = window.history.state;
    return !!(st && st.back);
  }

  async function onBack() {
    if (ui.dialog) {
      ui.resolveDialog(false);
      return;
    }
    if (ui.sheet) {
      ui.closeSheet();
      return;
    }
    if (ui.fabOpen) {
      ui.fabOpen = false;
      return;
    }
    const current = router.currentRoute.value;
    if (canGoBackInApp()) {
      router.back();
      return;
    }
    if (current.name !== 'home') {
      // No in-app history behind this screen (deep-link / cold start): go Home
      // instead of faking a back that would leave the app.
      router.replace('/');
      return;
    }
    // Nothing left: leave, don't trap the user in the app.
    if (nativeExit) await nativeExit();
  }

  async function install() {
    try {
      const { isNative, getPlugins } = await import('@/lib/native.js');
      if (!isNative) return;
      const p = await getPlugins();
      nativeExit = () => p.App.exitApp();
      const listener = await p.App.addListener('backButton', () => onBack());
      remove = () => listener.remove();
    } catch {
      /* web preview: browser back already behaves */
    }
  }

  install();
  onUnmounted(() => remove?.());

  return { onBack };
}
