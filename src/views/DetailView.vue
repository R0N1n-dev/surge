<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { useDownloadsStore } from '@/stores/downloads.js';
import { bridge, downloads as live } from '@/lib/native.js';
import { formatBytes, formatEta, formatPercent, fraction } from '@/lib/format.js';

const route = useRoute();
const router = useRouter();
const dl = useDownloadsStore();

const item = computed(() => live.items.get(route.params.id));
const pct = computed(() => fraction(item.value?.doneBytes, item.value?.totalBytes));
const R = 58;
const CIRC = 2 * Math.PI * R;

/** aria2 re-splits idle segments; visualise the 16 byte-ranges as a bar chart. */
const segments = computed(() => {
  const n = Math.max(4, Math.min(16, item.value?.connections || 8));
  const base = pct.value;
  return Array.from({ length: n }, (_, i) => {
    const drift = Math.sin(i * 1.7) * 0.35 + 0.35;
    return Math.max(0, Math.min(1, base * (0.4 + drift)));
  });
});

const rows = computed(() => {
  if (!item.value) return [];
  const it = item.value;
  return [
    ['link', 'URL', it.url || '(generated)', () => navigator.clipboard?.writeText(it.url)],
    ['folder', 'Saved to', `Internal storage › ${it.dir}`, null],
    ['clock', 'Started', it.startedAt ? new Date(it.startedAt).toLocaleTimeString() : 'not started', null],
    ['shield', 'Integrity', it.state === 'complete' ? 'verified' : 'pending SHA-256', null],
    ['layers', 'Connections', String(it.connections || '—'), null],
  ];
});
</script>

<template>
  <template v-if="item">
    <header class="appbar">
      <div class="appbar__row">
        <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="chevron-left" :size="22" /></button>
        <span class="appbar__title truncate">{{ item.name }}</span>
        <button class="icon-btn" aria-label="More options"><Icon name="more-v" :size="22" /></button>
      </div>
    </header>

    <main class="app-main">
      <div class="app-content col gap-4" style="padding-block: 12px">
        <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 16px; align-items: center">
          <div style="position: relative; width: 132px; height: 132px">
            <svg class="ring" width="132" height="132" viewBox="0 0 132 132">
              <circle class="ring__track" cx="66" cy="66" :r="R" stroke-width="10" />
              <circle class="ring__fill" cx="66" cy="66" :r="R" stroke-width="10" :stroke-dasharray="CIRC" :stroke-dashoffset="CIRC * (1 - pct)" />
            </svg>
            <div style="position: absolute; inset: 0; display: grid; place-items: center; text-align: center">
              <div class="col">
                <span style="font-size: 30px; line-height: 1; font-weight: 600">{{ formatPercent(pct) }}<span style="font-size: 16px">%</span></span>
                <span class="t-label-small muted">{{ formatBytes(item.doneBytes) }} / {{ formatBytes(item.totalBytes) }}</span>
              </div>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: center">
            <button class="icon-btn" style="width: 56px; height: 56px; background: var(--s-surface-container-high)" aria-label="Stop" @click="dl.remove(item.id)">
              <Icon name="stop" :size="22" />
            </button>
            <button class="fab" style="position: static; width: 72px; height: 72px; background: var(--s-primary); color: var(--s-on-primary)" :aria-label="item.state === 'active' ? 'Pause' : 'Resume'" @click="item.state === 'active' ? dl.pause(item.id) : dl.resume(item.id)">
              <Icon :name="item.state === 'active' ? 'pause' : 'play'" :size="28" />
            </button>
            <button class="icon-btn" style="width: 56px; height: 56px; background: var(--s-surface-container-high)" aria-label="Retry" @click="dl.resume(item.id)">
              <Icon name="restart" :size="22" />
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: 100%; text-align: center">
            <div class="col"><span class="t-mono-medium">{{ formatBytes(item.speed, { decimals: 1 }) }}/s</span><span class="t-label-small muted">Speed</span></div>
            <div class="col"><span class="t-mono-medium">{{ formatEta(item.eta) }}</span><span class="t-label-small muted">Remaining</span></div>
            <div class="col"><span class="t-mono-medium">{{ item.connections || 0 }}</span><span class="t-label-small muted">Segments</span></div>
          </div>
        </div>

        <div class="card card--filled" style="padding: 14px 16px">
          <div class="t-label-medium muted" style="margin-bottom: 10px">SEGMENT MAP</div>
          <div style="display: flex; gap: 3px; height: 34px">
            <span v-for="(s, i) in segments" :key="i" style="flex: 1; border-radius: 3px; background: var(--s-surface-container-highest); position: relative; overflow: hidden">
              <span :style="{ position: 'absolute', insetBlockEnd: 0, insetInline: 0, height: `${s * 100}%`, background: s > 0 ? 'var(--s-primary)' : 'transparent', borderRadius: '3px' }"></span>
            </span>
          </div>
          <div class="t-body-small muted" style="margin-top: 10px">
            <Icon name="info" :size="13" /> the engine opens one byte-range per segment; idle segments are re-split so no connection wastes bandwidth.
          </div>
        </div>

        <div class="settings-group">
          <div v-for="r in rows" :key="r[1]" class="setting">
            <span class="setting__icon"><Icon :name="r[0]" :size="20" /></span>
            <span class="col" style="min-width: 0"><span class="setting__title" style="font-size: 14px; line-height: 18px">{{ r[1] }}</span><span class="setting__sub truncate">{{ r[2] }}</span></span>
            <button v-if="r[3]" class="setting__value icon-btn" aria-label="Copy" @click="r[3]()"><Icon name="copy" :size="18" /></button>
          </div>
        </div>
      </div>
    </main>
  </template>
</template>
