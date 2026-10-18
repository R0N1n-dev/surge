<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { useDownloadsStore } from '@/stores/downloads.js';
import { useUiStore } from '@/stores/ui.js';

const route = useRoute();
const router = useRouter();
const dl = useDownloadsStore();
const ui = useUiStore();

// Four calm destinations. Browser and Queue live on Home and in the FAB
// speedial - a five-tab bar reads as clutter on a phone.
const TABS = [
  { to: '/', nav: 'home', icon: 'home', label: 'Home' },
  { to: '/downloads', nav: 'downloads', icon: 'download', label: 'Downloads' },
  { to: '/library', nav: 'library', icon: 'folder', label: 'Library' },
  { to: '/settings', nav: 'settings', icon: 'settings', label: 'Me' },
];

const active = computed(() => route.meta?.nav ?? 'downloads');

/** Badge counts — the only tabs that ever badge are Queue (waiting work). */
const badges = computed(() => ({
  downloads: dl.counts.active || 0,
}));

function go(tab) {
  // Haptics on tab change are subtle but make the bar feel physical.
  import('@/lib/native.js').then(({ bridge }) => bridge.haptic('light'));
  router.push(tab.to);
  ui.fabOpen = false;
}
</script>

<template>
  <nav class="nav" aria-label="Primary">
    <button
      v-for="tab in TABS"
      :key="tab.nav"
      class="nav__item"
      :aria-current="active === tab.nav ? 'page' : null"
      @click="go(tab)"
    >
      <span class="nav__indicator" aria-hidden="true"></span>
      <span class="nav__icon">
        <Icon :name="tab.icon" :size="22" />
      </span>
      <span class="nav__label">{{ tab.label }}</span>
      <span v-if="badges[tab.nav]" class="nav__badge">{{ badges[tab.nav] }}</span>
    </button>
  </nav>
</template>
