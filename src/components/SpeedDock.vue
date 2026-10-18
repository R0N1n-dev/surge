<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import { useDownloadsStore } from '@/stores/downloads.js';
import { formatSpeed } from '@/lib/format.js';

const dl = useDownloadsStore();

const W = 320;
const H = 56;
const PAD = 4;

/**
 * Build the sparkline path from the bridge's byte-rate ring buffer.
 * Recomputed every tick (~700ms); cheap because it is a single pass over ≤120
 * points and produces two path strings.
 */
const path = computed(() => {
  const pts = dl.history.slice(-48).map(([, v]) => v);
  if (pts.length < 2) return { line: '', area: '', peak: null };
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const step = (W - PAD * 2) / (pts.length - 1);
  const coords = pts.map((p, i) => [PAD + i * step, H - PAD - ((p - min) / span) * (H - PAD * 2)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const area = `${line} L${last[0].toFixed(1)} ${H} L${coords[0][0].toFixed(1)} ${H} Z`;
  const peak = coords[pts.indexOf(max)];
  return { line, area, peak };
});

const down = computed(() => formatSpeed(dl.totals.down));
const up = computed(() => formatSpeed(dl.totals.up));
const active = computed(() => dl.totals.active);
const queued = computed(() => dl.totals.queued);
const running = computed(() => active.value > 0);
</script>

<template>
  <section class="dock" :aria-label="`Downloading at ${down}`">
    <div class="row-between">
      <div class="row gap-2">
        <span class="badge badge--neutral">
          <Icon name="zap" :size="12" />
          {{ running ? 'LIVE' : 'IDLE' }}
        </span>
        <span class="t-label-medium muted">segmented · torrent · yt-dlp</span>
      </div>
      <button class="btn btn--text btn--sm" @click="running ? dl.pauseAll() : dl.resumeAll()">
        <Icon :name="running ? 'pause' : 'play'" :size="16" />
        {{ running ? 'Pause all' : 'Resume all' }}
      </button>
    </div>

    <div class="dock__stats">
      <div>
        <div class="dock__stat-value">
          {{ down.replace(/\s?(\/s)$/, '') }}<span class="t-label-small muted">/s</span>
        </div>
        <div class="dock__stat-label">Download</div>
      </div>
      <div>
        <div class="dock__stat-value">
          {{ up.replace(/\s?(\/s)$/, '') }}<span class="t-label-small muted">/s</span>
        </div>
        <div class="dock__stat-label">Upload</div>
      </div>
      <div>
        <div class="dock__stat-value">
          {{ active }}<span class="t-label-small muted">/{{ active + queued }}</span>
        </div>
        <div class="dock__stat-label">Active</div>
      </div>
    </div>

    <div class="dock__graph">
      <svg :viewBox="`0 0 ${W} ${H}`" width="100%" :height="H" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="surge-spark-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--s-seed-secondary)" stop-opacity="0.42" />
            <stop offset="100%" stop-color="var(--s-seed-secondary)" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <line class="spark__grid" x1="0" :y1="H * 0.34" :x2="W" :y2="H * 0.34" />
        <line class="spark__grid" x1="0" :y1="H * 0.67" :x2="W" :y2="H * 0.67" />
        <path v-if="path.area" class="spark__area" :d="path.area" />
        <path v-if="path.line" class="spark__line" :d="path.line" />
        <circle v-if="path.peak" class="spark__peak" :cx="path.peak[0]" :cy="path.peak[1]" r="2.6" />
      </svg>
    </div>
  </section>
</template>
