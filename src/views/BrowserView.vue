<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { bridge, isNative, getPlugins, onEvent } from '@/lib/native.js';
import { useUiStore } from '@/stores/ui.js';
import { detectSource } from '@/lib/url.js';
import { formatBytes } from '@/lib/format.js';

const router = useRouter();
const ui = useUiStore();

const url = ref('https://releases.ubuntu.com/noble/');
const loading = ref(false);
const hits = ref([]);

/**
 * On device this tab hands the URL to a real native WebView activity (the
 * Capacitor WebView can't safely nest a second one). The activity sniffs every
 * response whose MIME is media/archive, or that carries a Content-Disposition,
 * and publishes the hits; they arrive here over the bridge and fill the banner
 * — exactly the IDM "grab everything" flow.
 *
 * On the web preview there is no native sniffer, so we seed the same list it
 * would have produced, keeping `npm run dev` faithful.
 */
const DEMO = [
  { url: 'https://releases.ubuntu.com/noble/ubuntu-24.04.3-live-server-arm64.iso', size: 5.84 * 1024 ** 3 },
  { url: 'https://releases.ubuntu.com/noble/ubuntu-24.04.3-live-server-amd64.iso', size: 5.6 * 1024 ** 3 },
  { url: 'https://releases.ubuntu.com/noble/SHA256SUMS', size: 402 * 1024 },
];

const detected = computed(() => hits.value.map((s) => ({ ...s, info: detectSource(s.url) })));

let off = null;

/** Merge newly sniffed URLs in, newest first, without duplicating. */
function absorb(items) {
  const known = new Set(hits.value.map((h) => h.url));
  const fresh = items
    .filter((i) => i?.url && !known.has(i.url))
    .map((i) => ({ url: i.url, size: i.size || 0 }));
  if (fresh.length) hits.value = [...fresh, ...hits.value].slice(0, 40);
}

function seedDemo() {
  hits.value = DEMO.map((d) => ({ ...d }));
}

onMounted(() => {
  if (isNative) {
    off = onEvent((ev) => {
      if (ev.type === 'sniffed' && Array.isArray(ev.items)) absorb(ev.items);
    });
  } else {
    seedDemo();
  }
});
onUnmounted(() => off?.());

/** On device, hand the URL to the native sniffing WebView instead of simulating. */
async function openNative() {
  if (!isNative) return;
  const p = await getPlugins();
  await p.Downloader.openSniffer({ url: url.value });
}

/** Reload: clear stale hits, then re-open the native sniffer (or re-seed). */
async function reload() {
  hits.value = [];
  loading.value = true;
  if (isNative) {
    await openNative();
    loading.value = false;
  } else {
    setTimeout(() => {
      seedDemo();
      loading.value = false;
    }, 500);
  }
}

/** Back leaves the tab the same way the hardware key does. */
function goBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/');
}

async function grabAll() {
  if (!detected.value.length) return;
  await bridge.add(
    detected.value.map((d) => ({
      url: d.url,
      kind: d.info.kind,
      engine: d.info.engine,
      name: d.url.split('/').pop(),
      totalBytes: d.size,
      state: 'queued',
    })),
  );
  ui.show(`${detected.value.length} files queued`);
  router.push('/');
}

function grabOne(d) {
  bridge.add([{ url: d.url, kind: d.info.kind, engine: d.info.engine, name: d.url.split('/').pop(), totalBytes: d.size, state: 'queued' }]);
  ui.show('Queued ' + d.url.split('/').pop());
}
</script>

<template>
  <header class="appbar" style="padding: 0">
    <div class="browser__bar">
      <button class="icon-btn" aria-label="Back" @click="goBack"><Icon name="chevron-left" :size="20" /></button>
      <div class="browser__url"><Icon name="lock" :size="13" /><span class="truncate">{{ url }}</span></div>
      <button class="icon-btn" aria-label="Reload" @click="reload"><Icon name="refresh" :size="20" /></button>
      <button class="icon-btn" aria-label="Open in native browser tab" @click="openNative"><Icon name="layers" :size="20" /></button>
    </div>
    <div class="progress progress--thin" style="border-radius: 0">
      <div class="progress__fill" :class="{ 'progress__fill--indeterminate': loading }" :style="{ width: loading ? '0%' : '100%' }"></div>
    </div>
  </header>

  <div class="sniffer">
    <Icon name="zap" :size="20" />
    <div class="col grow">
      <template v-if="detected.length">
        <span class="t-title-small">{{ detected.length }} download{{ detected.length === 1 ? '' : 's' }} detected on this page</span>
        <span class="t-body-small" style="opacity: 0.85">{{ detected[0].url.split('/').pop() }} · {{ formatBytes(detected[0].size) }}</span>
      </template>
      <template v-else>
        <span class="t-title-small">Listening for downloads</span>
        <span class="t-body-small" style="opacity: 0.85">
          {{ isNative ? 'Browse a page — Surge grabs every file the site offers.' : 'No downloadable files on this page yet.' }}
        </span>
      </template>
    </div>
    <button v-if="detected.length" class="btn btn--filled btn--sm" @click="grabAll">Grab all</button>
  </div>

  <main class="app-main">
    <div class="app-content col gap-4" style="padding-block: 16px">
      <div class="card" style="padding: 20px">
        <div class="t-headline-small" style="margin-bottom: 6px">Ubuntu 24.04.3 LTS</div>
        <div class="t-body-medium muted" style="margin-bottom: 16px">Noble Numbat — release page</div>
        <div class="divider" style="margin-bottom: 16px"></div>
        <div class="col gap-3">
          <button
            v-for="(d, i) in detected"
            :key="d.url"
            class="row gap-3 stateful"
            :style="{ padding: '10px', borderRadius: '12px', background: i === 0 ? 'var(--s-primary-container)' : 'var(--s-surface-container-high)', textAlign: 'start' }"
            @click="grabOne(d)"
          >
            <span :style="{ color: i === 0 ? 'var(--s-on-primary-container)' : 'var(--s-on-surface-variant)' }">
              <Icon :name="i === 0 ? 'check-circle' : 'file'" :size="20" />
            </span>
            <span class="col grow">
              <span class="t-body-medium">{{ d.url.split('/').pop() }}</span>
              <span class="t-body-small muted">{{ formatBytes(d.size) }} · {{ d.info.label }}</span>
            </span>
            <span class="icon-btn" style="color: var(--s-primary)"><Icon name="download" :size="20" /></span>
          </button>
          <div v-if="!detected.length" class="t-body-small muted" style="padding: 6px 2px">
            Files the page links to — media, images, PDFs, archives — appear here as
            soon as the browser sees them.
          </div>
        </div>
      </div>

      <div class="t-body-small muted center" style="padding-block: 8px">
        <Icon name="shield" :size="14" /> Surge intercepts every link you tap and offers to accelerate it with up to 16 segments.
      </div>
    </div>
  </main>
</template>
