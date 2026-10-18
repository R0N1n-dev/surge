<script setup>
defineOptions({ name: 'QueueView' });
import { reactive, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import DownloadCard from '@/components/DownloadCard.vue';
import { useDownloadsStore } from '@/stores/downloads.js';

const dl = useDownloadsStore();

const auto = reactive({ wifiOnly: true, batteryGuard: true, master: true, concurrency: 5, capDown: 0, capUp: 2 });

const SCHEDULE = reactive([
  { time: '02:00', title: 'Night batch', sub: 'Start queue · Wi-Fi only · stop 06:00', icon: 'clock', on: true },
  { time: '07:30', title: 'Morning pause', sub: 'Pause everything before the commute', icon: 'pause', on: false },
  { time: '19:00', title: 'Podcast sync', sub: 'Fetch new episodes from 3 feeds', icon: 'queue-music', on: true },
]);

const waiting = ref(null);
const waitingList = () => dl.items.filter((i) => i.state === 'queued');
void waiting;
</script>

<template>
  <header class="appbar">
    <div class="appbar__row">
      <span class="appbar__title">Queue & automation</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Add schedule"><Icon name="plus" :size="22" /></button>
    </div>
  </header>

  <main class="app-main">
    <div class="app-content col gap-4" style="padding-block: 12px">
      <div class="card card--tonal" style="padding: 14px 16px; display: flex; align-items: center; gap: 12px">
        <Icon name="infinity" :size="24" />
        <div class="col grow">
          <span class="t-title-small">Master queue is {{ auto.master ? 'running' : 'stopped' }}</span>
          <span class="t-body-small" style="opacity: 0.85">{{ dl.counts.active }} of {{ auto.concurrency }} slots used</span>
        </div>
        <span class="switch" role="switch" :aria-checked="auto.master" @click="auto.master = !auto.master"><span class="switch__thumb"></span></span>
      </div>

      <div class="settings-group">
        <div class="setting"><span class="setting__icon setting__icon--brand"><Icon name="layers" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Simultaneous downloads</span><span class="setting__sub">Higher values split your bandwidth</span></span><span class="setting__value">{{ auto.concurrency }} <Icon name="chevron-right" :size="18" /></span></div>
        <div class="setting"><span class="setting__icon"><Icon name="wifi" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Wi-Fi only</span><span class="setting__sub">Auto-pause on mobile data</span></span><span class="switch" role="switch" :aria-checked="auto.wifiOnly" @click="auto.wifiOnly = !auto.wifiOnly"><span class="switch__thumb"></span></span></div>
        <div class="setting"><span class="setting__icon"><Icon name="battery" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Pause below 15% battery</span><span class="setting__sub">Unless charging</span></span><span class="switch" role="switch" :aria-checked="auto.batteryGuard" @click="auto.batteryGuard = !auto.batteryGuard"><span class="switch__thumb"></span></span></div>
        <div class="setting"><span class="setting__icon"><Icon name="zap" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Speed limit</span><span class="setting__sub">Down {{ auto.capDown || '∞' }} · Up {{ auto.capUp }} MB/s</span></span><span class="setting__value"><Icon name="sliders" :size="18" /></span></div>
      </div>

      <section class="section" style="padding-block: 0">
        <div class="section__head"><span class="section__title">Schedule</span><button class="section__action">Edit</button></div>
        <div class="timeline">
          <div v-for="s in SCHEDULE" :key="s.time" class="timeline__row">
            <span class="timeline__time">{{ s.time }}</span>
            <span class="col"><span class="t-title-small">{{ s.title }}</span><span class="t-body-small muted">{{ s.sub }}</span></span>
            <span class="row gap-2">
              <span :style="{ color: s.on ? 'var(--s-success)' : 'var(--s-outline)' }"><Icon :name="s.icon" :size="18" /></span>
              <span class="switch" role="switch" :aria-checked="s.on" style="transform: scale(.86)" @click="s.on = !s.on"><span class="switch__thumb"></span></span>
            </span>
          </div>
        </div>
      </section>

      <section class="section" style="padding-block: 0">
        <div class="section__head"><span class="section__title">Waiting ({{ dl.counts.queued }})</span><button class="section__action" @click="dl.resumeAll()">Start all</button></div>
        <div v-if="waitingList().length" class="dl-list">
          <DownloadCard v-for="item in waitingList()" :key="item.id" :item="item" />
        </div>
        <div v-else class="t-body-small muted" style="padding: 8px 4px">Queue is empty — new downloads start immediately.</div>
      </section>
    </div>
  </main>
</template>
