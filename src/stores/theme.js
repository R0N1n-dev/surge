/**
 * Surge — theme store
 * ---------------------------------------------------------------------------
 * Owns palette + mode + Material You, stamps the classes onto <html>, persists
 * the choice, and keeps the native status/navigation bar chrome in step so the
 * WebView never fights the OS chrome.
 *
 * Static CSS (themes.css) already contains every palette; switching is a class
 * swap, which is one style recalc and zero network. Material You is the only
 * case that writes inline custom properties (it has to, the palette is unknown
 * at build time).
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

/** Mirrors tools/themes.mjs — kept in sync by tools/verify-css.mjs conceptually,
 *  but duplicated here on purpose so the runtime has no build-step dependency. */
export const PALETTES = [
  { id: 'classic-corporate', name: 'Classic Corporate', use: 'Fintech, SaaS & crypto', kind: 'dual', ratio: '80 / 20', colors: ['#1E2761', '#408EC6'] },
  { id: 'energetic-retail', name: 'Energetic Retail', use: 'E-commerce, delivery & travel', kind: 'dual', ratio: '80 / 20', colors: ['#2C3E50', '#E67E22'] },
  { id: 'eco-organic', name: 'Eco-Organic', use: 'Sustainability & wellness', kind: 'dual', ratio: '80 / 20', colors: ['#2C5F2D', '#97BC62'] },
  { id: 'cyber-contrast', name: 'Cyber High-Contrast', use: 'Productivity & dev tools', kind: 'dual', ratio: '80 / 20', colors: ['#1A1A1A', '#C1DD13'] },
  { id: 'minimal-editorial', name: 'Minimalist Editorial', use: 'Fashion & lifestyle', kind: 'dual', ratio: '80 / 20', colors: ['#CC313D', '#F7C5CC'] },
  { id: 'high-end-trio', name: 'The High-End Trio', use: 'Luxury retail & fine dining', kind: 'triple', ratio: '60 / 30 / 10', colors: ['#1E2761', '#408EC6', '#7A2048'] },
  { id: 'bright-tech', name: 'The Bright Tech Vibe', use: 'SaaS dashboards & finance', kind: 'triple', ratio: '60 / 30 / 10', colors: ['#2D3047', '#2EC4B6', '#FF7A59'] },
  { id: 'playful-pastel', name: 'The Playful Pastel', use: 'Casual social & education', kind: 'triple', ratio: '60 / 30 / 10', colors: ['#B298E7', '#B8E3E9', '#F5B8D5'] },
  { id: 'earthy-muted', name: 'The Earthy Muted', use: 'Home decor & plant tracking', kind: 'triple', ratio: '60 / 30 / 10', colors: ['#4A5842', '#EFEBE4', '#D98A6C'] },
];

export const MODES = ['light', 'dark', 'system'];

const STORAGE_KEY = 'surge.settings';

function readPersisted() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function persist(obj) {
  // MERGE, never replace: the settings store shares this key (root folder,
  // category config). Overwriting it here silently deleted the user's storage
  // preferences on every theme change.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPersisted(), ...obj }));
  } catch {
    /* private mode / quota — theme simply won't survive a reload */
  }
}

