<script setup>
defineOptions({ name: 'SettingsView' });
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import { useThemeStore } from '@/stores/theme.js';
import { useSettingsStore } from '@/stores/settings.js';
import { CATEGORIES, displayPath } from '@/lib/classify.js';

const router = useRouter();
const theme = useThemeStore();
const settings = useSettingsStore();

/** Local UI preferences. On device these are mirrored into the Kotlin
 *  SettingsDataStore via the Storage plugin; here they are the source of truth
 *  for the WebView half of the behaviour. */
const prefs = reactive({
  connections: 16,
  verify: true,
  retry: true,
  defaultRes: '1080p',
  mp3Bitrate: '320 kbps',
  autoMp3: false,
  subs: true,
  speedDock: true,
  notifications: true,
  cookies: true,
});
</script>

<template>
  <header class="appbar">
    <div class="appbar__row">
      <span class="appbar__title">Settings</span>
      <div class="grow"></div>
    </div>
  </header>

  <main class="app-main">
    <div class="app-content col gap-5" style="padding-block: 12px">
      <div class="card card--tonal" style="padding: 16px; display: flex; align-items: center; gap: 14px">
        <span style="width: 48px; height: 48px; border-radius: 16px; background: var(--s-on-primary-container); color: var(--s-primary-container); display: grid; place-items: center">
          <Icon name="zap" :size="26" />
        </span>
        <div class="col grow">
          <span class="t-title-large">Surge Pro</span>
          <span class="t-body-small" style="opacity: 0.85">Unlimited connections · no ads · cloud sync</span>
        </div>
        <button class="btn btn--filled btn--sm" style="background: var(--s-on-primary-container); color: var(--s-primary-container)">Get</button>
      </div>

      <section class="col gap-2">
        <span class="t-label-large muted" style="padding-inline: 4px">Downloads</span>
        <div class="settings-group">
          <div class="setting"><span class="setting__icon"><Icon name="layers" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Max connections per file</span><span class="setting__sub">parallel byte-ranges · more segments, faster start</span></span><span class="setting__value">{{ prefs.connections }} <Icon name="chevron-right" :size="18" /></span></div>
          <div class="setting"><span class="setting__icon"><Icon name="folder" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Download folder</span><span class="setting__sub">Internal storage › Download › Surge</span></span><span class="setting__value"><Icon name="chevron-right" :size="18" /></span></div>
          <div class="setting"><span class="setting__icon setting__icon--brand"><Icon name="shield" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Verify checksums</span><span class="setting__sub">SHA-256 / MD5 when the server provides one</span></span><span class="switch" role="switch" :aria-checked="prefs.verify" @click="prefs.verify = !prefs.verify"><span class="switch__thumb"></span></span></div>
          <div class="setting"><span class="setting__icon"><Icon name="refresh" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Auto-retry failed downloads</span><span class="setting__sub">3 attempts with exponential back-off</span></span><span class="switch" role="switch" :aria-checked="prefs.retry" @click="prefs.retry = !prefs.retry"><span class="switch__thumb"></span></span></div>
        </div>
      </section>

      <section class="col gap-2">
        <span class="t-label-large muted" style="padding-inline: 4px">Storage & auto-filing</span>
        <div class="settings-group">
          <div class="setting">
            <span class="setting__icon setting__icon--brand"><Icon name="folder" :size="20" /></span>
            <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Download root</span><span class="setting__sub">{{ displayPath('general', settings.root).replace(' › general','') }}</span></span>
            <span class="setting__value"><Icon name="edit" :size="18" /></span>
          </div>
          <div class="setting" style="display:block;padding:12px 16px">
            <span class="t-body-small muted" style="display:block;margin-bottom:10px">
              Every download is auto-filed into one of these folders the moment it
              is added. Folders are created on first use and always exist on disk.
            </span>
            <div class="col gap-2">
              <div v-for="c in CATEGORIES" :key="c.id" class="row gap-3">
                <span class="setting__icon" style="width:34px;height:34px"><Icon :name="c.icon" :size="18" /></span>
                <span class="col grow" style="min-width:0">
                  <span class="t-body-medium">{{ c.folder }}/</span>
                  <span class="t-body-small muted truncate">{{ c.blurb }}</span>
                </span>
                <span
                  v-if="c.id === 'others' || c.id === 'general'"
                  class="badge badge--neutral"
                  title="Safety-net categories cannot be disabled"
                >always</span>
                <span
                  v-else
                  class="switch"
                  role="switch"
                  :aria-checked="!settings.disabled.has(c.id)"
                  style="transform:scale(.86)"
                  @click="settings.setEnabled(c.id, settings.disabled.has(c.id))"
                ><span class="switch__thumb"></span></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="col gap-2">
        <span class="t-label-large muted" style="padding-inline: 4px">Media & conversion</span>
        <div class="settings-group">
          <div class="setting"><span class="setting__icon"><Icon name="video" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Default video quality</span><span class="setting__sub">240p · 360p · 480p · 720p · 1080p</span></span><span class="setting__value">{{ prefs.defaultRes }} <Icon name="chevron-right" :size="18" /></span></div>
          <div class="setting"><span class="setting__icon"><Icon name="gauge" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Default MP3 bitrate</span><span class="setting__sub">ffmpeg libmp3lame</span></span><span class="setting__value">{{ prefs.mp3Bitrate }} <Icon name="chevron-right" :size="18" /></span></div>
          <div class="setting"><span class="setting__icon setting__icon--accent"><Icon name="wand" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Convert to MP3 automatically</span><span class="setting__sub">Runs as soon as the video finishes</span></span><span class="switch" role="switch" :aria-checked="prefs.autoMp3" @click="prefs.autoMp3 = !prefs.autoMp3"><span class="switch__thumb"></span></span></div>
          <div class="setting"><span class="setting__icon"><Icon name="subtitles" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Download subtitles</span><span class="setting__sub">Auto-generated when no manual track exists</span></span><span class="switch" role="switch" :aria-checked="prefs.subs" @click="prefs.subs = !prefs.subs"><span class="switch__thumb"></span></span></div>
        </div>
      </section>

      <section class="col gap-2">
        <span class="t-label-large muted" style="padding-inline: 4px">Appearance</span>
        <div class="settings-group">
          <button class="setting" @click="router.push('/settings/themes')">
            <span class="setting__icon setting__icon--accent"><Icon name="palette" :size="20" /></span>
            <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Theme</span><span class="setting__sub">9 palettes · light & dark · Material You</span></span>
            <span class="setting__value">{{ theme.paletteMeta.name }} <Icon name="chevron-right" :size="18" /></span>
          </button>
          <button class="setting" @click="theme.cycleMode()">
            <span class="setting__icon"><Icon :name="theme.isDark ? 'moon' : 'sun'" :size="20" /></span>
            <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Mode</span><span class="setting__sub">Light, dark or follow the system</span></span>
            <span class="setting__value">{{ theme.mode[0].toUpperCase() + theme.mode.slice(1) }} <Icon name="chevron-right" :size="18" /></span>
          </button>
          <div class="setting"><span class="setting__icon"><Icon name="sparkles" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Dynamic colour</span><span class="setting__sub">Sample the palette from your wallpaper</span></span><span class="switch" role="switch" :aria-checked="theme.dynamic" @click="theme.dynamic ? (theme.dynamic = false, theme.apply()) : theme.enableDynamic()"><span class="switch__thumb"></span></span></div>
          <div class="setting"><span class="setting__icon"><Icon name="zap" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Show speed dock</span><span class="setting__sub">Live throughput graph on the Downloads tab</span></span><span class="switch" role="switch" :aria-checked="prefs.speedDock" @click="prefs.speedDock = !prefs.speedDock"><span class="switch__thumb"></span></span></div>
        </div>
      </section>

      <section class="col gap-2">
        <span class="t-label-large muted" style="padding-inline: 4px">Advanced</span>
        <div class="settings-group">
          <div class="setting"><span class="setting__icon"><Icon name="cpu" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Download engine</span><span class="setting__sub">native 16-segment HTTP · libtorrent4j · ffmpeg-kit</span></span><span class="setting__value">native</span></div>
          <div class="setting"><span class="setting__icon setting__icon--brand"><Icon name="bell" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Notifications</span><span class="setting__sub">Progress, completion and errors</span></span><span class="switch" role="switch" :aria-checked="prefs.notifications" @click="prefs.notifications = !prefs.notifications"><span class="switch__thumb"></span></span></div>
          <div class="setting"><span class="setting__icon"><Icon name="key" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Send cookies from browser</span><span class="setting__sub">Needed for age-gated and private media</span></span><span class="switch" role="switch" :aria-checked="prefs.cookies" @click="prefs.cookies = !prefs.cookies"><span class="switch__thumb"></span></span></div>
          <div class="setting"><span class="setting__icon"><Icon name="database" :size="20" /></span><span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Backup & restore</span><span class="setting__sub">Queue, schedules and settings</span></span><span class="setting__value"><Icon name="chevron-right" :size="18" /></span></div>
        </div>
      </section>

      <div class="col gap-2" style="align-items: center; padding-block: 8px">
        <span class="t-body-small muted">Surge 3.2.1 (arm64) · JDK 21 · targetSdk 36</span>
        <span class="t-body-small muted">aria2 1.37.1 · yt-dlp 2026.10.15 · ffmpeg 7.1</span>
      </div>
    </div>
  </main>
</template>
