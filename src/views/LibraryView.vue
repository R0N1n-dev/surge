<script setup>
defineOptions({ name: 'LibraryView' });
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import { useDownloadsStore } from '@/stores/downloads.js';
import { useUiStore } from '@/stores/ui.js';
import { bridge } from '@/lib/native.js';
import { formatBytes, extLabel } from '@/lib/format.js';
import { CATEGORIES } from '@/lib/classify.js';
import { useSettingsStore } from '@/stores/settings.js';

const dl = useDownloadsStore();
const ui = useUiStore();
const settings = useSettingsStore();

/** Tabs ARE the on-disk category folders — what you tap is what's on disk. */
const CATS = [{ id: 'all', label: 'All', icon: 'folder', folder: '' }, ...CATEGORIES];

const cat = ref('all');

/** Completed downloads, filtered to the active category. */
const done = computed(() => dl.items.filter((i) => i.state === 'complete' || i.state === 'seeding'));

const files = computed(() =>
  cat.value === 'all' ? done.value : done.value.filter((i) => i.category === cat.value),
);

/** Per-folder rollup for the storage tree: count + bytes, straight off disk. */
const tree = computed(() =>
  CATEGORIES.map((c) => {
    const inCat = done.value.filter((i) => i.category === c.id);
    return {
      ...c,
      count: inCat.length,
      bytes: inCat.reduce((a, b) => a + b.totalBytes, 0),
      path: settings.pathFor(c.id),
    };
  }),
);

const isPlayable = (name) => ['video', 'audio'].includes(cat.value) || /\.(mp4|mkv|webm|mp3|m4a|opus|flac)$/i.test(name);

function open(item) {
  bridge.open(item.id);
}
</script>

<template>
  <header class="appbar">
    <div class="appbar__row">
      <span class="appbar__title">Library</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Toggle grid or list" @click="ui.viewMode = ui.viewMode === 'grid' ? 'list' : 'grid'">
        <Icon :name="ui.viewMode === 'grid' ? 'list' : 'grid'" :size="22" />
      </button>
    </div>
  </header>

  <main class="app-main">
    <div class="app-content col gap-4" style="padding-block: 12px">
      <div class="card card--filled" style="padding: 14px 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center">
        <div class="col gap-1" style="align-items: center">
          <span style="color: var(--s-primary)"><Icon name="hard-drive" :size="18" /></span>
          <span class="t-mono-small">{{ formatBytes(dl.storedBytes) }}</span>
          <span class="t-label-small muted">On disk</span>
        </div>
        <div class="col gap-1" style="align-items: center">
          <span style="color: var(--s-primary)"><Icon name="file" :size="18" /></span>
          <span class="t-mono-small">{{ dl.counts.complete }}</span>
          <span class="t-label-small muted">Files</span>
        </div>
        <div class="col gap-1" style="align-items: center">
          <span style="color: var(--s-primary)"><Icon name="seedling" :size="18" /></span>
          <span class="t-mono-small">{{ dl.counts.torrent }}</span>
          <span class="t-label-small muted">Torrents</span>
        </div>
      </div>

      <div class="card" style="padding: 6px 8px">
        <div class="tree">
          <div v-for="t in tree" :key="t.id" class="tree__row" @click="cat = t.id">
            <span class="setting__icon" style="width:32px;height:32px"><Icon :name="t.icon" :size="18" /></span>
            <span class="col" style="min-width: 0">
              <span class="tree__name">{{ t.folder }}/</span>
              <span class="t-body-small muted truncate">{{ t.blurb }}</span>
            </span>
            <span class="tree__size">{{ t.count ? `${t.count} · ${formatBytes(t.bytes)}` : 'empty' }}</span>
          </div>
        </div>
      </div>

      <div class="chip-rail" role="tablist" aria-label="Categories">
        <button v-for="c in CATS" :key="c.id" class="chip" :class="{ 'is-selected': cat === c.id }" :aria-pressed="cat === c.id" @click="cat = c.id">
          <Icon :name="c.icon" :size="16" /> {{ c.label }}
        </button>
      </div>

      <div v-if="files.length" class="media-grid">
        <article v-for="f in files" :key="f.id" class="media-card" @click="open(f)">
          <div class="media-card__thumb">
            <span style="color: var(--s-outline)"><Icon :name="isPlayable(f.name) ? 'film' : 'file'" :size="30" /></span>
            <span v-if="isPlayable(f.name)" class="media-card__play"><Icon name="play" :size="18" /></span>
          </div>
          <div class="media-card__info">
            <span class="badge badge--neutral" style="width: fit-content; height: 18px">{{ extLabel(f.name) }}</span>
            <span class="media-card__name">{{ f.name }}</span>
            <span class="media-card__meta">{{ formatBytes(f.totalBytes) }}</span>
          </div>
        </article>
      </div>

      <div v-else class="empty">
        <div class="empty__art"><Icon name="folder-open" :size="44" /></div>
        <div class="empty__title">No files in this category</div>
        <div class="empty__body">Finished downloads land here automatically, indexed into the system Gallery and Music apps.</div>
      </div>
    </div>
  </main>
</template>
