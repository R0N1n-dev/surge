/**
 * Surge — settings store
 * ---------------------------------------------------------------------------
 * Owns the download-root + category configuration that drives the 1DM-style
 * auto-filing, plus the handful of engine preferences the WebView half needs.
 *
 * Persistence is two-tier on purpose:
 *   · localStorage  → instant, survives WebView reloads, drives first paint
 *   · Kotlin DataStore (via the Storage plugin) → the source of truth for the
 *     native side (aria2's --dir, MediaStore RELATIVE_PATH, folder mkdir)
 * The WebView writes both and never assumes they agree without a sync.
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { CATEGORIES, CATEGORY_IDS, DEFAULT_ROOT, folderPathFor } from '@/lib/classify.js';

const KEY = 'surge.settings';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function write(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = read();

  /** Root folder relative to internal storage, e.g. `Download/Surge`. */
  const root = ref(saved.root ?? DEFAULT_ROOT);

  /** Categories the user has switched off are skipped by the classifier. */
  const disabled = ref(new Set(saved.disabled ?? []));

  /** Extra extension→category rules the user added ("put .cbz in compressed"). */
  const customRules = ref(saved.customRules ?? {}); // { ext: categoryId }

  /** Remember the last category override per source kind, for convenience. */
  const lastOverride = ref(saved.lastOverride ?? {});

  const activeCategories = computed(() =>
    CATEGORIES.filter((c) => !disabled.value.has(c.id) || c.id === 'others' || c.id === 'general'),
  );

  /** `others` and `general` are the safety nets and cannot be disabled. */
  function setEnabled(id, on) {
    if (id === 'others' || id === 'general') return;
    const next = new Set(disabled.value);
    if (on) next.delete(id);
    else next.add(id);
    disabled.value = next;
  }

  function setCustomRule(ext, categoryId) {
    const e = ext.replace(/^\./, '').toLowerCase();
    if (!e || !CATEGORY_IDS.includes(categoryId)) return;
    customRules.value = { ...customRules.value, [e]: categoryId };
  }

  function removeCustomRule(ext) {
    const { [ext]: _drop, ...rest } = customRules.value;
    void _drop;
    customRules.value = rest;
  }

  function setRoot(next) {
    const clean = String(next).replace(/^\/+|\/+$/g, '').trim();
    if (!clean) return;
    root.value = clean;
  }

  function rememberOverride(kind, categoryId) {
    lastOverride.value = { ...lastOverride.value, [kind]: categoryId };
  }

  function pathFor(categoryId) {
    return folderPathFor(categoryId, root.value);
  }

  /** Push the whole config down to Kotlin so aria2 + MediaStore agree. */
  async function syncNative() {
    try {
      const { isNative, getPlugins } = await import('@/lib/native.js');
      if (!isNative) return;
      const p = await getPlugins();
      await p.Storage.configureStorage?.({
        root: root.value,
        disabled: [...disabled.value],
        customRules: customRules.value,
      });
    } catch {
      /* native sync is best-effort; localStorage already holds it */
    }
  }

  watch([root, disabled, customRules], () => {
    write({
      ...read(),
      root: root.value,
      disabled: [...disabled.value],
      customRules: customRules.value,
      lastOverride: lastOverride.value,
    });
    syncNative();
  }, { deep: true });

  return {
    root,
    disabled,
    customRules,
    lastOverride,
    activeCategories,
    setEnabled,
    setCustomRule,
    removeCustomRule,
    setRoot,
    rememberOverride,
    pathFor,
    syncNative,
  };
});
