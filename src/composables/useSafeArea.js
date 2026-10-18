/**
 * Surge — safe-area insets
 * ---------------------------------------------------------------------------
 * Android's WebView reports env(safe-area-inset-*) as 0, so edge-to-edge CSS
 * would draw the app bar under the status bar (the notification-pull area) and
 * the bottom nav under the gesture pill. We measure the real insets natively
 * (SafeAreaPlugin) and expose them as CSS variables:
 *
 *   --sat  status bar / cutout top
 *   --sab  nav bar / gesture zone bottom
 *   --sal / --sar  cutout sides in landscape
 *   --sak  on-screen keyboard height
 *
 * Every fixed or sticky surface in the app consumes these, so content always
 * lives strictly between the system bars while the background colour still runs
 * edge-to-edge behind them.
 */

let installed = false;

const FALLBACK = { top: 0, bottom: 0, left: 0, right: 0, keyboard: 0 };

function applyVars(v) {
  const el = document.documentElement.style;
  el.setProperty('--sat', `${v.top}px`);
  el.setProperty('--sab', `${v.bottom}px`);
  el.setProperty('--sal', `${v.left}px`);
  el.setProperty('--sar', `${v.right}px`);
  el.setProperty('--sak', `${v.keyboard}px`);
}

async function measure() {
  try {
    const { isNative, getPlugins } = await import('@/lib/native.js');
    if (!isNative) {
      // iOS / desktop: env() already resolves correctly in CSS. Setting the
      // vars here would OVERWRITE those fallbacks with zeros and push content
      // under the bars, so leave them untouched.
      return;
    }
    const p = await getPlugins();
    const v = await p.SafeArea.getInsets();
    applyVars(v);
  } catch {
    applyVars(FALLBACK);
  }
}

/** Install once at boot; re-measures on orientation + keyboard changes. */
export function useSafeArea() {
  if (installed) return;
  installed = true;

  measure();

  // Orientation flips which edges carry a cutout.
  window.addEventListener('orientationchange', () => setTimeout(measure, 120));
  window.addEventListener('resize', () => setTimeout(measure, 120));

  // The keyboard moving is the most common inset change while typing a URL.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => setTimeout(measure, 80));
  }
}
