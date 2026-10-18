<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { formatBytes, formatEta, formatPercent, fraction } from '@/lib/format.js';
import { KIND } from '@/lib/url.js';
import { CATEGORIES } from '@/lib/classify.js';
import { useUiStore } from '@/stores/ui.js';
import { useDownloadsStore } from '@/stores/downloads.js';

const props = defineProps({
  item: { type: Object, required: true },
});

const router = useRouter();
const ui = useUiStore();
const dl = useDownloadsStore();

/* ------------------------------------------------------------- derived ----- */

const BADGES = {
  [KIND.YOUTUBE]: ['youtube', 'YouTube'],
  [KIND.INSTAGRAM]: ['instagram', 'Instagram'],
  [KIND.TIKTOK]: ['instagram', 'TikTok'],
  [KIND.TWITTER]: ['http', 'X'],
  [KIND.MAGNET]: ['torrent', 'Magnet'],
  [KIND.TORRENT]: ['torrent', 'Torrent'],
  [KIND.MEDIA]: ['audio', 'Media'],
  [KIND.ARCHIVE]: ['neutral', 'Archive'],
  [KIND.HTTP]: ['http', 'HTTPS'],
};

const THUMBS = {
  [KIND.YOUTUBE]: 'youtube',
  [KIND.INSTAGRAM]: 'instagram',
  [KIND.TIKTOK]: 'instagram',
  [KIND.TWITTER]: 'globe',
  [KIND.MAGNET]: 'torrent',
  [KIND.TORRENT]: 'torrent',
  [KIND.MEDIA]: 'music',
  [KIND.ARCHIVE]: 'archive',
  [KIND.HTTP]: 'cloud',
};

const CATEGORY_ICON = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.icon]));

const STATE_LABEL = {
  queued: 'Queued',
  active: 'Downloading',
  paused: 'Paused',
  complete: 'Complete',
  error: 'Failed',
  seeding: 'Seeding',
};

const badge = computed(() => BADGES[props.item.kind] ?? BADGES[KIND.HTTP]);
const thumbIcon = computed(() => THUMBS[props.item.kind] ?? 'file');
const pct = computed(() => fraction(props.item.doneBytes, props.item.totalBytes));
const isMedia = computed(() => !!props.item.media?.duration);

const metaLine = computed(() => {
  const it = props.item;
  const bits = [];
  if (it.selectedFormat) bits.push(it.selectedFormat.res);
  if (it.connections) bits.push(`${it.connections} conn.`);
  if (it.kind === KIND.MAGNET || it.kind === KIND.TORRENT) bits.push(`S ${it.seeds} · P ${it.peers}`);
  if (it.convertToMp3) bits.push(`→ MP3 ${it.mp3Bitrate}`);
  if (it.state === 'complete') bits.push(it.dir);
  if (it.state === 'error' && it.error) bits.push(it.error);
  return bits.join(' · ');
});

const selected = computed(() => ui.selection.has(props.item.id));

/* ----------------------------------------------------------- gestures ------ */

const LONG_PRESS_MS = 420;
let pressTimer = null;
let pressStart = null;
const dragX = ref(0);
const swiped = ref(false);

function onPointerDown(e) {
  pressStart = { x: e.clientX, y: e.clientY, moved: false };
  pressTimer = setTimeout(() => {
    if (pressStart?.moved) return;
    ui.toggleSelect(props.item.id);
    import('@/lib/native.js').then(({ bridge }) => bridge.haptic('medium'));
    pressStart = null;
  }, LONG_PRESS_MS);
}

function onPointerMove(e) {
  if (!pressStart) return;
  const dx = e.clientX - pressStart.x;
  const dy = e.clientY - pressStart.y;
  if (Math.abs(dy) > 10 || Math.abs(dx) > 10) pressStart.moved = true;
  // Only track horizontal drags for the swipe-to-delete reveal.
  if (Math.abs(dx) > Math.abs(dy) && !ui.selecting) dragX.value = Math.min(0, Math.max(-110, dx));
}

function onPointerUp() {
  clearTimeout(pressTimer);
  const wasTap = pressStart && !pressStart.moved;
  // Snap the swipe: past the halfway mark it stays open, else it springs back.
  swiped.value = dragX.value < -56;
  dragX.value = 0;
  if (wasTap) {
    if (ui.selecting) ui.toggleSelect(props.item.id);
    else if (!swiped.value) router.push(`/detail/${props.item.id}`);
  }
  pressStart = null;
}

