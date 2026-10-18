<script setup>
/**
 * Home — the SnapTube-influenced front door.
 *
 * One hero action (the paste bar), four quiet shortcuts, a discover rail and
 * only the downloads that are actually moving. Everything else — filters,
 * segments, schedules — lives a tap deeper, where the people who want it can
 * find it without the rest of us wading through it.
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import DownloadCard from '@/components/DownloadCard.vue';
import { useDownloadsStore } from '@/stores/downloads.js';
import { bridge } from '@/lib/native.js';

const router = useRouter();
const dl = useDownloadsStore();

const QUICK = [
  { icon: 'browser', label: 'Browser', to: '/browser' },
  { icon: 'magnet', label: 'Torrent', to: '/add?kind=torrent' },
  { icon: 'list', label: 'Batch', to: '/add?mode=batch' },
  { icon: 'music', label: 'MP3', to: '/add?audio=1' },
];

const moving = computed(() => dl.items.filter((i) => i.state === 'active' || i.state === 'seeding').slice(0, 3));

async function pasteAndGo() {
  const text = (await bridge.readClipboard()) || '';
  router.push(text ? `/add?text=${encodeURIComponent(text)}` : '/add');
}
</script>

<template>
  <main class="app-main" style="padding-bottom: 96px">
    <div class="app-content" style="padding-block: 8px">
      <div class="pagehero">
        <span class="pagehero__title">Surge</span>
        <span class="pagehero__sub">Paste anything. We'll find the fastest way to keep it.</span>
      </div>

      <button class="searchbar" aria-label="Paste a link to download" @click="pasteAndGo">
        <Icon name="search" :size="22" />
        <span class="searchbar__input" style="display: flex; align-items: center; opacity: 0.75">
          Paste a link, or search YouTube…
        </span>
        <span class="searchbar__cta"><Icon name="clipboard" :size="20" /></span>
      </button>

      <div style="height: 22px"></div>

      <div class="quick">
        <button v-for="q in QUICK" :key="q.label" class="quick__btn" @click="router.push(q.to)">
          <Icon :name="q.icon" :size="22" />
          <span class="quick__label">{{ q.label }}</span>
        </button>
      </div>

      <template v-if="moving.length">
        <div style="height: 30px"></div>
        <div class="row-between" style="margin-bottom: 14px">
          <span class="eyebrow">In progress</span>
          <RouterLink to="/downloads" class="t-label-medium" style="color: var(--s-primary)">Downloads</RouterLink>
        </div>
        <div class="dl-list">
          <DownloadCard v-for="item in moving" :key="item.id" :item="item" />
        </div>
      </template>
    </div>
  </main>
</template>
