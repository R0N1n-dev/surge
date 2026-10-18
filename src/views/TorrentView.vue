<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { bridge } from '@/lib/native.js';
import { formatBytes, fraction, formatPercent } from '@/lib/format.js';

const router = useRouter();
const meta = ref(null);
const loading = ref(true);
const seed = ref(true);
const wifiOnly = ref(false);

onMounted(async () => {
  const url = sessionStorage.getItem('surge.pendingUrl') || 'magnet:?xt=urn:btih:7a6f2e';
  meta.value = await bridge.inspectTorrent(url);
  loading.value = false;
});

const selectedBytes = computed(() => (meta.value?.files ?? []).filter((f) => f.selected).reduce((a, b) => a + b.size, 0));
const selectedCount = computed(() => (meta.value?.files ?? []).filter((f) => f.selected).length);

function toggleFile(f) {
  f.selected = !f.selected;
}

async function start() {
  await bridge.add([
    {
      name: meta.value?.name ?? 'torrent',
      kind: 'magnet',
      engine: 'aria2',
      url: sessionStorage.getItem('surge.pendingUrl') ?? '',
      totalBytes: selectedBytes.value,
      files: meta.value?.files ?? null,
      seeds: meta.value?.seeds ?? 0,
      peers: meta.value?.peers ?? 0,
      state: 'queued',
    },
  ]);
  router.push('/');
}
</script>

<template>
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="chevron-left" :size="22" /></button>
      <span class="appbar__title truncate">{{ meta?.name ?? 'Torrent' }}</span>
      <button class="icon-btn" aria-label="Share"><Icon name="share" :size="20" /></button>
    </div>
  </header>

  <main class="app-main" style="padding-bottom: 96px">
    <div class="app-content col gap-4" style="padding-block: 12px">
      <div v-if="loading" class="skeleton" style="height: 220px"></div>

      <template v-else-if="meta">
        <div class="card card--filled" style="padding: 16px">
          <div class="row-between" style="margin-bottom: 10px">
            <span class="badge badge--torrent"><Icon name="torrent" :size="12" /> Magnet · DHT</span>
            <span class="t-mono-small muted">{{ formatBytes(meta.totalBytes) }}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center">
            <div v-for="s in [[meta.seeds, 'Seeds', 'seedling'], [meta.peers, 'Peers', 'users'], [meta.files.length, 'Files', 'file'], [meta.trackers.length, 'Trackers', 'server']]" :key="s[1]" class="col gap-1" style="align-items: center">
              <span style="color: var(--s-on-surface-variant)"><Icon :name="s[2]" :size="16" /></span>
              <span class="t-mono-small" style="color: var(--s-on-surface)">{{ s[0] }}</span>
              <span class="t-label-small muted">{{ s[1] }}</span>
            </div>
          </div>
        </div>

        <section class="section" style="padding-block: 0">
          <div class="section__head">
            <span class="section__title">Select files</span>
            <button class="section__action" @click="meta.files.forEach((f) => (f.selected = true))">Select all</button>
          </div>
          <div class="card" style="padding: 4px 8px">
            <div class="tree">
              <div v-for="f in meta.files" :key="f.path" class="tree__row" :class="{ 'is-dir': f.dir }">
                <span class="check" :class="{ 'is-checked': f.selected }" role="checkbox" :aria-checked="f.selected" @click="toggleFile(f)">
                  <Icon name="check" :size="14" />
                </span>
                <span class="col" style="min-width: 0">
                  <span class="tree__name">{{ f.path.split('/').pop() || f.path }}</span>
                </span>
                <span class="tree__size">{{ formatBytes(f.size) }}</span>
              </div>
            </div>
          </div>
          <div class="t-body-small muted" style="padding: 10px 4px 0">
            <Icon name="info" :size="13" /> {{ selectedCount }} of {{ meta.files.length }} files selected ·
            {{ formatBytes(selectedBytes) }} · libtorrent streams finished pieces as they land.
          </div>
        </section>

        <div class="settings-group">
          <div class="setting">
            <span class="setting__icon setting__icon--brand"><Icon name="seedling" :size="20" /></span>
            <span class="col"><span class="setting__title">Seed after completion</span><span class="setting__sub">Ratio limit 2.0, then stop</span></span>
            <span class="switch" role="switch" :aria-checked="seed" @click="seed = !seed"><span class="switch__thumb"></span></span>
          </div>
          <div class="setting">
            <span class="setting__icon"><Icon name="wifi" :size="20" /></span>
            <span class="col"><span class="setting__title">Wi-Fi only</span><span class="setting__sub">Pause on mobile data</span></span>
            <span class="switch" role="switch" :aria-checked="wifiOnly" @click="wifiOnly = !wifiOnly"><span class="switch__thumb"></span></span>
          </div>
        </div>
      </template>
    </div>
  </main>

  <div style="position: fixed; inset-inline: 0; bottom: 0; padding: 12px 16px calc(12px + var(--sab)); background: var(--s-surface-container); border-top: 1px solid var(--s-outline-variant); display: flex; gap: 10px">
    <button class="btn btn--outlined grow" @click="router.back()"><Icon name="close" :size="18" /> Cancel</button>
    <button class="btn btn--filled grow" :disabled="!selectedCount" @click="start">
      <Icon name="download" :size="18" /> Start {{ selectedCount }} file{{ selectedCount === 1 ? '' : 's' }}
    </button>
  </div>
</template>
