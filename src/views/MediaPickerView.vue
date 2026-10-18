<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { bridge } from '@/lib/native.js';
import { formatBytes } from '@/lib/format.js';
import { useUiStore } from '@/stores/ui.js';
import { useSettingsStore } from '@/stores/settings.js';
import { classify, displayPath, CATEGORIES } from '@/lib/classify.js';
import { detectSource } from '@/lib/url.js';

const router = useRouter();
const ui = useUiStore();
const settings = useSettingsStore();

/**
 * The link the composer handed over. Its real source kind drives the badge, the
 * extractor and the auto-filed category — hard-coding 'youtube' here made every
 * Instagram/TikTok/X link look like a YouTube download and file into others/.
 */
const pendingUrl = ref(sessionStorage.getItem('surge.pendingUrl') || 'https://youtu.be/aqz-KE-bpKQ');
const source = computed(() => detectSource(pendingUrl.value));

const meta = ref(null);
const loading = ref(true);
const tab = ref('video'); // video | audio | subs
const selectedRes = ref('1080p');
const convert = ref(false);
const bitrate = ref(320);
const subCount = ref(0);

/** Auto-filed destination. Classified once from the title; the user can pin a
 *  different category and we remember it for this source kind. */
const saveCat = ref(null);
const category = computed(() =>
  classify({
    name: meta.value?.title ?? '',
    url: pendingUrl.value,
    kind: source.value.kind,
    override: saveCat.value,
  }),
);

const BITRATES = [128, 192, 256, 320];

onMounted(async () => {
  meta.value = await bridge.probe(pendingUrl.value);
  loading.value = false;
  // Sensible default: the best format at or below 1080p that actually exists.
  const avail = meta.value?.formats?.map((f) => f.res) ?? [];
  if (!avail.includes('1080p') && avail.length) selectedRes.value = avail[avail.length - 1];
});

const formats = computed(() => meta.value?.formats ?? []);
const chosen = computed(() => formats.value.find((f) => f.res === selectedRes.value));

const totalSize = computed(() => {
  let b = chosen.value?.size ?? 0;
  if (convert.value) b += (bitrate.value * 1000 * (meta.value?.duration ?? 0)) / 8;
  return b;
});

function pick(res) {
  selectedRes.value = res;
  import('@/lib/native.js').then(({ bridge: b }) => b.haptic('light'));
}

async function start() {
  await bridge.add([
    {
      name: meta.value?.title ?? 'video',
      kind: source.value.kind,
      engine: 'ytdlp',
      url: pendingUrl.value,
      media: meta.value,
      selectedFormat: chosen.value,
      convertToMp3: convert.value,
      category: category.value.id,
      mp3Bitrate: bitrate.value,
      state: 'queued',
      totalBytes: chosen.value?.size ?? 0,
    },
  ]);
  ui.show(`Queued ${selectedRes.value}${convert.value ? ' + MP3' : ''}`);
  router.push('/');
}
</script>

