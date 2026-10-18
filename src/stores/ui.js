/**
 * Surge — UI store
 * ---------------------------------------------------------------------------
 * Transient, app-wide interface state: the snackbar queue, the active bottom
 * sheet, multi-selection, and the "is the FAB expanded" flag. Deliberately NOT
 * in component-local state because these are cross-cutting (a delete in one
 * view must be undoable from anywhere via the snackbar).
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

let snackbarSeq = 0;

export const useUiStore = defineStore('ui', () => {
  /* ------------------------------------------------------------- snackbar -- */
  const snack = ref(null); // { id, message, action, tone }
  let snackTimer = null;

  /**
   * Show a snackbar. If `onAction` is given the snackbar carries an action
   * button (the Undo path). Returns a promise resolving when dismissed.
   */
  function show(message, { action = null, tone = 'default', duration = 4000, onAction = null } = {}) {
    clearTimeout(snackTimer);
    const id = ++snackbarSeq;
    snack.value = { id, message, action, tone, onAction };
    snackTimer = setTimeout(() => dismiss(id), duration);
    return id;
  }

  function dismiss(id) {
    if (id != null && snack.value?.id !== id) return;
    snack.value = null;
  }

  function runAction() {
    const fn = snack.value?.onAction;
    dismiss();
    fn?.();
  }

  /* ------------------------------------------------------------- sheets ---- */
  const sheet = ref(null); // { id, component, props }
  const dialog = ref(null); // { id, title, body, confirmLabel, tone, onConfirm }

  function openSheet(component, props = {}) {
    sheet.value = { id: ++snackbarSeq, component, props };
  }
  function closeSheet() {
    sheet.value = null;
  }

  /** Promise-based confirm dialog so call sites read top-to-bottom. */
  function confirm(opts) {
    return new Promise((resolve) => {
      dialog.value = {
        id: ++snackbarSeq,
        ...opts,
        resolve,
      };
    });
  }
  function resolveDialog(value) {
    dialog.value?.resolve(value);
    dialog.value = null;
  }

  /* ---------------------------------------------------------- selection ---- */
  /**
   * Pinia setup-stores UNWRAP refs on the store instance, so `store.selection`
   * is already the Set — never `store.selection.value`. Reaching for `.value`
   * yields `undefined`, which made `[...ids]` throw inside batch() and `.has()`
   * throw on every card render; both surfaced to the user as the generic
   * "Something went wrong — the queue is safe." error toast.
   */
  const selection = ref(new Set());
  const selecting = computed(() => selection.value.size > 0);

  function toggleSelect(id) {
    const next = new Set(selection.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.value = next;
  }
  /** The Set itself — `store.selection` is unwrapped, never `.selection.value`. */
  function selectedIds() {
    return [...selection.value];
  }
  function selectAll(ids) {
    selection.value = new Set(ids);
  }
  function clearSelection() {
    selection.value = new Set();
  }

  /* ------------------------------------------------------------- misc ------ */
  const fabOpen = ref(false);
  const filter = ref('all');
  const viewMode = ref('list'); // 'list' | 'grid' (Library)

  return {
    snack,
    show,
    dismiss,
    runAction,
    sheet,
    openSheet,
    closeSheet,
    dialog,
    confirm,
    resolveDialog,
    selection,
    selecting,
    toggleSelect,
    selectAll,
    clearSelection,
    selectedIds,
    fabOpen,
    filter,
    viewMode,
  };
});