function onPointerCancel() {
  clearTimeout(pressTimer);
  pressStart = null;
  dragX.value = 0;
}

/* ------------------------------------------------------------- actions ----- */

const primaryAction = computed(() => {
  switch (props.item.state) {
    case 'active':
    case 'seeding':
      return { icon: 'pause', label: 'Pause', fn: () => dl.pause(props.item.id) };
    case 'paused':
    case 'queued':
      return { icon: 'play', label: 'Resume', fn: () => dl.resume(props.item.id) };
    case 'error':
      return { icon: 'restart', label: 'Retry', fn: () => dl.resume(props.item.id) };
    default:
      return { icon: 'play', label: 'Open', fn: () => import('@/lib/native.js').then(({ bridge }) => bridge.open(props.item.id)) };
  }
});

async function onDelete() {
  await dl.remove(props.item.id);
}
</script>

<template>
  <article
    class="dl"
    :class="{ 'is-selected': selected }"
    :data-state="item.state"
    :aria-label="`${item.name}, ${STATE_LABEL[item.state]}`"
    :style="dragX ? { transform: `translateX(${dragX}px)` } : null"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @contextmenu.prevent
  >
    <span class="dl__spine" aria-hidden="true"></span>

    <div class="dl__thumb">
      <Icon :name="thumbIcon" :size="24" />
      <span v-if="isMedia" class="dl__thumb-dur">
        {{ Math.floor(item.media.duration / 60) }}:{{ String(item.media.duration % 60).padStart(2, '0') }}
      </span>
    </div>

    <div class="dl__body">
      <div class="dl__name" :title="item.name">{{ item.name }}</div>

      <div class="dl__meta">
        <span class="badge" :class="`badge--${badge[0]}`">{{ badge[1] }}</span>
        <!-- auto-filed destination: the 1DM-style category this landed in -->
        <span v-if="item.category" class="badge badge--neutral">
          <Icon :name="CATEGORY_ICON[item.category] ?? 'folder'" :size="11" />
          {{ item.category }}
        </span>
        <template v-if="metaLine">
          <span class="truncate">{{ metaLine }}</span>
          <span class="dot"></span>
        </template>
        <span>{{ STATE_LABEL[item.state] }}</span>
      </div>

      <div
        class="progress"
        :class="{
          'progress--paused': item.state === 'paused',
          'progress--done': item.state === 'complete',
          'progress--error': item.state === 'error',
          'progress--seeding': item.state === 'seeding',
          'progress--queued': item.state === 'queued',
        }"
        role="progressbar"
        :aria-valuenow="Math.round(pct * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="progress__fill"
          :class="{ 'progress__fill--striped': item.state === 'active' }"
          :style="{ width: `${pct * 100}%` }"
        ></div>
        <div v-if="item.connections > 1 && item.state === 'active'" class="progress__segments" aria-hidden="true">
          <span v-for="n in Math.min(item.connections, 8)" :key="n"></span>
        </div>
      </div>

      <div class="dl__numbers">
        <span v-if="item.state === 'active' && item.speed > 0" class="dl__speed">
          <Icon name="download" :size="12" />
          {{ formatBytes(item.speed, { decimals: 1 }) }}/s
        </span>
        <span v-if="item.state === 'active' && item.eta" class="dl__eta">{{ formatEta(item.eta) }} left</span>
        <span class="dl__eta" style="margin-inline-start: auto">
          {{ formatBytes(item.doneBytes) }}<template v-if="item.totalBytes"> / {{ formatBytes(item.totalBytes) }}</template>
          · {{ formatPercent(pct) }}%
        </span>
      </div>
    </div>

    <div class="dl__actions">
      <button class="icon-btn" :aria-label="primaryAction.label" @click.stop="primaryAction.fn()">
        <Icon :name="primaryAction.icon" :size="20" />
      </button>
      <button class="icon-btn" aria-label="More options" @click.stop="router.push(`/detail/${item.id}`)">
        <Icon name="more-v" :size="20" />
      </button>
    </div>

    <!-- Swipe-to-delete lives under the row and reveals as you drag left. -->
    <div class="dl__swipe" :class="{ 'is-open': swiped }" aria-hidden="true">
      <Icon name="trash" :size="20" />
      <span class="t-label-large">Delete</span>
      <button class="btn btn--danger btn--sm" style="position:absolute;inset:0;opacity:0" @click.stop="onDelete">
        Delete
      </button>
    </div>
  </article>
</template>