<template>
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="chevron-left" :size="22" /></button>
      <span class="appbar__title truncate">Choose format</span>
      <button class="icon-btn" aria-label="More options"><Icon name="more-v" :size="22" /></button>
    </div>
  </header>

  <main class="app-main" style="padding-bottom: 110px">
    <div class="app-content col gap-4" style="padding-block: 12px">
      <div v-if="loading" class="col gap-3">
        <div class="skeleton" style="height: 88px"></div>
        <div class="skeleton" style="height: 44px"></div>
        <div class="skeleton" style="height: 180px"></div>
      </div>

      <template v-else-if="meta">
        <div class="card" style="display: grid; grid-template-columns: 112px 1fr">
          <div style="position: relative; background: var(--s-surface-container-highest); display: grid; place-items: center">
            <img v-if="meta.thumb" :src="meta.thumb" alt="" style="width: 100%; height: 100%; object-fit: cover" />
            <Icon v-else name="film" :size="32" cls="muted" />
          </div>
          <div class="col gap-1" style="padding: 12px">
            <div class="row gap-2">
              <span class="badge badge--youtube"><Icon name="youtube" :size="11" /> YouTube</span>
              <span class="t-body-small muted">{{ meta.views?.toLocaleString() }} views</span>
            </div>
            <div class="t-title-small clamp-2">{{ meta.title }}</div>
            <div class="t-body-small muted">{{ meta.channel }} · {{ meta.playlist }} in playlist</div>
          </div>
        </div>

        <div class="segmented" role="radiogroup" aria-label="Output type">
          <button class="segmented__opt" :class="{ 'is-active': tab === 'video' }" role="radio" :aria-checked="tab === 'video'" @click="tab = 'video'">
            <Icon name="video" :size="16" /> Video
          </button>
          <button class="segmented__opt" :class="{ 'is-active': tab === 'audio' }" role="radio" :aria-checked="tab === 'audio'" @click="tab = 'audio'">
            <Icon name="music" :size="16" /> Audio
          </button>
          <button class="segmented__opt" :class="{ 'is-active': tab === 'subs' }" role="radio" :aria-checked="tab === 'subs'" @click="tab = 'subs'">
            <Icon name="subtitles" :size="16" /> Subs
          </button>
        </div>

        <section v-if="tab === 'video'" class="section" style="padding-block: 0">
          <div class="section__head">
            <span class="section__title">Resolution</span>
            <span class="t-label-medium muted">{{ chosen?.codec?.toUpperCase() }} · {{ chosen?.fps }}fps</span>
          </div>
          <div class="quality-grid">
            <button
              v-for="f in formats"
              :key="f.res"
              class="quality"
              :aria-pressed="selectedRes === f.res"
              @click="pick(f.res)"
            >
              <span v-if="f.tag" class="quality__tag">{{ f.tag }}</span>
              <Icon v-else name="check" :size="18" cls="quality__check" />
              <span class="quality__label">{{ f.res }}</span>
              <span class="quality__sub">{{ formatBytes(f.size) }}</span>
            </button>
          </div>
        </section>

        <section v-if="tab === 'audio'" class="col gap-4" style="padding-block: 0">
          <div class="settings-group">
            <div class="setting">
              <span class="setting__icon"><Icon name="queue-music" :size="20" /></span>
              <span class="col"><span class="setting__title">Audio only (skip video)</span><span class="setting__sub">Downloads just the audio stream</span></span>
              <span class="switch" role="switch" :aria-checked="!convert" @click="convert = !convert"><span class="switch__thumb"></span></span>
            </div>
            <div class="setting">
              <span class="setting__icon setting__icon--accent"><Icon name="wand" :size="20" /></span>
              <span class="col"><span class="setting__title">Convert video to MP3 too</span><span class="setting__sub">ffmpeg runs after the download finishes</span></span>
              <span class="switch" role="switch" :aria-checked="convert" @click="convert = !convert"><span class="switch__thumb"></span></span>
            </div>
          </div>
          <div class="section" style="padding-block: 0">
            <div class="section__head"><span class="section__title">MP3 bitrate</span></div>
            <div class="chip-rail">
              <button v-for="b in BITRATES" :key="b" class="chip" :aria-pressed="bitrate === b" @click="bitrate = b">
                {{ b }} kbps
              </button>
            </div>
          </div>
        </section>

        <section class="section" style="padding-block: 0">
          <div class="section__head">
            <span class="section__title">Save to</span>
            <span class="t-label-medium muted">{{ settings.pathFor(category.id) }}</span>
          </div>
          <div class="card card--filled" style="padding: 10px 14px; display: flex; align-items: center; gap: 10px">
            <Icon :name="category.icon" :size="20" />
            <div class="col grow" style="min-width: 0">
              <span class="t-body-medium truncate">{{ displayPath(category.id, settings.root) }}</span>
              <span class="t-body-small muted">auto-filed by type · matched on {{ category.via }}</span>
            </div>
          </div>
          <div class="chip-rail" style="margin-top: 8px">
            <button
              v-for="c in CATEGORIES"
              :key="c.id"
              class="chip"
              :class="{ 'is-selected': category.id === c.id }"
              :aria-pressed="category.id === c.id"
              @click="saveCat = c.id; settings.rememberOverride('youtube', c.id)"
            >
              <Icon :name="c.icon" :size="16" /> {{ c.label }}
            </button>
          </div>
        </section>

        <section v-if="tab === 'subs'" class="col gap-2" style="padding-block: 0">
          <div v-for="s in meta.subtitles" :key="s" class="settings-group">
            <div class="setting">
              <span class="setting__icon"><Icon name="subtitles" :size="20" /></span>
              <span class="col"><span class="setting__title" style="font-size: 15px; line-height: 20px">{{ s }}</span></span>
              <span class="check" :class="{ 'is-checked': subCount }" role="checkbox" :aria-checked="!!subCount" @click="subCount = subCount ? 0 : 1"><Icon name="check" :size="14" /></span>
            </div>
          </div>
        </section>
      </template>
    </div>
  </main>

  <div style="position: fixed; inset-inline: 0; bottom: 0; padding: 12px 16px calc(12px + var(--sab)); background: var(--s-surface-container); border-top: 1px solid var(--s-outline-variant); display: flex; gap: 12px; align-items: center">
    <div class="col" style="min-width: 0">
      <span class="t-label-small muted">TOTAL</span>
      <span class="t-mono-medium">{{ formatBytes(totalSize) }}</span>
    </div>
    <div class="grow"></div>
    <button class="btn btn--filled btn--lg" @click="start"><Icon name="download" :size="20" /> Download</button>
  </div>
</template>
