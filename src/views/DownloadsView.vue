<script setup>
defineOptions({ name: 'DownloadsView' });
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import DownloadCard from '@/components/DownloadCard.vue';
import { useDownloadsStore } from '@/stores/downloads.js';
import { useUiStore } from '@/stores/ui.js';
import { formatSpeed } from '@/lib/format.js';

const dl = useDownloadsStore();
const ui = useUiStore();

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Downloading' },
  { id: 'queued', label: 'Queued' },
  { id: 'complete', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
  { id: 'torrent', label: 'Torrents', icon: 'torrent' },
  { id: 'media', label: 'Media', icon: 'video' },
];

const list = computed(() => dl.filtered);
const showDock = computed(() => dl.totals.active > 0 || dl.totals.queued > 0);
const scrolled = ref(false);

function onScroll(e) {
  scrolled.value = e.target.scrollTop > 8;
}
</script>

<template>
  <!-- contextual selection bar -->
  <div class="ctx-bar" :class="{ 'is-open': ui.selecting }">
    <button class="icon-btn icon-btn--on-brand" aria-label="Clear selection" @click="ui.clearSelection()">
      <Icon name="close" :size="22" />
    </button>
    <span class="ctx-bar__count">{{ ui.selection.size }} selected</span>
    <div class="ctx-bar__actions">
      <button class="icon-btn icon-btn--on-brand" aria-label="Resume selected" @click="dl.batch('resume')">
        <Icon name="play" :size="20" />
      </button>
      <button class="icon-btn icon-btn--on-brand" aria-label="Pause selected" @click="dl.batch('pause')">
        <Icon name="pause" :size="20" />
      </button>
      <button class="icon-btn icon-btn--on-brand" aria-label="Delete selected" @click="dl.batch('remove')">
        <Icon name="trash" :size="20" />
      </button>
    </div>
  </div>

  <header class="appbar" :class="{ 'is-scrolled': scrolled }">
    <div class="appbar__row">
      <div class="col" style="padding-inline-start: 8px">
        <span class="appbar__hero-title">Downloads</span>
        <span class="t-body-small muted">
          {{ dl.counts.active }} active · {{ dl.counts.queued }} queued ·
          {{ dl.counts.complete }} done
        </span>
      </div>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Search downloads">
        <Icon name="search" :size="22" />
      </button>
      <button class="icon-btn" aria-label="Sort">
        <Icon name="sort" :size="22" />
      </button>
    </div>
  </header>

  <main class="app-main" @scroll.passive="onScroll">
    <div class="app-content col gap-4" style="padding-block: 16px">
      <div v-if="showDock" class="row-between">
        <span class="livepill">
          <span class="livepill__dot"></span>
          <strong>{{ formatSpeed(dl.totals.down) }}</strong>
          <span class="muted">&middot; {{ dl.counts.active }} active</span>
        </span>
        <RouterLink to="/queue" class="btn btn--text btn--sm"><Icon name="sliders" :size="16" /> Queue</RouterLink>
      </div>

      <div class="chip-rail" role="tablist" aria-label="Filter downloads">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          class="chip"
          :class="{ 'is-selected': ui.filter === f.id }"
          :aria-pressed="ui.filter === f.id"
          @click="ui.filter = f.id"
        >
          <Icon v-if="f.icon" :name="f.icon" :size="16" />
          {{ f.label }}
          <span v-if="dl.counts[f.id]" class="badge badge--neutral" style="height: 16px">
            {{ dl.counts[f.id] }}
          </span>
        </button>
      </div>

      <div v-if="list.length" class="dl-list">
        <DownloadCard v-for="item in list" :key="item.id" :item="item" />
      </div>

      <div v-else class="empty">
        <div class="empty__art"><Icon name="arrow-down-tray" :size="44" /></div>
        <div class="empty__title">Nothing here yet</div>
        <div class="empty__body">
          Paste a link, drop in a magnet, or browse the web — Surge sniffs every
          downloadable file and offers to accelerate it.
        </div>
        <div class="row gap-3" style="margin-top: 8px">
          <RouterLink to="/add" class="btn btn--filled"><Icon name="link" :size="18" /> Paste link</RouterLink>
          <RouterLink to="/add?kind=torrent" class="btn btn--outlined"><Icon name="magnet" :size="18" /> Magnet</RouterLink>
        </div>
      </div>
    </div>
  </main>
</template>
