<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { useThemeStore, PALETTES, MODES } from '@/stores/theme.js';
import { tonalPalette, TONES } from '../../tools/color.mjs';

const router = useRouter();
const theme = useThemeStore();

const STRIP_TONES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99];

/** Live tonal ramps for the three seed roles of the active palette. */
const ramps = computed(() => {
  const p = theme.paletteMeta.colors;
  return [
    ['PRIMARY', p[0]],
    ['SECONDARY', p[1]],
    ['ACCENT', p[2] ?? p[1]],
  ].map(([label, seed]) => {
    const pal = tonalPalette(seed);
    return { label, stops: STRIP_TONES.map((t) => ({ t, hex: pal[t] })) };
  });
});

const MODE_ICON = { light: 'sun', dark: 'moon', system: 'smartphone' };
</script>

<template>
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="chevron-left" :size="22" /></button>
      <span class="appbar__title">Theme & colour</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Reset theme" @click="theme.setPalette('bright-tech')">
        <Icon name="restart" :size="20" />
      </button>
    </div>
  </header>

  <main class="app-main">
    <div class="app-content col gap-4" style="padding-block: 12px">
      <!-- mode picker -->
      <div class="segmented" role="radiogroup" aria-label="Colour mode">
        <button
          v-for="m in MODES"
          :key="m"
          class="segmented__opt"
          :class="{ 'is-active': theme.mode === m }"
          role="radio"
          :aria-checked="theme.mode === m"
          @click="theme.setMode(m)"
        >
          <Icon :name="MODE_ICON[m]" :size="16" />
          {{ m[0].toUpperCase() + m.slice(1) }}
        </button>
      </div>

      <!-- Material You -->
      <div class="card card--tonal" style="padding: 12px 16px; display: flex; align-items: center; gap: 12px">
        <Icon name="sparkles" :size="22" />
        <div class="col grow">
          <span class="t-title-small">Material You</span>
          <span class="t-body-small" style="opacity: 0.85">Derive the palette from your wallpaper</span>
        </div>
        <span class="switch" role="switch" :aria-checked="theme.dynamic" @click="theme.dynamic ? (theme.dynamic = false, theme.apply()) : theme.enableDynamic()">
          <span class="switch__thumb"></span>
        </span>
      </div>

      <!-- palettes -->
      <section class="section" style="padding-block: 0">
        <div class="section__head">
          <span class="section__title">Palettes</span>
          <span class="t-label-medium muted">{{ PALETTES.length }} available</span>
        </div>
        <div class="theme-grid">
          <button
            v-for="p in PALETTES"
            :key="p.id"
            class="theme-card"
            :class="{ 'is-active': theme.palette === p.id }"
            :aria-pressed="theme.palette === p.id"
            @click="theme.setPalette(p.id)"
          >
            <span class="theme-card__preview">
              <span :style="{ background: p.colors[0] }"></span>
              <span :style="{ background: p.colors[1] }"></span>
              <span :style="{ background: p.colors[2] ?? p.colors[1] }"></span>
            </span>
            <span class="theme-card__meta">
              <span class="theme-card__name">{{ p.name }}</span>
              <span class="theme-card__use">{{ p.kind === 'dual' ? 'Dual' : 'Triple' }} · {{ p.ratio }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- tonal ramps of the active palette -->
      <section class="section" style="padding-block: 0">
        <div class="section__head"><span class="section__title">Tonal ramp — {{ theme.paletteMeta.name }}</span></div>
        <div class="col gap-2">
          <template v-for="r in ramps" :key="r.label">
            <span class="t-label-small muted">{{ r.label }}</span>
            <div class="tone-strip">
              <span v-for="s in r.stops" :key="s.t" :style="{ background: s.hex }" :title="`tone ${s.t} · ${s.hex}`"></span>
            </div>
          </template>
          <span class="t-body-small muted" style="margin-top: 6px">
            Every ramp is generated in OKLCH from the three seed colours, so all
            18 palette×mode combinations hold WCAG AA contrast.
          </span>
        </div>
      </section>

      <!-- contrast audit readout -->
      <section class="settings-group">
        <div class="setting">
          <span class="setting__icon setting__icon--brand"><Icon name="shield" :size="20" /></span>
          <span class="col"><span class="setting__title" style="font-size: 15px; line-height: 20px">Contrast audit</span><span class="setting__sub">468 pairings verified at build time</span></span>
          <span class="badge badge--torrent">AA pass</span>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.tone-strip { display: flex; height: 26px; border-radius: var(--s-radius-sm); overflow: hidden; }
.tone-strip span { flex: 1 1 0; }
</style>