export const useThemeStore = defineStore('theme', () => {
  const saved = readPersisted();

  const palette = ref(saved.theme ?? 'bright-tech');
  const mode = ref(saved.mode ?? 'dark');
  const dynamic = ref(saved.dynamic ?? false); // Material You
  const dynamicSeed = ref(saved.dynamicSeed ?? null); // {p,s,t} from wallpaper

  const systemDark = ref(
    typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches,
  );

  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      // addEventListener on MediaQueryList is Chrome 76+; older System WebViews
      // only have addListener, and throwing here would kill the store at boot.
      if (mql.addEventListener) mql.addEventListener('change', (e) => (systemDark.value = e.matches));
      else if (mql.addListener) mql.addListener((e) => (systemDark.value = e.matches));
    } catch {
      /* system scheme unknown; stay on the persisted mode */
    }
  }

  /** The mode that is actually in effect right now. */
  const effectiveMode = computed(() =>
    mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value,
  );

  const isDark = computed(() => effectiveMode.value === 'dark');

  const paletteMeta = computed(
    () => PALETTES.find((p) => p.id === palette.value) ?? PALETTES[0],
  );

  /** Apply classes + persist + tell the OS chrome what we did. */
  function apply() {
    const el = document.documentElement;
    el.classList.remove(...[...el.classList].filter((c) => c.startsWith('theme-') || c.startsWith('mode-')));
    el.classList.add(`theme-${palette.value}`, `mode-${effectiveMode.value}`);

    if (dynamic.value && dynamicSeed.value) {
      applyDynamic(dynamicSeed.value);
    } else {
      clearDynamic();
    }

    persist({ theme: palette.value, mode: mode.value, dynamic: dynamic.value, dynamicSeed: dynamicSeed.value });
    syncNativeChrome();
  }

  /**
   * Material You: overwrite the three seed roles with wallpaper-derived colours.
   * The tonal engine already produced every other token from seeds at build
   * time, so overriding just the seed trio + the surface tint is enough to make
   * the whole app feel wallpaper-native without shipping a runtime HCT engine.
   */
  function applyDynamic({ p, s, t }) {
    const el = document.documentElement.style;
    el.setProperty('--s-brand', p);
    el.setProperty('--s-seed-primary', p);
    el.setProperty('--s-seed-secondary', s);
    el.setProperty('--s-seed-accent', t);
  }

  function clearDynamic() {
    const el = document.documentElement.style;
    ['--s-brand', '--s-seed-primary', '--s-seed-secondary', '--s-seed-accent'].forEach((k) =>
      el.removeProperty(k),
    );
  }

  /** Pull wallpaper colours from Android and feed them to the dynamic path. */
  async function enableDynamic() {
    try {
      const { isNative, getPlugins } = await import('@/lib/native.js');
      if (!isNative) {
        // Browser preview: simulate with the palette's own seeds.
        dynamicSeed.value = { p: paletteMeta.value.colors[0], s: paletteMeta.value.colors[1], t: paletteMeta.value.colors[2] ?? paletteMeta.value.colors[1] };
      } else {
        const pl = await getPlugins();
        dynamicSeed.value = await pl.Downloader.wallpaperColors();
      }
      dynamic.value = true;
      apply();
    } catch {
      dynamic.value = false;
    }
  }

  function setPalette(id) {
    if (!PALETTES.some((p) => p.id === id)) return;
    palette.value = id;
    apply();
  }

  function setMode(m) {
    if (!MODES.includes(m)) return;
    mode.value = m;
    apply();
  }

  function cycleMode() {
    const i = MODES.indexOf(mode.value);
    setMode(MODES[(i + 1) % MODES.length]);
  }

  /**
   * Keep the Android status + nav bar chrome matching the app surface.
   * Light surfaces want dark glyphs; dark surfaces want light glyphs.
   */
  async function syncNativeChrome() {
    try {
      const { isNative, getPlugins } = await import('@/lib/native.js');
      if (!isNative) return;
      const pl = await getPlugins();
      const css = getComputedStyle(document.documentElement);
      const bg = css.getPropertyValue('--s-surface-container').trim() || '#0f1013';
      await pl.StatusBar.setBackgroundColor({ color: bg });
      await pl.StatusBar.setStyle({ style: isDark.value ? 'DARK' : 'LIGHT' });
    } catch {
      /* chrome sync is best-effort */
    }
  }

  watch([palette, mode, dynamic], apply, { flush: 'post' });

  return {
    palette,
    mode,
    dynamic,
    dynamicSeed,
    effectiveMode,
    isDark,
    paletteMeta,
    palettes: PALETTES,
    setPalette,
    setMode,
    cycleMode,
    enableDynamic,
    apply,
    syncNativeChrome,
  };
});
