<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { detectSource, splitLinks, KIND } from '@/lib/url.js';
import { bridge } from '@/lib/native.js';
import { useUiStore } from '@/stores/ui.js';

const router = useRouter();
const route = useRoute();
const ui = useUiStore();

const text = ref('');
const batchMode = ref(false);
const clipboard = ref([]);

/** Live detection on every keystroke — the whole point of the composer. */
const info = computed(() => detectSource(text.value));

const KIND_ICON = {
  youtube: 'youtube',
  instagram: 'instagram',
  magnet: 'magnet',
  torrent: 'torrent',
  media: 'music',
  archive: 'archive',
  http: 'cloud',
  tiktok: 'instagram',
  twitter: 'globe',
};

async function paste() {
  text.value = (await bridge.readClipboard()) || text.value;
}

function submit() {
  const links = batchMode.value ? splitLinks(text.value) : [text.value.trim()];
  if (!links.length || !info.value.valid) return;
  // Extractors get the format picker; raw engines go straight to the queue
  // (torrents get the file-tree inspector first).
  if (info.value.engine === 'ytdlp' && links.length === 1) {
    sessionStorage.setItem('surge.pendingUrl', links[0]);
    router.push('/media');
    return;
  }
  if (info.value.kind === KIND.MAGNET || info.value.kind === KIND.TORRENT) {
    sessionStorage.setItem('surge.pendingUrl', links[0]);
    router.push('/torrent');
    return;
  }
  bridge.add(
    links.map((url) => {
      const d = detectSource(url);
      return { url, kind: d.kind, engine: d.engine, name: nameFor(d, url) };
    }),
  );
  ui.show(`${links.length} download${links.length === 1 ? '' : 's'} queued`);
  router.push('/');
}

function nameFor(d, url) {
  try {
    const u = new URL(url);
    return d.host || decodeURIComponent(u.pathname.split('/').pop() || u.hostname);
  } catch {
    return url;
  }
}

onMounted(async () => {
  // Deep-links from Home, the FAB speedial, share intents and the widget all
  // arrive as query params; ignoring them silently dropped the shared text.
  const q = route.query;
  if (q.mode === 'batch') batchMode.value = true;
  if (q.kind === 'torrent') text.value = 'magnet:?xt=urn:btih:';
  if (typeof q.text === 'string' && q.text) text.value = q.text;
  if (q.src === 'clipboard') {
    const c = await bridge.readClipboard();
    if (c) text.value = batchMode.value ? c : splitLinks(c)[0] ?? c;
  }
  const clip = (await bridge.readClipboard()) || '';
  if (clip) clipboard.value = splitLinks(clip).slice(0, 3).map((l) => ({ url: l, info: detectSource(l) }));
});
</script>

<template>
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Close" @click="router.back()">
        <Icon name="close" :size="22" />
      </button>
      <span class="appbar__title">New download</span>
      <button class="icon-btn" aria-label="Scan QR code">
        <Icon name="scan" :size="22" />
      </button>
    </div>
  </header>

  <main class="app-main">
    <div class="app-content col gap-4" style="padding-block: 16px">
      <div class="composer">
        <span style="padding: 10px; color: var(--s-primary)">
          <Icon name="link" :size="22" />
        </span>
        <textarea
          v-model="text"
          class="composer__input"
          :rows="batchMode ? 5 : 2"
          placeholder="Paste a link, magnet or .torrent URL…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        ></textarea>
        <button class="icon-btn" aria-label="Paste from clipboard" style="background: var(--s-primary-container); color: var(--s-on-primary-container)" @click="paste">
          <Icon name="clipboard" :size="20" />
        </button>
      </div>

      <!-- live detection verdict -->
      <div v-if="text.trim()" class="card" :style="{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', borderColor: info.valid ? 'var(--s-primary)' : 'var(--s-error)' }">
        <span :style="{ width: '36px', height: '36px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: 'var(--s-surface-container-highest)', color: 'var(--s-on-surface-variant)' }">
          <Icon :name="KIND_ICON[info.kind] ?? 'file'" :size="20" />
        </span>
        <div class="col grow">
          <span class="t-title-small">{{ info.label }}</span>
          <span class="t-body-small muted">
            {{ info.valid ? `handled by ${info.engine === 'ytdlp' ? 'yt-dlp (format picker)' : info.engine === 'torrent' ? 'libtorrent (file picker)' : 'segmented HTTP engine'}` : info.reason }}
          </span>
        </div>
        <span :style="{ color: info.valid ? 'var(--s-success)' : 'var(--s-error)' }">
          <Icon :name="info.valid ? 'check-circle' : 'alert'" :size="22" />
        </span>
      </div>

      <div class="row gap-3">
        <button class="btn btn--filled btn--lg grow" :disabled="!info.valid" @click="submit">
          <Icon name="download" :size="20" />
          {{ batchMode ? 'Add all links' : 'Add download' }}
        </button>
      </div>

      <div class="row gap-2">
        <button class="chip" :aria-pressed="batchMode" @click="batchMode = !batchMode">
          <Icon name="list" :size="16" /> Batch mode
        </button>
        <button class="chip" @click="router.push('/add?kind=torrent')">
          <Icon name="magnet" :size="16" /> Magnet
        </button>
        <button class="chip" @click="router.push('/browser')">
          <Icon name="browser" :size="16" /> Browser
        </button>
      </div>

      <section v-if="clipboard.length" class="section" style="padding-block: 0">
        <div class="section__head">
          <span class="section__title">From clipboard</span>
          <button class="section__action" @click="clipboard = []">Clear</button>
        </div>
        <div class="col gap-2">
          <button
            v-for="c in clipboard"
            :key="c.url"
            class="card stateful"
            style="padding: 10px 14px; display: flex; align-items: center; gap: 12px; text-align: start"
            @click="text = c.url"
          >
            <span style="color: var(--s-on-surface-variant)">
              <Icon :name="KIND_ICON[c.info.kind] ?? 'file'" :size="20" />
            </span>
            <span class="col grow" style="min-width: 0">
              <span class="t-body-medium truncate">{{ c.url }}</span>
              <span class="t-body-small muted">{{ c.info.label }}</span>
            </span>
            <span class="badge badge--neutral">Use</span>
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
