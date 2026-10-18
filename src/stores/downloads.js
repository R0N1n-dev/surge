/**
 * Surge — downloads store
 * ---------------------------------------------------------------------------
 * A thin, derived view over the bridge's live table. The bridge owns the truth
 * (it receives engine events); this store owns *queries* — filtered lists,
 * aggregates, and the intent-level operations that views call.
 *
 * Kept deliberately small: if a view needs a number, it should be derivable
 * here in one place rather than re-computed per component.
 */

import { defineStore } from 'pinia';
import { computed } from 'vue';
import { bridge, downloads as live, listItems } from '@/lib/native.js';
import { useUiStore } from '@/stores/ui.js';

export const useDownloadsStore = defineStore('downloads', () => {
  const ui = useUiStore();

  const items = computed(() => [...live.items.values()]);
  const ready = computed(() => live.ready);
  const totals = computed(() => live.totals);
  const engine = computed(() => live.engine);
  const history = computed(() => live.history);

  const filtered = computed(() => listItems(ui.filter));

  const counts = computed(() => {
    const c = { all: 0, active: 0, queued: 0, complete: 0, failed: 0, torrent: 0, media: 0 };
    for (const it of items.value) {
      c.all++;
      if (it.state === 'active' || it.state === 'seeding') c.active++;
      else if (it.state === 'queued') c.queued++;
      else if (it.state === 'complete') c.complete++;
      else if (it.state === 'error') c.failed++;
      if (it.kind === 'magnet' || it.kind === 'torrent') c.torrent++;
      if (['youtube', 'instagram', 'tiktok', 'twitter'].includes(it.kind)) c.media++;
    }
    return c;
  });

  /** Bytes on disk across completed items — the Library header stat. */
  const storedBytes = computed(
    () => items.value.filter((i) => i.state === 'complete').reduce((a, b) => a + b.totalBytes, 0),
  );

  /* ---------------------------------------------------------- intents ------ */

  async function addFromDetection(info, extra = {}) {
    return bridge.add([
      {
        name: extra.name ?? friendlyName(info),
        kind: info.kind,
        engine: info.engine,
        url: info.url ?? '',
        ...extra,
      },
    ]);
  }

  async function pause(id) {
    await bridge.pause(id);
    ui.show('Download paused', { action: 'Resume', onAction: () => bridge.resume(id), duration: 3500 });
  }

  async function resume(id) {
    await bridge.resume(id);
  }

  async function remove(id, { deleteFile = false } = {}) {
    const snapshot = live.items.get(id);
    await bridge.remove(id, { deleteFile });
    ui.show(`Removed ${snapshot?.name ?? 'download'}`, {
      action: 'Undo',
      duration: 6000,
      onAction: () => bridge.add([snapshot]).catch(() => {}),
    });
  }

  async function pauseAll() {
    await bridge.pauseAll();
    ui.show('All downloads paused');
  }

  async function resumeAll() {
    await bridge.resumeAll();
    ui.show('Resuming queue');
  }

  /** Batch operate on the current selection, then clear it. */
  async function batch(action) {
    const ids = [...ui.selection.value];
    for (const id of ids) {
      if (action === 'pause') await bridge.pause(id);
      if (action === 'resume') await bridge.resume(id);
      if (action === 'remove') await bridge.remove(id);
    }
    ui.clearSelection();
    ui.show(`${action[0].toUpperCase()}${action.slice(1)} applied to ${ids.length} item${ids.length === 1 ? '' : 's'}`);
  }

  function friendlyName(info) {
    if (info.host) return info.host;
    try {
      const u = new URL(info.url || info.raw || '');
      return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname);
    } catch {
      return 'download';
    }
  }

  return {
    items,
    filtered,
    counts,
    totals,
    engine,
    history,
    storedBytes,
    ready,
    addFromDetection,
    pause,
    resume,
    remove,
    pauseAll,
    resumeAll,
    batch,
  };
});
