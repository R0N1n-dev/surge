import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index.js';
import { sprite } from '../tools/icons.mjs';

// Global design layers: generated tokens first, then base + components.
import './styles/themes.css';
import './styles/base.css';
import './styles/components.css';

/**
 * Boot sequence, ordered so a black screen is structurally impossible:
 *
 *  1. inject the icon sprite synchronously (no glyph flash);
 *  2. mount Vue immediately — an empty router view still paints the shell;
 *  3. on the next painted frame, dismiss BOTH the HTML boot shell and the
 *     native splash. This happens before any engine/plugin work, so a cold
 *     aria2 daemon or a slow plugin can never hold the splash hostage;
 *  4. only then start theme reconciliation, insets and the download bridge,
 *     each independently guarded so one failure degrades a feature, not the app.
 *
 * The native splash also auto-hides on a timer (capacitor.config.json) as a
 * second safety net, and index.html has a 4s watchdog that surfaces a readable
 * error if this bundle never executes at all.
 */
function injectSprite() {
  const holder = document.createElement('div');
  holder.innerHTML = sprite();
  document.body.prepend(holder.firstElementChild);
}

function dismissBootShell() {
  window.__surgeBooted = true;
  const boot = document.getElementById('boot');
  if (boot) {
    boot.classList.add('is-done');
    setTimeout(() => boot.remove(), 300);
  }
}

async function hideNativeSplash() {
  try {
    const { isNative, getPlugins } = await import('./lib/native.js');
    if (!isNative) return;
    const { SplashScreen } = await getPlugins();
    await SplashScreen.hide();
  } catch {
    /* splash auto-hide timer covers us */
  }
}

async function boot() {
  injectSprite();

  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);

  // A failed route-chunk load (stale install after an update is the usual cause)
  // would otherwise render an empty shell. Surface it and offer a clean reload.
  router.onError((err) => {
    console.error('[surge] router error', err);
    window.__surgeReveal?.(`Screen failed to load: ${err?.message ?? err}. Reopen the app to retry.`);
  });

  // An unhandled error must never leave the user staring at a frozen queue.
  // Surface it, keep the app alive.
  app.config.errorHandler = (err, _vm, info) => {
    console.error('[surge]', info, err);
    // Name the failure in the toast. A bare "something went wrong" is
    // undiagnosable from a screenshot; the queue genuinely is untouched.
    const detail = err?.message ?? String(err);
    import('./stores/ui.js').then(({ useUiStore }) => {
      useUiStore().show(`Something went wrong — the queue is safe. (${detail})`, {
        tone: 'error',
        duration: 6000,
      });
    });
  };

  app.mount('#app');

  // Reveal on the first painted frame — two rAFs guarantees a commit happened.
  requestAnimationFrame(() => requestAnimationFrame(dismissBootShell));
  hideNativeSplash();

  // Everything below is progressive enhancement; each is isolated.
  try {
    const { useThemeStore } = await import('./stores/theme.js');
    useThemeStore().apply();
  } catch (e) {
    console.warn('[surge] theme init failed, using stamped classes', e);
  }

  try {
    const { useSafeArea } = await import('./composables/useSafeArea.js');
    useSafeArea();
  } catch (e) {
    console.warn('[surge] safe-area init failed', e);
  }

  try {
    const { bridge } = await import('./lib/native.js');
    // Not awaited: the UI is fully usable against the local table while the
    // engines come up, and the poll loop reconciles as soon as they answer.
    bridge.init().catch((e) => console.warn('[surge] bridge init degraded', e));
  } catch (e) {
    console.warn('[surge] bridge unavailable', e);
  }
}

boot();
