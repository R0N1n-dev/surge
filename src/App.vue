<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import BottomNav from '@/components/BottomNav.vue';
import Fab from '@/components/Fab.vue';
import Overlays from '@/components/Overlays.vue';
import { useThemeStore } from '@/stores/theme.js';
import { useAndroidBack } from '@/composables/useAndroidBack.js';

const route = useRoute();
const theme = useThemeStore();

// Hardware/gesture back: unwind layers, pop sections, exit from Home.
useAndroidBack();

/** Modal routes (add / pickers / detail) hide the nav + FAB to stay focused. */
const isModal = computed(() => !!route.meta?.modal);

/**
 * Pull-to-refresh on the main scroll container. Implemented by hand rather than
 * with a library: 40 lines of pointer maths beats shipping 30KB to get a
 * rubber-band that fights the WebView's own overscroll.
 */
let startY = null;
let pulling = false;
const pull = { el: null };

function onTouchStart(e) {
  // e.target is not guaranteed to be an Element (and may be null on some
  // synthetic touches); a bare .closest() here threw inside the global handler
  // and produced the generic "Something went wrong" toast on a stray tap.
  const el = e.target?.closest?.('.app-main');
  if (!el || el.scrollTop > 0) return;
  startY = e.touches[0].clientY;
  pull.el = el;
}
function onTouchMove(e) {
  if (startY == null) return;
  const dy = e.touches[0].clientY - startY;
  if (dy > 12 && (pull.el?.scrollTop ?? 1) <= 0) pulling = true;
}
async function onTouchEnd() {
  if (pulling) {
    const { bridge } = await import('@/lib/native.js');
    await bridge.haptic('light');
    // A refresh re-queries the engines; on device this re-syncs any download
    // that changed while the app was backgrounded.
    await bridge.refreshWidget?.();
  }
  startY = null;
  pulling = false;
}

onMounted(() => {
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
});
onUnmounted(() => {
  document.removeEventListener('touchstart', onTouchStart);
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend', onTouchEnd);
});
</script>

<template>
  <div class="app-shell">
    <RouterView v-slot="{ Component }">
      <!-- Keep-alive the tab roots so switching tabs never re-runs their data
           fetch or loses scroll position; modals always mount fresh. -->
      <KeepAlive :include="['DownloadsView', 'LibraryView', 'QueueView', 'SettingsView']">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>

    <template v-if="!isModal">
      <Fab />
      <BottomNav />
    </template>

    <Overlays />
  </div>
</template>

<style>
/* The WebView should never show a bounce glow behind our own overscroll. */
html,
body {
  overscroll-behavior: none;
}
</style>
