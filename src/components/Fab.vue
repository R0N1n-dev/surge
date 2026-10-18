<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { useDownloadsStore } from '@/stores/downloads.js';
import { useUiStore } from '@/stores/ui.js';

const router = useRouter();
const dl = useDownloadsStore();
const ui = useUiStore();

const open = computed({ get: () => ui.fabOpen, set: (v) => (ui.fabOpen = v) });
const queued = computed(() => dl.counts.queued + dl.counts.active);

const ACTIONS = [
  { icon: 'link', label: 'Paste link', to: '/add' },
  { icon: 'magnet', label: 'Magnet / .torrent', to: '/add?kind=torrent' },
  { icon: 'clipboard', label: 'From clipboard', to: '/add?src=clipboard' },
  { icon: 'list', label: 'Batch links', to: '/add?mode=batch' },
  { icon: 'browser', label: 'Open browser', to: '/browser' },
];

function pick(action) {
  open.value = false;
  router.push(action.to);
}

function toggle() {
  open.value = !open.value;
  import('@/lib/native.js').then(({ bridge }) => bridge.haptic('light'));
}
</script>

<template>
  <!-- dim the page while the speedial is open -->
  <div v-if="open" class="scrim is-visible" style="z-index: 29" @click="open = false"></div>

  <div class="speedial" :class="{ 'is-open': open }">
    <div v-for="a in ACTIONS" :key="a.label" class="speedial__item">
      <span class="speedial__label">{{ a.label }}</span>
      <button class="mini-fab" :aria-label="a.label" @click="pick(a)">
        <Icon :name="a.icon" :size="20" />
      </button>
    </div>
  </div>

  <button
    class="fab fab--brand"
    :class="{ 'is-hidden': open }"
    :aria-label="open ? 'Close menu' : 'New download'"
    :aria-expanded="open"
    @click="toggle"
  >
    <Icon name="plus" :size="26" :style="{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 220ms cubic-bezier(.2,0,0,1)' }" />
    <span v-if="queued && !open" class="fab__badge">{{ queued }}</span>
  </button>
</template>
