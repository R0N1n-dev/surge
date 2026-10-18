<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { bridge, isNative, getPlugins } from '@/lib/native.js';
import { useUiStore } from '@/stores/ui.js';
import { detectSource } from '@/lib/url.js';
import { formatBytes } from '@/lib/format.js';

const router = useRouter();
const ui = useUiStore();

const url = ref('https://releases.ubuntu.com/noble/');
const loading = ref(false);

/**
 * On device this tab hosts a real native WebView fragment (the Capacitor
 * WebView can't safely nest a second one). The fragment reports every
 * `Content-Disposition` / media MIME it sees back over the bridge, and they
 * surface here as the sniffer banner — exactly the IDM "grab everything" flow.
 * On the web preview we simulate a page with three known assets.
 */
const SNIFFED = [
  { url: 'https://releases.ubuntu.com/noble/ubuntu-24.04.3-live-server-arm64.iso', size: 5.84 * 1024 ** 3 },
  { url: 'https://releases.ubuntu.com/noble/ubuntu-24.04.3-live-server-amd64.iso', size: 5.6 * 1024 ** 3 },
  { url: 'https://releases.ubuntu.com/noble/SHA256SUMS', size: 402 * 1024 },
];

const detected = computed(() => SNIFFED.map((s) => ({ ...s, info: detectSource(s.url) })));

/** On device, hand the URL to the native sniffing WebView instead of simulating. */
async function openNative() {
  if (!isNative) return;
  const p = await getPlugins();
  await p.Downloader.openSniffer({ url: url.value });
}

async function grabAll() {
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
      <button class="icon-btn" aria-label="Back"><Icon name="chevron-left" :size="20" /></button>
      <div class="browser__url"><Icon name="lock" :size="13" /><span class="truncate">{{ url }}</span></div>
      <button class="icon-btn" aria-label="Refresh" @click="loading = !loading"><Icon name="refresh" :size="20" /></button>
      <button class="icon-btn" aria-label="Open in native browser tab" @click="openNative"><Icon name="layers" :size="20" /></button>
    </div>
    <div class="progress progress--thin" style="border-radius: 0">
      <div class="progress__fill" :class="{ 'progress__fill--indeterminate': loading }" :style="{ width: loading ? '0%' : '100%' }"></div>
    </div>
  </header>

  <div class="sniffer">
    <Icon name="zap" :size="20" />
    <div class="col grow">
      <span class="t-title-small">{{ detected.length }} downloads detected on this page</span>
      <span class="t-body-small" style="opacity: 0.85">{{ detected[0].url.split('/').pop() }} · {{ formatBytes(detected[0].size) }}</span>
    </div>
    <button class="btn btn--filled btn--sm" @click="grabAll">Grab</button>
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
        </div>
      </div>

      <div class="t-body-small muted center" style="padding-block: 8px">
        <Icon name="shield" :size="14" /> Surge intercepts every link you tap and offers to accelerate it with up to 16 segments.
      </div>
    </div>
  </main>
</template>
