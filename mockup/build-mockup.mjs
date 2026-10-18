/**
 * Surge — UI mockup generator
 * ---------------------------------------------------------------------------
 * Renders a self-contained HTML design preview: real phone frames, built from
 * the SAME tokens (src/styles/themes.css) and the SAME component CSS
 * (src/styles/components.css) the app ships with. What you see here is what the
 * app looks like — it is not a separate illustration.
 *
 *   node mockup/build-mockup.mjs
 *
 * Output: mockup/surge-mockup.html  (open in any browser, no network needed)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_THEMES, buildTokens, DEFAULT_THEME_ID } from '../tools/themes.mjs';
import { ICONS, sprite } from '../tools/icons.mjs';
import { contrast, tonalPalette } from '../tools/color.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const themesCss = read('src/styles/themes.css');
const baseCss = read('src/styles/base.css');
const componentsCss = read('src/styles/components.css');

/* ------------------------------------------------------------- tiny utils -- */

/** Icon reference into the inline sprite — exactly how the app renders icons. */
const i = (name, size = 24, cls = '') => {
  if (!ICONS[name]) return `<!-- UNKNOWN ICON: ${name} -->`;
  const c = cls ? ` ${cls}` : '';
  return `<svg class="icon${c}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
};

/** Deterministic pseudo-random so every rebuild produces the identical mockup. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sparkline(points, { w = 320, h = 56, pad = 4 } = {}) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, idx) => {
    const x = pad + idx * stepX;
    const y = h - pad - ((p - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], idx) => `${idx ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${h} L${coords[0][0].toFixed(1)} ${h} Z`;
  const peak = coords[points.indexOf(max)];
  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="surge-spark-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--s-seed-secondary)" stop-opacity="0.42"/>
          <stop offset="100%" stop-color="var(--s-seed-secondary)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <line class="spark__grid" x1="0" y1="${h * 0.34}" x2="${w}" y2="${h * 0.34}"/>
      <line class="spark__grid" x1="0" y1="${h * 0.67}" x2="${w}" y2="${h * 0.67}"/>
      <path class="spark__area" d="${area}"/>
      <path class="spark__line" d="${line}"/>
      <circle class="spark__peak" cx="${peak[0].toFixed(1)}" cy="${peak[1].toFixed(1)}" r="2.6"/>
    </svg>`;
}

const statusbar = (dark, time = '9:41') => `
  <div class="mock-statusbar ${dark ? 'is-dark' : ''}">
    <span>${time}</span>
    <span class="mock-statusbar__icons">
      ${i('signal', 14)}${i('wifi', 14)}${i('battery', 16)}
    </span>
  </div>`;

const navbar = (dark) => `
  <div class="mock-navbar ${dark ? 'is-dark' : ''}">
    <span class="mock-navbar__pill"></span>
  </div>`;

/**
 * A phone frame. `theme`/`mode` scope the generated tokens to this frame only,
 * so a single page can show many palettes side by side.
 */
function phone({ title, caption, theme = DEFAULT_THEME_ID, mode = 'dark', body, badge = '', height = 780 }) {
  const dark = mode === 'dark';
  return `
  <figure class="shot" data-theme="${theme}">
    <div class="phone theme-${theme} mode-${mode}" style="--phone-h:${height}px">
      ${statusbar(dark)}
      <div class="phone__screen">${normalizeNav(body)}</div>
      ${navbar(dark)}
    </div>
    <figcaption class="shot__cap">
      <span class="shot__num">${badge}</span>
      <span>
        <strong>${title}</strong>
        <em>${caption}</em>
      </span>
    </figcaption>
  </figure>`;
}

/* ------------------------------------------------- minimal 4-tab bottom nav */
const NAV4 = [
  ['home', 'home', 'Home'],
  ['downloads', 'download', 'Downloads'],
  ['library', 'folder', 'Library'],
  ['settings', 'settings', 'Me'],
];

function nav4(active) {
  const map = { browser: 'home', queue: 'downloads', home: 'home' };
  const cur = map[active] ?? active;
  return `
  <nav class="nav">
    ${NAV4.map(([id, ic, lb]) => `
    <a class="nav__item"${id === cur ? ' aria-current="page"' : ''}><span class="nav__indicator"></span><span class="nav__icon">${i(ic, 22)}</span><span class="nav__label">${lb}</span>${id === 'downloads' ? '<span class="nav__badge">2</span>' : ''}</a>`).join('')}
  </nav>`;
}

/** SnapTube keeps the bar to a handful of destinations; fold Browser and Queue
 *  into Home quick-actions and the FAB speedial instead of five tabs. */
function normalizeNav(body, fallback = 'downloads') {
  let active = fallback;
  const m = /aria-current="page"[\s\S]*?nav__label">([^<]+)</.exec(body);
  if (m) {
    const label = m[1].trim().toLowerCase();
    active = { downloads: 'downloads', browser: 'browser', library: 'library', queue: 'queue', settings: 'settings' }[label] ?? fallback;
  }
  return body.replace(/<nav class="nav">[\s\S]*?<\/nav>/g, nav4(active));
}

/* ============================================================ SCREEN: dock == */

const SPEED_POINTS = (() => {
  const r = rng(20261017);
  return Array.from({ length: 34 }, (_, idx) => {
    const base = 8.4 + Math.sin(idx / 3.4) * 2.6;
    return Math.max(0.6, base + (r() - 0.45) * 3.2);
  });
})();

function speedDock({ down = '12.4', up = '1.8', active = 3, queued = 2 }) {
  return `
  <div class="dock">
    <div class="row-between">
      <div class="row gap-2">
        <span class="badge badge--neutral">${i('zap', 12)} LIVE</span>
        <span class="t-label-medium muted">16 connections</span>
      </div>
      <button class="btn btn--text btn--sm">${i('pause', 16)} Pause all</button>
    </div>
    <div class="dock__stats">
      <div>
        <div class="dock__stat-value">${down}<span class="t-label-small muted"> MB/s</span></div>
        <div class="dock__stat-label">Download</div>
      </div>
      <div>
        <div class="dock__stat-value">${up}<span class="t-label-small muted"> MB/s</span></div>
        <div class="dock__stat-label">Upload</div>
      </div>
      <div>
        <div class="dock__stat-value">${active}<span class="t-label-small muted">/${active + queued}</span></div>
        <div class="dock__stat-label">Active</div>
      </div>
    </div>
    <div class="dock__graph">${sparkline(SPEED_POINTS)}</div>
  </div>`;
}

/* ======================================================= SCREEN: dl rows === */

function thumb(kind, label) {
  const icons = { youtube: 'youtube', instagram: 'instagram', torrent: 'torrent', http: 'cloud', audio: 'music', apk: 'apk', archive: 'archive', doc: 'doc', video: 'film' };
  const badge = { youtube: 'badge--youtube', instagram: 'badge--instagram', torrent: 'badge--torrent', http: 'badge--http', audio: 'badge--audio' };
  return { icon: icons[kind] || 'file', badge: badge[kind] || 'badge--neutral', label };
}

function dlRow({
  name,
  kind,
  state = 'active',
  pct = 0,
  size = '',
  done = '',
  speed = '',
  eta = '',
  segments = 0,
  meta = '',
  badgeText = '',
  duration = '',
  actions = ['pause', 'close'],
}) {
  const t = thumb(kind, badgeText);
  const stateLabel = { active: 'Downloading', paused: 'Paused', queued: 'Queued', complete: 'Complete', error: 'Failed', seeding: 'Seeding' }[state];
  const pctTxt = state === 'complete' ? '100%' : `${pct}%`;
  const segs = segments
    ? `<div class="progress__segments">${'<span></span>'.repeat(segments)}</div>`
    : '';
  const fillCls = state === 'active' ? 'progress__fill progress__fill--striped' : 'progress__fill';
  return `
  <article class="dl" data-state="${state}">
    <div class="dl__spine"></div>
    <div class="dl__thumb">
      ${i(t.icon, 24)}
      ${duration ? `<span class="dl__thumb-dur">${duration}</span>` : ''}
    </div>
    <div class="dl__body">
      <div class="dl__name" title="${name}">${name}</div>
      <div class="dl__meta">
        ${t.label ? `<span class="badge ${t.badge}">${t.label}</span>` : ''}
        ${meta ? `<span>${meta}</span>` : ''}
        <span class="dot"></span>
        <span>${stateLabel}</span>
      </div>
      <div class="progress ${state === 'paused' ? 'progress--paused' : ''}${state === 'complete' ? ' progress--done' : ''}${state === 'error' ? ' progress--error' : ''}${state === 'seeding' ? ' progress--seeding' : ''}${state === 'queued' ? ' progress--queued' : ''}">
        <div class="${fillCls}" style="width:${pct}%"></div>${segs}
      </div>
      <div class="dl__numbers">
        ${speed ? `<span class="dl__speed">${i('download', 12)} ${speed}</span>` : ''}
        ${eta ? `<span class="dl__eta">${eta} left</span>` : ''}
        <span class="dl__eta" style="margin-inline-start:auto">${done}${done && size ? ' / ' : ''}${size} · ${pctTxt}</span>
      </div>
    </div>
    <div class="dl__actions">
      ${state === 'complete' ? `<button class="icon-btn" aria-label="Open">${i('play', 20)}</button>` : ''}
      ${actions.map((a) => `<button class="icon-btn" aria-label="${a}">${i(a, 20)}</button>`).join('')}
      <button class="icon-btn" aria-label="More">${i('more-v', 20)}</button>
    </div>
  </article>`;
}

/* ================================================ category folder model ==== */
// Mirrors src/lib/classify.js — the 1DM-style auto-filing tree.
const CATS = [
  ['videos', 'film', '12', '9.4 GB', 'Movies, episodes, reels, recordings'],
  ['music', 'music', '46', '1.2 GB', 'Tracks, podcasts, MP3 conversions'],
  ['photos', 'image', '31', '412 MB', 'Images, wallpapers, cover art'],
  ['documents', 'doc', '9', '88 MB', 'PDFs, office files, ebooks'],
  ['compressed', 'archive', '6', '7.1 GB', 'Archives, disk images'],
  ['programs', 'apk', '3', '128 MB', 'APKs, bundles, installers'],
  ['subtitles', 'subtitles', '14', '1.1 MB', 'Subtitle and caption tracks'],
  ['torrents', 'torrent', '4', '16 KB', '.torrent metadata'],
  ['general', 'file', '2', '9.6 MB', 'Recognised, no home of their own'],
  ['others', 'file-question', '1', '2.4 MB', 'No extension / unrecognised'],
];

function catTree({ counts = true } = {}) {
  return `
  <div class="card" style="padding:6px 8px">
    <div class="tree">
      ${CATS.map(([id, ic, n, size, blurb]) => `
      <div class="tree__row">
        <span class="setting__icon" style="width:32px;height:32px">${i(ic, 18)}</span>
        <span class="col" style="min-width:0">
          <span class="tree__name" style="font-family:var(--s-font-mono);font-size:13px">${id}/</span>
          <span class="t-body-small muted truncate">${blurb}</span>
        </span>
        <span class="tree__size">${counts && n !== '0' ? `${n} · ${size}` : 'empty'}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ======================================================= SCREEN 1: home ==== */

const screenDownloads = `
  <header class="appbar is-scrolled">
    <div class="appbar__row">
      <div class="col" style="padding-inline-start:8px">
        <span class="appbar__hero-title">Downloads</span>
        <span class="t-body-small muted">3 active · 2 queued · 18.2 MB/s</span>
      </div>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Search">${i('search', 22)}</button>
      <button class="icon-btn" aria-label="Sort and filter">${i('filter', 22)}</button>
      <button class="icon-btn" aria-label="More options">${i('more-v', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content col gap-4" style="padding-block:16px">
      <div class="row-between">
        <span class="livepill"><span class="livepill__dot"></span><strong>18.2</strong> MB/s · 3 active</span>
        <button class="btn btn--text btn--sm">${i('sliders', 16)} Queue</button>
      </div>
      <div class="chip-rail">
        <button class="chip is-selected">${i('check', 16, 'chip__check')} All <span class="badge badge--neutral" style="height:16px">12</span></button>
        <button class="chip">Downloading</button>
        <button class="chip">Queued</button>
        <button class="chip">Completed</button>
        <button class="chip">${i('torrent', 16)} Torrents</button>
        <button class="chip">${i('video', 16)} Video</button>
        <button class="chip">${i('music', 16)} Audio</button>
      </div>
      <div class="dl-list">
        ${dlRow({
          name: 'Big Buck Bunny — 4K Remux [1080p].mp4',
          kind: 'youtube',
          badgeText: 'YouTube',
          state: 'active',
          pct: 63,
          size: '4.21 GB',
          done: '2.65 GB',
          speed: '9.8 MB/s',
          eta: '2 min 41 s',
          segments: 8,
          meta: '1080p · MP4 · 8 conn.',
          duration: '9:56',
        })}
        ${dlRow({
          name: 'ubuntu-24.04.3-live-server-arm64.iso',
          kind: 'http',
          badgeText: 'HTTPS',
          state: 'active',
          pct: 41,
          size: '5.84 GB',
          done: '2.39 GB',
          speed: '2.1 MB/s',
          eta: '27 min',
          segments: 16,
          meta: 'releases.ubuntu.com · resumable',
        })}
        ${dlRow({
          name: 'Debian 12.7 DVD-1 (multi-file torrent)',
          kind: 'torrent',
          badgeText: 'Magnet',
          state: 'active',
          pct: 88,
          size: '4.70 GB',
          done: '4.14 GB',
          speed: '0.5 MB/s',
          eta: '18 min',
          segments: 0,
          meta: 'S 214 · P 12 · 31 of 84 files',
          actions: ['pause'],
        })}
        ${dlRow({
          name: 'lofi-girl-beats-vol-12 → MP3 320 kbps',
          kind: 'audio',
          badgeText: 'Audio',
          state: 'queued',
          pct: 0,
          size: '188 MB',
          meta: 'queued after 2 items · convert on finish',
          actions: ['play', 'close'],
        })}
        ${dlRow({
          name: 'ProjectAssets_v7.zip',
          kind: 'archive',
          badgeText: '',
          state: 'paused',
          pct: 24,
          size: '1.09 GB',
          done: '262 MB',
          meta: 'paused · Wi-Fi only',
          actions: ['play', 'close'],
        })}
        ${dlRow({
          name: 'instagram_reel_9f31ac72.mp4',
          kind: 'instagram',
          badgeText: 'Instagram',
          state: 'complete',
          pct: 100,
          size: '18.7 MB',
          done: '18.7 MB',
          meta: 'saved to Movies/Instagram · 2 s ago',
          duration: '0:31',
          actions: ['share', 'more-v'],
        })}
        ${dlRow({
          name: 'surge-app-release-3.2.1-arm64.apk',
          kind: 'apk',
          badgeText: '',
          state: 'complete',
          pct: 100,
          size: '42.6 MB',
          done: '42.6 MB',
          meta: 'checksum verified · SHA-256',
          actions: ['download', 'share'],
        })}
      </div>
    </div>
  </div>
  <button class="fab fab--brand" aria-label="Add download">${i('plus', 26)}
    <span class="fab__badge">3</span>
  </button>
  <nav class="nav">
    <a class="nav__item" aria-current="page"><span class="nav__indicator"></span><span class="nav__icon">${i('download', 22)}</span><span class="nav__label">Downloads</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('globe', 22)}</span><span class="nav__label">Browser</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('folder', 22)}</span><span class="nav__label">Library</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('list', 22)}</span><span class="nav__label">Queue</span><span class="nav__badge">2</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('settings', 22)}</span><span class="nav__label">Settings</span></a>
  </nav>`;

/* ================================================ SCREEN 2: media picker === */

function qualityCard({ label, sub, tag = '', selected = false, disabled = false }) {
  return `
  <button class="quality ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}" aria-pressed="${selected}">
    ${tag ? `<span class="quality__tag">${tag}</span>` : `<span class="quality__check">${i('check', 18)}</span>`}
    <span class="quality__label">${label}</span>
    <span class="quality__sub">${sub}</span>
  </button>`;
}

const screenMediaPicker = `
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back">${i('chevron-left', 22)}</button>
      <span class="appbar__title truncate">Choose format</span>
      <button class="icon-btn" aria-label="More options">${i('more-v', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:120px">
    <div class="app-content col gap-4" style="padding-block:12px">

      <div class="card" style="display:grid;grid-template-columns:112px 1fr">
        <div style="position:relative;background:var(--s-surface-container-highest);display:grid;place-items:center">
          ${i('film', 32, 'muted')}
          <span class="dl__thumb-dur" style="position:absolute;inset:auto 5px 5px auto">9:56</span>
        </div>
        <div class="col gap-1" style="padding:12px">
          <div class="row gap-2">
            <span class="badge badge--youtube">${i('youtube', 11)} YouTube</span>
            <span class="t-body-small muted">1080p60 available</span>
          </div>
          <div class="t-title-small clamp-2">Big Buck Bunny — 4K Remux (Blender Foundation)</div>
          <div class="t-body-small muted">Blender · 4.2 M views · 12 chapters</div>
        </div>
      </div>

      <div class="segmented" role="radiogroup" aria-label="Output type">
        <button class="segmented__opt is-active" role="radio" aria-checked="true">${i('video', 16)} Video</button>
        <button class="segmented__opt" role="radio" aria-checked="false">${i('music', 16)} Audio only</button>
        <button class="segmented__opt" role="radio" aria-checked="false">${i('subtitles', 16)} Subs</button>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head">
          <span class="section__title">Resolution</span>
          <span class="t-label-medium muted">MP4 · H.264 + AAC</span>
        </div>
        <div class="quality-grid">
          ${qualityCard({ label: '240p', sub: '426×240 · 96 MB' })}
          ${qualityCard({ label: '360p', sub: '640×360 · 214 MB' })}
          ${qualityCard({ label: '480p', sub: '854×480 · 486 MB' })}
          ${qualityCard({ label: '720p', sub: '1280×720 · 1.1 GB', tag: 'HD' })}
          ${qualityCard({ label: '1080p', sub: '1920×1080 · 2.4 GB', tag: 'FHD', selected: true })}
          ${qualityCard({ label: '1440p', sub: '2560×1440 · 4.1 GB', tag: '2K' })}
          ${qualityCard({ label: '2160p', sub: '3840×2160 · 8.9 GB', tag: '4K' })}
          ${qualityCard({ label: 'Best', sub: 'auto · 8.9 GB' })}
        </div>
      </div>

      <div class="settings-group">
        <div class="setting">
          <span class="setting__icon">${i('queue-music', 20)}</span>
          <span class="col"><span class="setting__title">Convert audio to MP3 after download</span><span class="setting__sub">ffmpeg · also keep the source video</span></span>
          <span class="switch" role="switch" aria-checked="true"><span class="switch__thumb"></span></span>
        </div>
        <div class="setting">
          <span class="setting__icon setting__icon--accent">${i('gauge', 20)}</span>
          <span class="col"><span class="setting__title">MP3 bitrate</span><span class="setting__sub">Higher bitrate means a larger file</span></span>
          <span class="setting__value">320 kbps ${i('chevron-right', 18)}</span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('subtitles', 20)}</span>
          <span class="col"><span class="setting__title">Subtitles</span><span class="setting__sub">English (auto), embedded as soft subs</span></span>
          <span class="setting__value">2 ${i('chevron-right', 18)}</span>
        </div>
        <div class="setting">
          <span class="setting__icon setting__icon--brand">${i('folder', 20)}</span>
          <span class="col"><span class="setting__title">Save to</span><span class="setting__sub" style="font-family:var(--s-font-mono)">Download/Surge/videos/ · auto-filed by type</span></span>
          <span class="setting__value">${i('chevron-right', 18)}</span>
        </div>
      </div>

      <div class="card card--tonal" style="padding:14px 16px;display:flex;gap:12px;align-items:center">
        ${i('sparkles', 22)}
        <div class="col grow">
          <span class="t-title-small">Playlist detected — 12 videos</span>
          <span class="t-body-small" style="opacity:.85">Queue the whole playlist at this quality?</span>
        </div>
        <button class="btn btn--outlined btn--sm" style="border-color:currentColor">Add all</button>
      </div>
    </div>
  </div>
  <div style="position:fixed;inset-inline:0;bottom:0;padding:12px 16px calc(12px + 24px);background:var(--s-surface-container);border-top:1px solid var(--s-outline-variant);display:flex;gap:12px;align-items:center">
    <div class="col" style="min-width:0">
      <span class="t-label-small muted">TOTAL</span>
      <span class="t-mono-medium">2.41 GB · ~4 min</span>
    </div>
    <div class="grow"></div>
    <button class="btn btn--filled btn--lg">${i('download', 20)} Download</button>
  </div>`;

/* ================================================= SCREEN 3: add / paste === */

const screenAdd = `
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Close">${i('close', 22)}</button>
      <span class="appbar__title">New download</span>
      <button class="icon-btn" aria-label="Scan QR code">${i('scan', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:24px">
    <div class="app-content col gap-4" style="padding-block:16px">

      <div class="composer">
        <span style="padding:10px;color:var(--s-primary)">${i('link', 22)}</span>
        <textarea class="composer__input" rows="2" readonly>https://www.youtube.com/watch?v=aqz-KE-bpKQ</textarea>
        <button class="icon-btn" aria-label="Paste from clipboard" style="background:var(--s-primary-container);color:var(--s-on-primary-container)">${i('clipboard', 20)}</button>
      </div>

      <div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:12px;border-color:var(--s-primary)">
        <span style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--s-badge-youtube-bg);color:var(--s-badge-youtube-fg)">${i('youtube', 20)}</span>
        <div class="col grow">
          <span class="t-title-small">YouTube video detected</span>
          <span class="t-body-small muted">Up to 2160p60 · chapters · subtitles · MP3</span>
        </div>
        <span style="color:var(--s-success)">${i('check-circle', 22)}</span>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">Quick add</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${[
            ['magnet', 'Magnet'],
            ['torrent', '.torrent'],
            ['clipboard', 'Clipboard'],
            ['browser', 'Browser'],
          ]
            .map(
              ([ic, lb]) => `
            <button class="card card--filled stateful" style="padding:14px 6px;display:flex;flex-direction:column;align-items:center;gap:8px">
              <span style="color:var(--s-primary)">${i(ic, 22)}</span>
              <span class="t-label-medium">${lb}</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">Supported sources</span><span class="section__action">Details</span></div>
        <div class="settings-group">
          ${[
            ['youtube', 'YouTube & YouTube Music', 'video, playlists, channels, Shorts, age-gated', 'badge--youtube'],
            ['instagram', 'Instagram', 'Reels, posts, stories, IGTV, carousels', 'badge--instagram'],
            ['magnet', 'Torrents & magnets', 'aria2 · DHT, PEX, sequential, file select', 'badge--torrent'],
            ['cloud', 'Direct HTTP / FTP / SFTP', 'multi-segment, resume, mirrors, auth', 'badge--http'],
            ['sparkles', '1800+ more extractors', 'TikTok, X, Vimeo, Twitch, SoundCloud…', 'badge--neutral'],
          ]
            .map(
              ([ic, t, s, b]) => `
            <div class="setting">
              <span class="setting__icon"><span class="badge ${b}" style="padding:6px;border-radius:10px">${i(ic, 18)}</span></span>
              <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">${t}</span><span class="setting__sub">${s}</span></span>
              <span class="setting__value">${i('chevron-right', 18)}</span>
            </div>`,
            )
            .join('')}
        </div>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">From clipboard</span><span class="section__action">Clear</span></div>
        <div class="col gap-2">
          ${[
            ['magnet:?xt=urn:btih:7A6F2E…', 'Magnet · 4.7 GB · 214 seeds', 'torrent'],
            ['https://www.instagram.com/reel/C8f…', 'Instagram Reel · 0:31', 'instagram'],
            ['https://cdn.example.org/assets/pack.zip', '1.09 GB · resumable', 'cloud'],
          ]
            .map(
              ([t, s, ic]) => `
            <button class="card stateful" style="padding:10px 14px;display:flex;align-items:center;gap:12px;text-align:start">
              <span style="color:var(--s-on-surface-variant)">${i(ic, 20)}</span>
              <span class="col grow" style="min-width:0">
                <span class="t-body-medium truncate">${t}</span>
                <span class="t-body-small muted">${s}</span>
              </span>
              <span class="badge badge--neutral">Add</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>
    </div>
  </div>`;

/* ================================================= SCREEN 4: torrent view == */

function treeRow({ name, size, checked = true, dir = false, depth = 0, pct = null, muted = false }) {
  return `
  <div class="tree__row ${dir ? 'is-dir' : ''}" style="--depth:${depth};${muted ? 'opacity:.45' : ''}">
    <span class="check ${checked ? 'is-checked' : ''}" role="checkbox" aria-checked="${checked}">${i('check', 14)}</span>
    <span class="col" style="min-width:0">
      <span class="tree__name"><span class="tree__indent"></span>${dir ? i(dir === 'down' ? 'chevron-down' : 'chevron-right', 14) + ' ' : ''}${name}</span>
      ${
        pct !== null && !dir
          ? `<span class="progress progress--thin" style="margin-top:5px;width:100%"><span class="progress__fill" style="width:${pct}%"></span></span>`
          : ''
      }
    </span>
    <span class="tree__size">${size}</span>
  </div>`;
}

const screenTorrent = `
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back">${i('chevron-left', 22)}</button>
      <span class="appbar__title truncate">Debian 12.7 DVD-1</span>
      <button class="icon-btn" aria-label="Share">${i('share', 20)}</button>
      <button class="icon-btn" aria-label="More options">${i('more-v', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:110px">
    <div class="app-content col gap-4" style="padding-block:12px">

      <div class="card card--filled" style="padding:16px">
        <div class="row-between" style="margin-bottom:10px">
          <span class="badge badge--torrent">${i('torrent', 12)} Magnet · DHT</span>
          <span class="t-mono-small muted">88% of 4.70 GB</span>
        </div>
        <div class="progress progress--lg" style="margin-bottom:12px">
          <div class="progress__fill progress__fill--striped" style="width:88%"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
          ${[
            ['0.5 MB/s', 'Down', 'download'],
            ['1.8 MB/s', 'Up', 'upload'],
            ['214', 'Seeds', 'seedling'],
            ['12', 'Peers', 'users'],
          ]
            .map(
              ([v, l, ic]) => `
            <div class="col gap-1" style="align-items:center">
              <span style="color:var(--s-on-surface-variant)">${i(ic, 16)}</span>
              <span class="t-mono-small" style="color:var(--s-on-surface)">${v}</span>
              <span class="t-label-small muted">${l}</span>
            </div>`,
            )
            .join('')}
        </div>
      </div>

      <div class="chip-rail">
        <button class="chip is-selected">Files <span class="badge badge--neutral" style="height:16px">84</span></button>
        <button class="chip">Peers</button>
        <button class="chip">Trackers</button>
        <button class="chip">Pieces</button>
        <button class="chip">Log</button>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head">
          <span class="section__title">Select files</span>
          <span class="section__action">Select all</span>
        </div>
        <div class="card" style="padding:4px 8px">
          <div class="tree">
            ${treeRow({ name: 'debian-12.7.0-amd64-DVD-1', size: '4.70 GB', dir: 'down' })}
            ${treeRow({ name: 'debian-12.7.0-amd64-DVD-1.iso', size: '4.38 GB', depth: 1, pct: 91 })}
            ${treeRow({ name: 'install', size: '184 MB', dir: 'right', depth: 1 })}
            ${treeRow({ name: 'doc', size: '62.4 MB', depth: 1, pct: 100 })}
            ${treeRow({ name: 'pool', size: '78.1 MB', depth: 1, checked: false, muted: true })}
            ${treeRow({ name: 'README.html', size: '4.2 KB', depth: 1, pct: 100 })}
            ${treeRow({ name: 'SHA512SUMS', size: '12 KB', depth: 1, pct: 100 })}
            ${treeRow({ name: 'SHA512SUMS.sign', size: '1 KB', depth: 1, pct: 100 })}
          </div>
        </div>
        <div class="t-body-small muted" style="padding:10px 4px 0">
          ${i('info', 13)} 31 of 84 files selected · 4.42 GB · sequential download is on so you can
          stream the ISO while it lands.
        </div>
      </div>

      <div class="settings-group">
        <div class="setting">
          <span class="setting__icon setting__icon--brand">${i('seedling', 20)}</span>
          <span class="col"><span class="setting__title">Seed after completion</span><span class="setting__sub">Ratio limit 2.0 · then stop</span></span>
          <span class="switch" role="switch" aria-checked="true"><span class="switch__thumb"></span></span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('wifi', 20)}</span>
          <span class="col"><span class="setting__title">Wi-Fi only</span><span class="setting__sub">Pause automatically on mobile data</span></span>
          <span class="switch" role="switch" aria-checked="false"><span class="switch__thumb"></span></span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('layers', 20)}</span>
          <span class="col"><span class="setting__title">Connections</span><span class="setting__sub">Per-torrent · max peers 128</span></span>
          <span class="setting__value">64 ${i('chevron-right', 18)}</span>
        </div>
      </div>
    </div>
  </div>
  <div style="position:fixed;inset-inline:0;bottom:0;padding:12px 16px calc(12px + 24px);background:var(--s-surface-container);border-top:1px solid var(--s-outline-variant);display:flex;gap:10px">
    <button class="btn btn--outlined grow">${i('pause', 18)} Pause</button>
    <button class="btn btn--filled grow">${i('download', 18)} Start 31 files</button>
  </div>`;

/* =================================================== SCREEN 5: library ===== */

// [name, icon, meta, duration, badgeClass, badgeLabel]
const LIB = [
  ['Big Buck Bunny — 4K Remux', 'film', '2.41 GB · MP4', '9:56', 'badge--youtube', 'YouTube'],
  ['instagram_reel_9f31ac72', 'instagram', '18.7 MB · MP4', '0:31', 'badge--instagram', 'Reel'],
  ['lofi-girl-beats-vol-12', 'music', '188 MB · MP3 320', '58:12', 'badge--audio', 'MP3'],
  ['ubuntu-24.04.3-arm64', 'cloud', '5.84 GB · ISO', '', 'badge--http', 'ISO'],
  ['ProjectAssets_v7', 'archive', '1.09 GB · ZIP', '', 'badge--neutral', 'ZIP'],
  ['surge-3.2.1-arm64', 'apk', '42.6 MB · APK', '', 'badge--neutral', 'APK'],
  ['keynote-recording', 'video', '812 MB · MKV', '41:07', 'badge--neutral', 'Recording'],
  ['podcast-ep-214', 'mic', '94 MB · M4A', '1:22:40', 'badge--audio', 'Podcast'],
];

const screenLibrary = `
  <header class="appbar">
    <div class="appbar__row">
      <span class="appbar__title">Library</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Search">${i('search', 22)}</button>
      <button class="icon-btn" aria-label="Toggle grid or list">${i('grid', 22)}</button>
      <button class="icon-btn" aria-label="Sort">${i('sort', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content col gap-4" style="padding-block:12px">

      <div class="card card--filled" style="padding:14px 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
        ${[
          ['14.6 GB', 'Total', 'hard-drive'],
          ['128', 'Files', 'file'],
          ['31', 'Videos', 'film'],
          ['46', 'Audio', 'music'],
        ]
          .map(
            ([v, l, ic]) => `
          <div class="col gap-1" style="align-items:center">
            <span style="color:var(--s-primary)">${i(ic, 18)}</span>
            <span class="t-mono-small">${v}</span>
            <span class="t-label-small muted">${l}</span>
          </div>`,
          )
          .join('')}
      </div>

      ${catTree({ counts: true })}
      <div class="chip-rail">
        <button class="chip is-selected">${i('check', 16, 'chip__check')} All</button>
        ${CATS.map(([id, ic]) => `<button class="chip">${i(ic, 16)} ${id}</button>`).join('')}
      </div>

      <div class="media-grid">
        ${LIB.map(([name, ic, meta, dur, badge, badgeLabel]) => `
          <article class="media-card">
            <div class="media-card__thumb">
              <span style="color:var(--s-outline)">${i(ic, 30)}</span>
              ${dur ? `<span class="dl__thumb-dur" style="position:absolute;inset:auto 6px 6px auto">${dur}</span>` : ''}
              <span class="media-card__play">${i('play', 18)}</span>
            </div>
            <div class="media-card__info">
              <span class="badge ${badge}" style="width:fit-content;height:18px">${badgeLabel}</span>
              <span class="media-card__name">${name}</span>
              <span class="media-card__meta">${meta}</span>
            </div>
          </article>`).join('')}
      </div>
    </div>
  </div>
  <nav class="nav">
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('download', 22)}</span><span class="nav__label">Downloads</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('globe', 22)}</span><span class="nav__label">Browser</span></a>
    <a class="nav__item" aria-current="page"><span class="nav__indicator"></span><span class="nav__icon">${i('folder', 22)}</span><span class="nav__label">Library</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('list', 22)}</span><span class="nav__label">Queue</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('settings', 22)}</span><span class="nav__label">Settings</span></a>
  </nav>`;

/* =================================================== SCREEN 6: browser ===== */

const screenBrowser = `
  <header class="appbar" style="padding:0">
    <div class="browser__bar">
      <button class="icon-btn" aria-label="Back">${i('chevron-left', 20)}</button>
      <div class="browser__url">${i('lock', 13)}<span class="truncate">releases.ubuntu.com/noble/</span></div>
      <button class="icon-btn" aria-label="Refresh">${i('refresh', 20)}</button>
      <button class="icon-btn" aria-label="Tabs">${i('layers', 20)}</button>
    </div>
    <div class="progress progress--thin" style="border-radius:0"><div class="progress__fill" style="width:100%"></div></div>
  </header>
  <div class="sniffer">
    ${i('zap', 20)}
    <div class="col grow">
      <span class="t-title-small">2 downloads detected on this page</span>
      <span class="t-body-small" style="opacity:.85">ubuntu-24.04.3-live-server-arm64.iso · 5.84 GB</span>
    </div>
    <button class="btn btn--filled btn--sm">Grab</button>
  </div>
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content col gap-4" style="padding-block:16px">
      <div class="card" style="padding:20px">
        <div class="t-headline-small" style="margin-bottom:6px">Ubuntu 24.04.3 LTS</div>
        <div class="t-body-medium muted" style="margin-bottom:16px">Noble Numbat — released 14 August 2025</div>
        <div class="divider" style="margin-bottom:16px"></div>
        <div class="col gap-3">
          ${['amd64', 'arm64', 'ppc64el', 's390x'].map((a, idx) => `
            <button class="row gap-3 stateful" style="padding:10px;border-radius:12px;background:${idx === 1 ? 'var(--s-primary-container)' : 'var(--s-surface-container-high)'};text-align:start">
              <span style="color:${idx === 1 ? 'var(--s-on-primary-container)' : 'var(--s-on-surface-variant)'}">${i(idx === 1 ? 'check-circle' : 'file', 20)}</span>
              <span class="col grow">
                <span class="t-body-medium">ubuntu-24.04.3-live-server-${a}.iso</span>
                <span class="t-body-small muted">${(5.1 + idx * 0.3).toFixed(2)} GB · SHA256 verified</span>
              </span>
              <span class="icon-btn" style="color:var(--s-primary)">${i('download', 20)}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="t-body-small muted center" style="padding-block:8px">
        ${i('shield', 14)} Surge intercepts every link you tap and offers to accelerate it with 16 segments.
      </div>
    </div>
  </div>
  <nav class="nav">
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('download', 22)}</span><span class="nav__label">Downloads</span></a>
    <a class="nav__item" aria-current="page"><span class="nav__indicator"></span><span class="nav__icon">${i('globe', 22)}</span><span class="nav__label">Browser</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('folder', 22)}</span><span class="nav__label">Library</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('list', 22)}</span><span class="nav__label">Queue</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('settings', 22)}</span><span class="nav__label">Settings</span></a>
  </nav>`;

/* ============================================== SCREEN 7: queue/scheduler == */

const screenQueue = `
  <header class="appbar">
    <div class="appbar__row">
      <span class="appbar__title">Queue & automation</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Add schedule">${i('plus', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content col gap-4" style="padding-block:12px">

      <div class="card card--tonal" style="padding:14px 16px;display:flex;align-items:center;gap:12px">
        ${i('infinity', 24)}
        <div class="col grow">
          <span class="t-title-small">Master queue is running</span>
          <span class="t-body-small" style="opacity:.85">3 of 5 slots used · next starts in ~2 min</span>
        </div>
        <span class="switch" role="switch" aria-checked="true" style="background:var(--s-on-primary-container)"><span class="switch__thumb" style="background:var(--s-primary-container)"></span></span>
      </div>

      <div class="settings-group">
        <div class="setting">
          <span class="setting__icon setting__icon--brand">${i('layers', 20)}</span>
          <span class="col"><span class="setting__title">Simultaneous downloads</span><span class="setting__sub">Higher values split your bandwidth</span></span>
          <span class="setting__value">5 ${i('chevron-right', 18)}</span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('wifi', 20)}</span>
          <span class="col"><span class="setting__title">Wi-Fi only</span><span class="setting__sub">Auto-pause on mobile data</span></span>
          <span class="switch" role="switch" aria-checked="true"><span class="switch__thumb"></span></span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('battery', 20)}</span>
          <span class="col"><span class="setting__title">Pause below 15% battery</span><span class="setting__sub">Unless charging</span></span>
          <span class="switch" role="switch" aria-checked="true"><span class="switch__thumb"></span></span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('zap', 20)}</span>
          <span class="col"><span class="setting__title">Speed limit</span><span class="setting__sub">Down 0 (unlimited) · Up 2 MB/s</span></span>
          <span class="setting__value">${i('sliders', 18)}</span>
        </div>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">Schedule</span><span class="section__action">Edit</span></div>
        <div class="timeline">
          ${[
            ['02:00', 'Night batch', 'Start queue · Wi-Fi only · stop at 06:00', 'clock', true],
            ['07:30', 'Morning pause', 'Pause everything before the commute', 'pause', false],
            ['19:00', 'Podcast sync', 'Fetch new episodes from 3 feeds', 'queue-music', true],
          ]
            .map(
              ([time, t, s, ic, on]) => `
            <div class="timeline__row">
              <span class="timeline__time">${time}</span>
              <span class="col">
                <span class="t-title-small">${t}</span>
                <span class="t-body-small muted">${s}</span>
              </span>
              <span class="row gap-2">
                <span style="color:${on ? 'var(--s-success)' : 'var(--s-outline)'}">${i(ic, 18)}</span>
                <span class="switch" role="switch" aria-checked="${on}" style="transform:scale(.86)"><span class="switch__thumb"></span></span>
              </span>
            </div>`,
            )
            .join('')}
        </div>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">Waiting (2)</span><span class="section__action">Start all</span></div>
        <div class="dl-list">
          ${dlRow({ name: 'lofi-girl-beats-vol-12 → MP3 320 kbps', kind: 'audio', badgeText: 'Audio', state: 'queued', size: '188 MB', meta: 'position 1 · starts after current', actions: ['play', 'close'] })}
          ${dlRow({ name: 'archlinux-2025.10.01-x86_64.iso', kind: 'http', badgeText: 'HTTPS', state: 'queued', size: '1.24 GB', meta: 'position 2 · 16 segments', actions: ['play', 'close'] })}
        </div>
      </div>
    </div>
  </div>
  <nav class="nav">
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('download', 22)}</span><span class="nav__label">Downloads</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('globe', 22)}</span><span class="nav__label">Browser</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('folder', 22)}</span><span class="nav__label">Library</span></a>
    <a class="nav__item" aria-current="page"><span class="nav__indicator"></span><span class="nav__icon">${i('list', 22)}</span><span class="nav__label">Queue</span><span class="nav__badge">2</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('settings', 22)}</span><span class="nav__label">Settings</span></a>
  </nav>`;

/* ================================================== SCREEN 8: settings ===== */

function settingRow(icon, title, sub, value, tone = '') {
  return `
  <div class="setting">
    <span class="setting__icon ${tone}">${i(icon, 20)}</span>
    <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">${title}</span><span class="setting__sub">${sub}</span></span>
    <span class="setting__value">${typeof value === 'string' ? value + ' ' : ''}${i('chevron-right', 18)}</span>
  </div>`;
}

function switchRow(icon, title, sub, on, tone = '') {
  return `
  <div class="setting">
    <span class="setting__icon ${tone}">${i(icon, 20)}</span>
    <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">${title}</span><span class="setting__sub">${sub}</span></span>
    <span class="switch" role="switch" aria-checked="${on}"><span class="switch__thumb"></span></span>
  </div>`;
}

const screenSettings = `
  <header class="appbar">
    <div class="appbar__row">
      <span class="appbar__title">Settings</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Search settings">${i('search', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content col gap-5" style="padding-block:12px">

      <div class="card card--tonal" style="padding:16px;display:flex;align-items:center;gap:14px">
        <span style="width:48px;height:48px;border-radius:16px;background:var(--s-on-primary-container);color:var(--s-primary-container);display:grid;place-items:center">${i('zap', 26)}</span>
        <div class="col grow">
          <span class="t-title-large">Surge Pro</span>
          <span class="t-body-small" style="opacity:.85">Unlimited connections · no ads · cloud sync</span>
        </div>
        <button class="btn btn--filled btn--sm" style="background:var(--s-on-primary-container);color:var(--s-primary-container)">Get</button>
      </div>

      <div class="col gap-2">
        <span class="t-label-large muted" style="padding-inline:4px">Downloads</span>
        <div class="settings-group">
          ${settingRow('layers', 'Max connections per file', 'aria2 split · more segments, faster start', '16')}
          ${settingRow('folder', 'Download folder', 'Internal storage › Download › Surge')}
          ${settingRow('file-question', 'Ask where to save', 'Show a folder picker for every download', 'Always')}
          ${settingRow('hash', 'File naming template', '%(title)s.%(ext)s · de-duplicate', 'Default')}
          ${switchRow('shield', 'Verify checksums', 'SHA-256 / MD5 when the server provides one', true, 'setting__icon--brand')}
          ${switchRow('refresh', 'Auto-retry failed downloads', '3 attempts with exponential back-off', true)}
        </div>
      </div>

      <div class="col gap-2">
        <span class="t-label-large muted" style="padding-inline:4px">Media & conversion</span>
        <div class="settings-group">
          ${settingRow('video', 'Default video quality', 'Used when you do not pick one', '1080p')}
          ${settingRow('gauge', 'Default MP3 bitrate', 'ffmpeg libmp3lame', '320 kbps')}
          ${switchRow('wand', 'Convert to MP3 automatically', 'Runs as soon as the video finishes', false, 'setting__icon--accent')}
          ${switchRow('subtitles', 'Download subtitles', 'Auto-generated when no manual track exists', true)}
          ${settingRow('crop-free', 'Thumbnail embedding', 'Write cover art into MP3/M4A tags', 'On')}
        </div>
      </div>

      <div class="col gap-2">
        <span class="t-label-large muted" style="padding-inline:4px">Appearance</span>
        <div class="settings-group">
          <div class="setting">
            <span class="setting__icon setting__icon--accent">${i('palette', 20)}</span>
            <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Theme</span><span class="setting__sub">9 palettes · light & dark · Material You</span></span>
            <span class="setting__value">Bright Tech ${i('chevron-right', 18)}</span>
          </div>
          ${settingRow('sun', 'Mode', 'Light, dark or follow the system', 'Dark')}
          ${switchRow('sparkles', 'Dynamic colour', 'Sample the palette from your wallpaper', false)}
          ${switchRow('zap', 'Show speed dock', 'Live throughput graph on the Downloads tab', true)}
        </div>
      </div>

      <div class="col gap-2">
        <span class="t-label-large muted" style="padding-inline:4px">Advanced</span>
        <div class="settings-group">
          ${settingRow('cpu', 'Download engine', 'aria2c 1.37.1 (arm64) · RPC on 127.0.0.1', 'aria2')}
          ${settingRow('plug', 'Proxy', 'SOCKS5 / HTTP · per-download override', 'Off')}
          ${switchRow('key', 'Send cookies from browser', 'Needed for age-gated and private media', true)}
          ${switchRow('bell', 'Notifications', 'Progress, completion and errors', true, 'setting__icon--brand')}
          ${settingRow('database', 'Backup & restore', 'Last backup 2 days ago · 128 items')}
          ${settingRow('bug', 'Diagnostic log', 'Share a redacted log when something breaks')}
        </div>
      </div>

      <div class="col gap-2" style="align-items:center;padding-block:8px">
        <span class="t-body-small muted">Surge 3.2.1 (arm64) · build 20261017</span>
        <span class="t-body-small muted">aria2 1.37.1 · yt-dlp 2026.10.15 · ffmpeg 7.1</span>
      </div>
    </div>
  </div>
  <nav class="nav">
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('download', 22)}</span><span class="nav__label">Downloads</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('globe', 22)}</span><span class="nav__label">Browser</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('folder', 22)}</span><span class="nav__label">Library</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('list', 22)}</span><span class="nav__label">Queue</span></a>
    <a class="nav__item" aria-current="page"><span class="nav__indicator"></span><span class="nav__icon">${i('settings', 22)}</span><span class="nav__label">Settings</span></a>
  </nav>`;

/* ==================================================== SCREEN 9: themes ===== */

function themeCardMini(theme, active = false, mode = 'dark') {
  const { colors } = buildTokens(theme, mode);
  return `
  <button class="theme-card ${active ? 'is-active' : ''}" style="--s-primary:${colors.primary};--s-outline-variant:${colors.outlineVariant};--s-surface-container-low:${colors.surfaceContainerLow};--s-on-surface:${colors.onSurface};--s-on-surface-variant:${colors.onSurfaceVariant};--s-state-layer-primary:${colors.primary}22">
    <span class="theme-card__preview">
      <span style="background:${colors.surfaceContainer}"></span>
      <span style="background:${colors.secondary}"></span>
      <span style="background:${colors.tertiary}"></span>
    </span>
    <span class="theme-card__meta">
      <span class="theme-card__name" style="color:${colors.onSurface}">${theme.name}</span>
      <span class="theme-card__use" style="color:${colors.onSurfaceVariant}">${theme.ratio} · ${theme.label.primary}</span>
    </span>
  </button>`;
}

const screenThemes = `
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back">${i('chevron-left', 22)}</button>
      <span class="appbar__title">Theme & colour</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Reset">${i('restart', 20)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:24px">
    <div class="app-content col gap-4" style="padding-block:12px">

      <div class="segmented" role="radiogroup">
        <button class="segmented__opt">${i('sun', 16)} Light</button>
        <button class="segmented__opt is-active">${i('moon', 16)} Dark</button>
        <button class="segmented__opt">${i('smartphone', 16)} System</button>
      </div>

      <div class="card card--tonal" style="padding:12px 16px;display:flex;align-items:center;gap:12px">
        ${i('sparkles', 22)}
        <div class="col grow">
          <span class="t-title-small">Material You</span>
          <span class="t-body-small" style="opacity:.85">Derive the palette from your wallpaper</span>
        </div>
        <span class="switch" role="switch" aria-checked="false" style="background:var(--s-on-primary-container)"><span class="switch__thumb" style="background:var(--s-primary-container)"></span></span>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">Palettes</span><span class="t-label-medium muted">9 available</span></div>
        <div class="theme-grid">
          ${BRAND_THEMES.map((t) => themeCardMini(t, t.id === DEFAULT_THEME_ID, 'dark')).join('')}
        </div>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">Tonal ramp preview</span></div>
        <div class="col gap-2">
          <span class="t-label-small muted">PRIMARY</span>
          <div class="tone-strip">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99]
            .map((t) => `<span style="background:${tonalPalette('#2D3047')[t] || '#888'}"></span>`)
            .join('')}</div>
          <span class="t-label-small muted" style="margin-top:6px">SECONDARY</span>
          <div class="tone-strip">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99]
            .map((t) => `<span style="background:${tonalPalette('#2EC4B6')[t] || '#888'}"></span>`)
            .join('')}</div>
          <span class="t-label-small muted" style="margin-top:6px">ACCENT</span>
          <div class="tone-strip">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99]
            .map((t) => `<span style="background:${tonalPalette('#FF7A59')[t] || '#888'}"></span>`)
            .join('')}</div>
        </div>
      </div>
    </div>
  </div>`;

/* =============================================== SCREEN 10: detail + sheet = */

const screenDetail = `
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back">${i('chevron-left', 22)}</button>
      <span class="appbar__title truncate">ubuntu-24.04.3-live-server-arm64.iso</span>
      <button class="icon-btn" aria-label="More options">${i('more-v', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:24px">
    <div class="app-content col gap-4" style="padding-block:12px">

      <div class="card" style="padding:20px;display:flex;flex-direction:column;gap:16px;align-items:center">
        <div style="position:relative;width:132px;height:132px">
          <svg class="ring" width="132" height="132" viewBox="0 0 132 132">
            <circle class="ring__track" cx="66" cy="66" r="58" stroke-width="10"/>
            <circle class="ring__fill" cx="66" cy="66" r="58" stroke-width="10" stroke-dasharray="${(2 * Math.PI * 58).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 58 * (1 - 0.41)).toFixed(1)}"/>
          </svg>
          <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
            <div class="col">
              <span class="t-display-small" style="font-size:30px;line-height:1">41<span style="font-size:16px">%</span></span>
              <span class="t-label-small muted">2.39 / 5.84 GB</span>
            </div>
          </div>
        </div>
        <div class="row gap-2" style="justify-content:center">
          <button class="icon-btn" style="width:56px;height:56px;background:var(--s-surface-container-high)">${i('stop', 22)}</button>
          <button class="fab" style="position:static;width:72px;height:72px;background:var(--s-primary);color:var(--s-on-primary)">${i('pause', 28)}</button>
          <button class="icon-btn" style="width:56px;height:56px;background:var(--s-surface-container-high)">${i('restart', 22)}</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;text-align:center">
          ${[
            ['2.1 MB/s', 'Speed'],
            ['27 min', 'Remaining'],
            ['16 / 16', 'Segments'],
          ]
            .map(
              ([v, l]) => `
            <div class="col">
              <span class="t-mono-medium">${v}</span>
              <span class="t-label-small muted">${l}</span>
            </div>`,
            )
            .join('')}
        </div>
      </div>

      <div class="card card--filled" style="padding:14px 16px">
        <div class="t-label-medium muted" style="margin-bottom:10px">SEGMENT MAP</div>
        <div style="display:flex;gap:3px;height:34px">
          ${Array.from({ length: 16 }, (_, idx) => {
            const p = [100, 100, 100, 96, 88, 74, 61, 44, 38, 22, 14, 9, 4, 2, 0, 0][idx];
            return `<span style="flex:1;border-radius:3px;background:var(--s-surface-container-highest);position:relative;overflow:hidden"><span style="position:absolute;inset-block-end:0;inset-inline:0;height:${p}%;background:${p > 0 ? 'var(--s-primary)' : 'transparent'};border-radius:3px"></span></span>`;
          }).join('')}
        </div>
        <div class="t-body-small muted" style="margin-top:10px">
          ${i('info', 13)} the engine opens 16 byte-range connections; segments that finish early are re-split
          so no connection sits idle.
        </div>
      </div>

      <div class="settings-group">
        ${[
          ['link', 'URL', 'https://releases.ubuntu.com/noble/ubuntu-24.04.3…'],
          ['folder', 'Saved to', 'Internal storage › Download › Surge'],
          ['clock', 'Started', 'Today, 09:12 · 8 min ago'],
          ['shield', 'Integrity', 'SHA-256 pending · verified on completion'],
          ['server', 'Server', 'nginx · supports resume · 1 mirror'],
        ]
          .map(
            ([ic, t, s]) => `
        <div class="setting">
          <span class="setting__icon">${i(ic, 20)}</span>
          <span class="col" style="min-width:0"><span class="setting__title" style="font-size:14px;line-height:18px">${t}</span><span class="setting__sub truncate">${s}</span></span>
          <span class="setting__value">${i('copy', 18)}</span>
        </div>`,
          )
          .join('')}
      </div>
    </div>
  </div>
  <div class="scrim is-visible" style="position:absolute"></div>
  <div class="sheet is-open" style="position:absolute;max-height:52%">
    <div class="sheet__grabber"></div>
    <div class="sheet__head">
      <span class="sheet__title">Speed limit</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Close">${i('close', 20)}</button>
    </div>
    <div class="sheet__body col gap-4">
      <div class="col gap-2">
        <div class="row-between"><span class="t-label-medium muted">DOWNLOAD</span><span class="t-mono-medium">5.0 MB/s</span></div>
        <input class="slider" type="range" style="--fill:42%" readonly value="42"/>
      </div>
      <div class="col gap-2">
        <div class="row-between"><span class="t-label-medium muted">UPLOAD</span><span class="t-mono-medium">1.0 MB/s</span></div>
        <input class="slider" type="range" style="--fill:18%" readonly value="18"/>
      </div>
      <div class="chip-rail">
        <button class="chip">Unlimited</button>
        <button class="chip is-selected">Custom</button>
        <button class="chip">Night (2 MB/s)</button>
        <button class="chip">Data saver</button>
      </div>
    </div>
    <div class="sheet__foot">
      <button class="btn btn--text grow">Reset</button>
      <button class="btn btn--filled grow">Apply</button>
    </div>
  </div>`;

/* ================================================= SCREEN 11: notifications */

const screenSystem = `
  <div class="col gap-4" style="padding:16px;background:var(--s-background);min-height:100%">
    <div class="t-label-large muted">ONGOING · DOWNLOADS</div>
    <div class="notif">
      <div class="notif__head">
        <span style="width:16px;height:16px;border-radius:5px;background:var(--s-brand);display:grid;place-items:center;color:var(--s-on-brand)">${i('zap', 10)}</span>
        <span class="notif__app">Surge</span>
        <span class="notif__time">now</span>
      </div>
      <div class="notif__title">Downloading 3 files · 18.2 MB/s</div>
      <div class="progress" style="height:4px"><div class="progress__fill" style="width:63%"></div></div>
      <div class="notif__body">Big Buck Bunny [1080p].mp4 — 63% · 2 min 41 s left</div>
      <div class="notif__actions">
        <span class="notif__action">Pause all</span>
        <span class="notif__action">Queue</span>
        <span class="notif__action">Stop</span>
      </div>
    </div>
    <div class="notif">
      <div class="notif__head">
        <span style="width:16px;height:16px;border-radius:5px;background:var(--s-brand);display:grid;place-items:center;color:var(--s-on-brand)">${i('zap', 10)}</span>
        <span class="notif__app">Surge · ubuntu-24.04.3-live-server-arm64.iso</span>
        <span class="notif__time">2m</span>
      </div>
      <div class="progress" style="height:4px"><div class="progress__fill progress__fill--striped" style="width:41%"></div></div>
      <div class="notif__body">41% of 5.84 GB · 2.1 MB/s · 27 min left</div>
    </div>

    <div class="t-label-large muted" style="margin-top:8px">COMPLETED</div>
    <div class="notif">
      <div class="notif__head">
        <span style="width:16px;height:16px;border-radius:5px;background:var(--s-success);color:#fff;display:grid;place-items:center">${i('check', 10)}</span>
        <span class="notif__app">Surge</span>
        <span class="notif__time">just now</span>
      </div>
      <div class="notif__title">Download complete</div>
      <div class="notif__body">instagram_reel_9f31ac72.mp4 · 18.7 MB · saved to Movies/Instagram</div>
      <div class="notif__actions">
        <span class="notif__action">Open</span>
        <span class="notif__action">Share</span>
        <span class="notif__action">Delete</span>
      </div>
    </div>
    <div class="notif">
      <div class="notif__head">
        <span style="width:16px;height:16px;border-radius:5px;background:var(--s-error);color:#fff;display:grid;place-items:center">${i('alert', 10)}</span>
        <span class="notif__app">Surge</span>
        <span class="notif__time">5m</span>
      </div>
      <div class="notif__title">Download failed — will retry</div>
      <div class="notif__body">ProjectAssets_v7.zip · server closed the connection (attempt 2 of 3)</div>
      <div class="notif__actions"><span class="notif__action">Retry now</span><span class="notif__action">Details</span></div>
    </div>

    <div class="t-label-large muted" style="margin-top:8px">HOME SCREEN WIDGET · 4×2</div>
    <div class="widget">
      <div class="widget__row">
        <span style="width:22px;height:22px;border-radius:7px;background:var(--s-brand);color:var(--s-on-brand);display:grid;place-items:center">${i('zap', 13)}</span>
        <span class="widget__title">3 active · 18.2 MB/s</span>
        <span class="widget__speed">↓18.2 ↑1.8</span>
      </div>
      <div class="progress progress--thin"><div class="progress__fill progress__fill--striped" style="width:63%"></div></div>
      <div class="widget__row">
        <span class="t-body-small muted truncate grow">Big Buck Bunny [1080p].mp4 · 63%</span>
        <span class="icon-btn" style="width:30px;height:30px;color:var(--s-primary)">${i('pause', 16)}</span>
        <span class="icon-btn" style="width:30px;height:30px;color:var(--s-primary)">${i('plus', 16)}</span>
      </div>
    </div>
    <div class="widget" style="background:var(--s-surface-container-high)">
      <div class="widget__row">
        <span style="width:22px;height:22px;border-radius:7px;background:var(--s-brand);color:var(--s-on-brand);display:grid;place-items:center">${i('zap', 13)}</span>
        <span class="widget__title">All downloads complete</span>
      </div>
      <div class="t-body-small muted">Tap to open Library · 128 files · 14.6 GB</div>
    </div>
  </div>`;

/* ================================================== SCREEN 12: empty state = */

const screenEmpty = `
  <header class="appbar">
    <div class="appbar__row">
      <span class="appbar__title">Downloads</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Search">${i('search', 22)}</button>
      <button class="icon-btn" aria-label="More options">${i('more-v', 22)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content">
      <div class="empty" style="min-height:420px">
        <div class="empty__art">${i('arrow-down-tray', 44)}</div>
        <div class="empty__title">Nothing downloading yet</div>
        <div class="empty__body">
          Paste a link, drop in a magnet, or browse the web — Surge sniffs every
          downloadable file and offers to accelerate it.
        </div>
        <div class="row gap-3" style="margin-top:8px">
          <button class="btn btn--filled">${i('link', 18)} Paste link</button>
          <button class="btn btn--outlined">${i('magnet', 18)} Magnet</button>
        </div>
        <div class="row gap-2" style="margin-top:20px;flex-wrap:wrap;justify-content:center">
          <span class="badge badge--youtube">YouTube</span>
          <span class="badge badge--instagram">Instagram</span>
          <span class="badge badge--torrent">Torrents</span>
          <span class="badge badge--http">HTTP/FTP</span>
          <span class="badge badge--audio">MP3</span>
        </div>
      </div>
    </div>
  </div>
  <button class="fab fab--extended fab--brand">${i('plus', 22)} New download</button>
  <nav class="nav">
    <a class="nav__item" aria-current="page"><span class="nav__indicator"></span><span class="nav__icon">${i('download', 22)}</span><span class="nav__label">Downloads</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('globe', 22)}</span><span class="nav__label">Browser</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('folder', 22)}</span><span class="nav__label">Library</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('list', 22)}</span><span class="nav__label">Queue</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('settings', 22)}</span><span class="nav__label">Settings</span></a>
  </nav>`;

/* =================================================== SCREEN 13: speedial === */

// Reuse the Downloads screen but drop its FAB — the speedial supplies the
// rotated one, and two stacked FABs would z-fight.
const screenSpeedial = `
  ${screenDownloads.replace(/<button class="fab fab--brand"[\s\S]*?<\/button>/, '')}
  <div class="scrim is-visible" style="position:absolute"></div>
  <div class="speedial is-open" style="position:absolute;inset-block-end:132px">
    <div class="speedial__item"><span class="speedial__label">Paste link</span><span class="mini-fab">${i('link', 20)}</span></div>
    <div class="speedial__item"><span class="speedial__label">Magnet / .torrent</span><span class="mini-fab">${i('magnet', 20)}</span></div>
    <div class="speedial__item"><span class="speedial__label">From clipboard</span><span class="mini-fab">${i('clipboard', 20)}</span></div>
    <div class="speedial__item"><span class="speedial__label">Batch links</span><span class="mini-fab">${i('list', 20)}</span></div>
    <div class="speedial__item"><span class="speedial__label">Open browser</span><span class="mini-fab">${i('browser', 20)}</span></div>
  </div>
  <button class="fab fab--brand" style="transform:rotate(45deg)">${i('plus', 26)}</button>`;

/* =================================================== SCREEN 14: multiselect */

const screenMultiSelect = `
  <div class="ctx-bar is-open" style="position:absolute">
    <button class="icon-btn" aria-label="Clear selection">${i('close', 22)}</button>
    <span class="ctx-bar__count">4 selected</span>
    <div class="ctx-bar__actions">
      <button class="icon-btn" aria-label="Resume">${i('play', 20)}</button>
      <button class="icon-btn" aria-label="Pause">${i('pause', 20)}</button>
      <button class="icon-btn" aria-label="Move to folder">${i('folder', 20)}</button>
      <button class="icon-btn" aria-label="Share">${i('share', 20)}</button>
      <button class="icon-btn" aria-label="Delete">${i('trash', 20)}</button>
      <button class="icon-btn" aria-label="More">${i('more-v', 20)}</button>
    </div>
  </div>
  <div style="height:64px"></div>
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content col gap-3" style="padding-block:8px">
      <div class="dl-list">
        ${dlRow({ name: 'Big Buck Bunny — 4K Remux [1080p].mp4', kind: 'youtube', badgeText: 'YouTube', state: 'active', pct: 63, size: '4.21 GB', done: '2.65 GB', speed: '9.8 MB/s', eta: '2 min 41 s', segments: 8, meta: '1080p · MP4' }).replace('class="dl"', 'class="dl is-selected"')}
        ${dlRow({ name: 'ubuntu-24.04.3-live-server-arm64.iso', kind: 'http', badgeText: 'HTTPS', state: 'active', pct: 41, size: '5.84 GB', done: '2.39 GB', speed: '2.1 MB/s', eta: '27 min', segments: 16, meta: 'resumable' }).replace('class="dl"', 'class="dl is-selected"')}
        ${dlRow({ name: 'Debian 12.7 DVD-1 (multi-file torrent)', kind: 'torrent', badgeText: 'Magnet', state: 'active', pct: 88, size: '4.70 GB', done: '4.14 GB', speed: '0.5 MB/s', eta: '18 min', meta: 'S 214 · P 12' }).replace('class="dl"', 'class="dl is-selected"')}
        ${dlRow({ name: 'instagram_reel_9f31ac72.mp4', kind: 'instagram', badgeText: 'Instagram', state: 'complete', pct: 100, size: '18.7 MB', done: '18.7 MB', meta: 'Movies/Instagram' }).replace('class="dl"', 'class="dl is-selected"')}
        ${dlRow({ name: 'ProjectAssets_v7.zip', kind: 'archive', badgeText: '', state: 'paused', pct: 24, size: '1.09 GB', done: '262 MB', meta: 'paused · Wi-Fi only' })}
      </div>
      <div class="t-body-small muted center">Long-press a row to enter selection · drag with ${i('drag-handle', 13)} to reorder the queue</div>
    </div>
  </div>
  <nav class="nav">
    <a class="nav__item" aria-current="page"><span class="nav__indicator"></span><span class="nav__icon">${i('download', 22)}</span><span class="nav__label">Downloads</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('globe', 22)}</span><span class="nav__label">Browser</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('folder', 22)}</span><span class="nav__label">Library</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('list', 22)}</span><span class="nav__label">Queue</span></a>
    <a class="nav__item"><span class="nav__indicator"></span><span class="nav__icon">${i('settings', 22)}</span><span class="nav__label">Settings</span></a>
  </nav>`;

/* ================================================ SCREEN: storage/filing === */

const screenStorage = `
  <header class="appbar">
    <div class="appbar__row">
      <button class="icon-btn" aria-label="Back">${i('chevron-left', 22)}</button>
      <span class="appbar__title">Storage & auto-filing</span>
      <div class="grow"></div>
      <button class="icon-btn" aria-label="Refresh">${i('refresh', 20)}</button>
    </div>
  </header>
  <div class="app-main" style="padding-bottom:24px">
    <div class="app-content col gap-4" style="padding-block:12px">

      <div class="card card--tonal" style="padding:14px 16px;display:flex;align-items:center;gap:12px">
        ${i('folder-open', 24)}
        <div class="col grow" style="min-width:0">
          <span class="t-title-small">Internal storage › Download › Surge</span>
          <span class="t-body-small" style="opacity:.85">14.6 GB · 128 files · 10 category folders</span>
        </div>
        <button class="icon-btn icon-btn--on-brand" aria-label="Change root">${i('edit', 20)}</button>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head">
          <span class="section__title">Category folders</span>
          <span class="t-label-medium muted">auto-created</span>
        </div>
        ${catTree({})}
        <div class="t-body-small muted" style="padding:10px 4px 0">
          ${i('info', 13)} Every download is filed the moment it is added — classified from
          filename, then URL, then MIME, then source type. Finished files never move, so
          what you see in a file manager is exactly what Surge recorded.
        </div>
      </div>

      <div class="settings-group">
        <div class="setting">
          <span class="setting__icon setting__icon--brand">${i('seedling', 20)}</span>
          <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Show in Gallery & Music</span><span class="setting__sub">Index videos / music / photos via MediaStore</span></span>
          <span class="switch" role="switch" aria-checked="true"><span class="switch__thumb"></span></span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('torrent', 20)}</span>
          <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Torrent payloads follow file type</span><span class="setting__sub">.iso → compressed, .mkv → videos, not torrents/</span></span>
          <span class="switch" role="switch" aria-checked="true"><span class="switch__thumb"></span></span>
        </div>
        <div class="setting">
          <span class="setting__icon">${i('hash', 20)}</span>
          <span class="col"><span class="setting__title" style="font-size:15px;line-height:20px">Custom rules</span><span class="setting__sub">.cbz → compressed · .stl → others</span></span>
          <span class="setting__value">2 ${i('chevron-right', 18)}</span>
        </div>
      </div>

      <div class="section" style="padding-block:0">
        <div class="section__head"><span class="section__title">Recently filed</span><span class="section__action">Open Library</span></div>
        <div class="col gap-2">
          ${[
            ['Big Buck Bunny — 4K Remux [1080p].mp4', 'videos', 'film'],
            ['lofi-girl-beats-vol-12.mp3', 'music', 'music'],
            ['instagram_reel_9f31ac72.mp4', 'videos', 'instagram'],
            ['ubuntu-24.04.3-live-server-arm64.iso', 'compressed', 'cloud'],
            ['surge-3.2.1-arm64.apk', 'programs', 'apk'],
          ].map(([n, c, ic]) => `
          <div class="card stateful" style="padding:10px 14px;display:flex;align-items:center;gap:12px">
            <span style="color:var(--s-on-surface-variant)">${i(ic, 20)}</span>
            <span class="col grow" style="min-width:0">
              <span class="t-body-medium truncate">${n}</span>
              <span class="t-body-small muted" style="font-family:var(--s-font-mono)">Surge/${c}/</span>
            </span>
            <span class="badge badge--neutral">filed</span>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;

/* ================================================== SCREEN 0: elegant home == */

const screenHome = `
  <div class="app-main" style="padding-bottom:96px">
    <div class="app-content" style="padding-block:8px">

      <div class="pagehero">
        <span class="pagehero__title">Surge</span>
        <span class="pagehero__sub">Paste anything. We'll find the fastest way to keep it.</span>
      </div>

      <button class="searchbar" aria-label="Paste a link to download">
        ${i('search', 22)}
        <span class="searchbar__input" style="display:flex;align-items:center;opacity:.75">Paste a link, or search YouTube…</span>
        <span class="searchbar__cta">${i('clipboard', 20)}</span>
      </button>

      <div style="height:22px"></div>

      <div class="quick">
        <button class="quick__btn">${i('browser', 22)}<span class="quick__label">Browser</span></button>
        <button class="quick__btn">${i('magnet', 22)}<span class="quick__label">Torrent</span></button>
        <button class="quick__btn">${i('list', 22)}<span class="quick__label">Batch</span></button>
        <button class="quick__btn">${i('music', 22)}<span class="quick__label">MP3</span></button>
      </div>

      <div style="height:30px"></div>
      <div class="row-between" style="margin-bottom:14px">
        <span class="eyebrow">In progress</span>
        <span class="t-label-medium" style="color:var(--s-primary)">Downloads</span>
      </div>
      <div class="dl-list">
        ${dlRow({ name: 'Big Buck Bunny — 4K Remux [1080p].mp4', kind: 'youtube', badgeText: 'YouTube', state: 'active', pct: 63, size: '4.21 GB', done: '2.65 GB', speed: '9.8 MB/s', eta: '2 min 41 s', meta: '1080p · videos/', duration: '9:56', actions: ['pause'] })}
        ${dlRow({ name: 'lofi-girl-beats-vol-12 → MP3 320', kind: 'audio', badgeText: 'Audio', state: 'active', pct: 22, size: '188 MB', done: '41 MB', speed: '2.4 MB/s', eta: '1 min', meta: 'music/', actions: ['pause'] })}
      </div>
    </div>
  </div>
  <button class="fab fab--brand" aria-label="New download">${i('plus', 26)}</button>
  ${nav4('home')}`;

/* ========================================================= PAGE ASSEMBLY === */

const SHOTS = [
  { n: '00', t: 'Home', c: 'One hero action, a discover rail and what is moving right now. Nothing else.', s: screenHome, theme: DEFAULT_THEME_ID, mode: 'light', h: 860 },
  { n: '01', t: 'Downloads', c: 'Live speed dock, filter rail, per-row segment ticks and state spines.', s: screenDownloads, theme: DEFAULT_THEME_ID, mode: 'dark' },
  { n: '02', t: 'Format picker', c: '240p → 2160p grid, audio-only MP3 conversion, subtitles, playlist detection.', s: screenMediaPicker, theme: DEFAULT_THEME_ID, mode: 'dark', h: 900 },
  { n: '03', t: 'New download', c: 'Paste a link and the source type is detected instantly.', s: screenAdd, theme: DEFAULT_THEME_ID, mode: 'dark', h: 900 },
  { n: '04', t: 'Torrent inspector', c: 'Selectable file tree, seeds/peers, trackers, ratio limits.', s: screenTorrent, theme: DEFAULT_THEME_ID, mode: 'dark', h: 940 },
  { n: '05', t: 'Download detail', c: 'Ring progress, 16-segment map, speed-limit bottom sheet.', s: screenDetail, theme: DEFAULT_THEME_ID, mode: 'dark', h: 860 },
  { n: '06', t: 'Library', c: 'Everything you have saved, grouped by type, with a built-in player.', s: screenLibrary, theme: DEFAULT_THEME_ID, mode: 'light' },
  { n: '07', t: 'Browser + sniffer', c: 'A real browser tab that detects downloadable media on the page.', s: screenBrowser, theme: 'cyber-contrast', mode: 'dark' },
  { n: '08', t: 'Queue & automation', c: 'Concurrency, Wi-Fi/battery guards, speed caps and timed schedules.', s: screenQueue, theme: 'classic-corporate', mode: 'light', h: 900 },
  { n: '09', t: 'Settings', c: 'Engine, conversion, appearance and diagnostics in one place.', s: screenSettings, theme: 'eco-organic', mode: 'light', h: 1000 },
  { n: '10', t: 'Themes', c: 'Nine palettes from the brief, each in light and dark, plus Material You.', s: screenThemes, theme: DEFAULT_THEME_ID, mode: 'dark', h: 900 },
  { n: '11', t: 'Speedial', c: 'The FAB expands into the five ways to start a download.', s: screenSpeedial, theme: DEFAULT_THEME_ID, mode: 'dark' },
  { n: '12', t: 'Multi-select', c: 'Long-press for a contextual action bar with batch operations.', s: screenMultiSelect, theme: 'energetic-retail', mode: 'dark' },
  { n: '13', t: 'Empty state', c: 'Never a dead end — always an obvious next action.', s: screenEmpty, theme: 'high-end-trio', mode: 'dark' },
  { n: '14', t: 'Storage & auto-filing', c: 'The 1DM-style tree: one root, ten category folders, files filed on add.', s: screenStorage, theme: DEFAULT_THEME_ID, mode: 'light', h: 980 },
  { n: '15', t: 'Notifications & widget', c: 'Grouped progress notifications and the 4×2 home-screen widget.', s: screenSystem, theme: DEFAULT_THEME_ID, mode: 'dark', h: 1000 },
];

const paletteGallery = BRAND_THEMES.map((t) => {
  const l = buildTokens(t, 'light').colors;
  const d = buildTokens(t, 'dark').colors;
  const swatch = (label, c) => `
    <div class="pal__mode">
      <span class="pal__mode-label">${label}</span>
      <div class="pal__row">
        <span style="background:${c.surface}" title="surface ${c.surface}"></span>
        <span style="background:${c.surfaceContainerHigh}" title="container ${c.surfaceContainerHigh}"></span>
        <span style="background:${c.primary}" title="primary ${c.primary}"></span>
        <span style="background:${c.secondary}" title="secondary ${c.secondary}"></span>
        <span style="background:${c.tertiary}" title="tertiary ${c.tertiary}"></span>
        <span style="background:${c.error}" title="error ${c.error}"></span>
        <span style="background:${c.success}" title="success ${c.success}"></span>
      </div>
    </div>`;
  return `
  <article class="pal">
    <header class="pal__head">
      <h3>${t.name}</h3>
      <span class="pal__kind">${t.kind === 'dual' ? 'Dual' : 'Triple'} · ${t.ratio}</span>
    </header>
    <p class="pal__use">${t.use}</p>
    ${swatch('LIGHT', l)}
    ${swatch('DARK', d)}
    <footer class="pal__seeds">
      ${Object.entries(t.label)
        .map(([k, v]) => `<span><b style="background:${t.seed[k === 'primary' ? 'primary' : k === 'secondary' ? 'secondary' : 'accent']}"></b>${v}</span>`)
        .join('')}
    </footer>
  </article>`;
}).join('');

const iconGallery = Object.keys(ICONS)
  .map((n) => `<span class="ig__cell" title="${n}">${i(n, 22)}<em>${n}</em></span>`)
  .join('');

const html = `<!doctype html>
<html lang="en" class="theme-${DEFAULT_THEME_ID} mode-dark">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Surge — Android Downloader · UI Mockup</title>
<style>
${themesCss}
${baseCss}
${componentsCss}

/* ---------------- mockup page chrome (not shipped in the app) ------------- */
html.doc { background:#0b0c10; }
body.doc {
  overflow-x:hidden;
  background:
    radial-gradient(1200px 700px at 12% -8%, #1b2440 0%, transparent 60%),
    radial-gradient(900px 600px at 92% 4%, #10262a 0%, transparent 55%),
    #0b0c10;
  color:#e7e9ef;
  font-family: var(--s-font-sans);
  padding-bottom:96px;
}
.doc-wrap { max-width:1440px; margin-inline:auto; padding:0 clamp(14px, 4vw, 24px); overflow-x:clip; }

.hero { padding:72px 0 40px; border-bottom:1px solid #ffffff14; margin-bottom:48px; }
.hero__eyebrow { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:999px;
  background:#ffffff0d; border:1px solid #ffffff1a; color:#9fe8df; font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; }
.hero h1 { font-size:clamp(40px,6vw,68px); line-height:1.02; font-weight:600; letter-spacing:-.03em; margin:20px 0 14px;
  background:linear-gradient(100deg,#fff 20%,#8fe3d9 55%,#ff9d84 90%); -webkit-background-clip:text; background-clip:text; color:transparent; }
.hero p { font-size:18px; line-height:1.6; color:#a9aebd; max-width:70ch; }
.hero__meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
.hero__meta span { padding:7px 14px; border-radius:999px; background:#ffffff0a; border:1px solid #ffffff14;
  font-size:13px; color:#c8ccd8; font-variant-numeric:tabular-nums; }

h2.sec { font-size:clamp(26px,3.4vw,38px); font-weight:600; letter-spacing:-.02em; margin:64px 0 8px; }
p.sec-sub { color:#a0a5b4; font-size:16px; line-height:1.6; max-width:78ch; margin-bottom:28px; }

/* phone frame */
.shots { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr)); gap:44px 28px; justify-items:center; }
.shot { margin:0; display:flex; flex-direction:column; align-items:center; gap:16px; width:100%; min-width:0; }
.phone {
  width:min(340px,100%); height:var(--phone-h,780px); border-radius:44px; padding:9px; position:relative;
  display:flex; flex-direction:column;
  background:linear-gradient(160deg,#3a3d47,#15161b 45%,#2a2c34);
  box-shadow:0 30px 70px -20px #000c, 0 0 0 1px #ffffff1a, inset 0 0 0 1px #ffffff0d;
  flex:0 0 auto;
}
.phone::before { content:''; position:absolute; top:15px; left:50%; transform:translateX(-50%);
  width:96px; height:22px; border-radius:999px; background:#0a0a0c; z-index:5; }
/* The screen is a flex child BETWEEN the status bar and the gesture strip, so
   app content can never draw into the notification-panel area or past the
   bottom gesture zone. (It used to be inset:9px absolute, which overlaid the
   status bar - content appeared to slide under the notification shade.) */
.phone__screen { position:relative; flex:1 1 auto; min-height:0; border-radius:0 0 30px 30px; overflow:hidden; background:var(--s-background);
  color:var(--s-on-surface); display:flex; flex-direction:column;
  /* transform + contain:paint make this element the containing block for
     position:fixed descendants, so the bottom nav, FAB, sheets and scrim stay
     inside the handset instead of pinning to the browser viewport. */
  transform:translateZ(0); contain:paint; }
.phone__screen > * { flex:0 0 auto; }
.phone__screen .app-main { flex:1 1 auto; overflow:hidden; }
.mock-statusbar { flex:0 0 auto; height:36px; display:flex; align-items:flex-end; justify-content:space-between;
  padding:0 22px 5px; font-size:12px; font-weight:600; border-radius:30px 30px 0 0;
  background:var(--s-surface-container); color:var(--s-on-surface); }
.mock-statusbar.is-dark { }
.mock-statusbar__icons { display:flex; align-items:center; gap:5px; }
.mock-navbar { flex:0 0 auto; height:24px; display:flex; align-items:center; justify-content:center;
  border-radius:0 0 30px 30px; background:var(--s-surface-container); }
.mock-navbar__pill { width:110px; height:4px; border-radius:999px; background:var(--s-on-surface); opacity:.55; }
.shot__cap { display:flex; gap:12px; align-items:flex-start; text-align:left; max-width:min(340px,100%); }
.shot__num { font-family:var(--s-font-mono); font-size:11px; font-weight:700; color:#8fe3d9;
  border:1px solid #8fe3d94d; border-radius:7px; padding:3px 7px; line-height:1; flex:0 0 auto; margin-top:2px; }
.shot__cap strong { display:block; font-size:16px; font-weight:600; color:#f0f2f7; letter-spacing:-.01em; }
.shot__cap em { display:block; font-style:normal; font-size:13.5px; line-height:1.5; color:#9aa0b0; margin-top:3px; }

/* palette gallery */
.pals { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr)); gap:20px; }
.pal { border:1px solid #ffffff14; border-radius:20px; background:#12131a; padding:18px; }
.pal__head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.pal__head h3 { font-size:17px; font-weight:600; color:#f0f2f7; }
.pal__kind { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#8fe3d9;
  border:1px solid #8fe3d93d; padding:3px 8px; border-radius:999px; white-space:nowrap; }
.pal__use { font-size:13px; color:#9aa0b0; margin:6px 0 14px; line-height:1.45; }
.pal__mode { margin-bottom:10px; }
.pal__mode-label { font-size:10px; letter-spacing:.14em; color:#6f7486; font-weight:700; }
.pal__row { display:flex; gap:5px; margin-top:5px; }
.pal__row span { flex:1; height:34px; border-radius:7px; box-shadow:inset 0 0 0 1px #ffffff14; }
.pal__seeds { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; padding-top:12px; border-top:1px solid #ffffff0f; }
.pal__seeds span { display:flex; align-items:center; gap:6px; font-size:11.5px; color:#9aa0b0; }
.pal__seeds b { width:13px; height:13px; border-radius:4px; box-shadow:inset 0 0 0 1px #ffffff2a; }

/* icons */
.ig { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(96px,22vw),1fr)); gap:8px; }
.ig__cell { display:flex; flex-direction:column; align-items:center; gap:7px; padding:12px 4px; border-radius:12px;
  border:1px solid #ffffff0f; background:#12131a; color:#dfe2ea; }
.ig__cell em { font-style:normal; font-size:9.5px; color:#7c8195; text-align:center; line-height:1.25; word-break:break-word; }
.ig__cell:hover { border-color:#8fe3d96b; color:#8fe3d9; }

/* principles */
.prin { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr)); gap:16px; }
.prin__card { border:1px solid #ffffff14; border-radius:18px; background:#12131a; padding:20px; }
.prin__card h4 { font-size:15px; font-weight:600; color:#f0f2f7; margin-bottom:8px; display:flex; align-items:center; gap:9px; }
.prin__card h4 span { width:28px; height:28px; border-radius:9px; display:grid; place-items:center; background:#8fe3d91f; color:#8fe3d9; }
.prin__card p { font-size:13.5px; line-height:1.6; color:#9aa0b0; }

.arch { border:1px solid #ffffff14; border-radius:18px; background:#12131a; padding:22px; overflow-x:auto; }
.arch table { border-collapse:collapse; width:100%; font-size:13.5px; }
.arch th { text-align:left; color:#8fe3d9; font-weight:600; padding:8px 14px 8px 0; font-size:11px;
  letter-spacing:.1em; text-transform:uppercase; border-bottom:1px solid #ffffff14; white-space:nowrap; }
.arch td { padding:11px 14px 11px 0; border-bottom:1px solid #ffffff0a; color:#c3c7d4; vertical-align:top; line-height:1.5; }
.arch td:first-child { color:#f0f2f7; font-weight:600; white-space:nowrap; }
.arch code { font-family:var(--s-font-mono); font-size:12.5px; background:#ffffff0d; padding:1.5px 6px; border-radius:5px; color:#9fe8df; }

.foot { margin-top:80px; padding-top:28px; border-top:1px solid #ffffff14; color:#6f7486; font-size:13px; line-height:1.7; }
</style>
</head>
<body class="doc">
${sprite()}
<div class="doc-wrap">

  <header class="hero">
    <span class="hero__eyebrow">${i('zap', 13)} UI mockup · v1</span>
    <h1>Surge</h1>
    <p>A power-user download manager for Android — YouTube, Instagram, torrents, magnets, plain HTTP and
       MP3 conversion in one queue. Vue&nbsp;3 + Vite + Capacitor on the front, a bundled
       <code style="font-family:var(--s-font-mono);color:#9fe8df">segmented HTTP</code> /
       <code style="font-family:var(--s-font-mono);color:#9fe8df">yt-dlp</code> /
       <code style="font-family:var(--s-font-mono);color:#9fe8df">ffmpeg</code> toolchain underneath.</p>
    <div class="hero__meta">
      <span>14 screens</span>
      <span>9 palettes × light/dark = 18 token sets</span>
      <span>${Object.keys(ICONS).length} hand-drawn icons</span>
      <span>468 WCAG contrast checks passing</span>
      <span>minSdk 24 · targetSdk 35 · JDK 21</span>
    </div>
  </header>

  <h2 class="sec">The app</h2>
  <p class="sec-sub">Every frame below is rendered with the real component CSS and the real generated
     design tokens — the same files the app imports. Colours, spacing, radii and type are not approximations.</p>
  <div class="shots">
    ${SHOTS.map((s) => phone({ title: s.t, caption: s.c, badge: s.n, theme: s.theme, mode: s.mode, body: s.s, height: s.h || 780 })).join('\n')}
  </div>

  <h2 class="sec">Colour system</h2>
  <p class="sec-sub">The nine palettes from your brief, each expanded through an OKLCH tonal-palette engine into a
     complete Material-3 style token set for both light and dark. Dual themes follow the 80/20 split;
     triple themes follow 60/30/10. Neutrals are hue-tinted from the primary so surfaces feel branded
     rather than generic grey.</p>
  <div class="pals">${paletteGallery}</div>

  <h2 class="sec">Iconography</h2>
  <p class="sec-sub">One self-authored outline set on a 24×24 grid with a 1.8&nbsp;px stroke and round caps.
     Injected once as an inline SVG sprite, referenced everywhere with
     <code style="font-family:var(--s-font-mono);color:#9fe8df">&lt;use href="#i-name"&gt;</code> —
     no icon font, no network request, no per-icon component.</p>
  <div class="ig">${iconGallery}</div>

  <h2 class="sec">Design principles</h2>
  <div class="prin">
    ${[
      ['gauge', 'Glanceable state', 'Every row carries a 3&nbsp;px state spine, a monospace tabular readout and a striped progress fill while bytes are actually moving. You can tell what is downloading, stalled, seeding or failed from across the room.'],
      ['target', '48&nbsp;dp minimum', 'Icon buttons are 40&nbsp;dp visually but extend their hit area to 48&nbsp;dp. No mis-taps on a moving bus, no "tiny close button" rage.'],
      ['zap', 'Progress is honest', 'Segment ticks show how aria2 is slicing the file. Indeterminate states stay indeterminate — never a fake percentage creeping to 99%.'],
      ['layers', 'Progressive disclosure', 'One primary action per screen (the FAB). Everything else lives in a chip rail, a bottom sheet or an overflow menu — dense without being busy.'],
      ['palette', 'Token-driven theming', 'Zero hard-coded colours in components. Swap the palette or the mode and all 18 combinations stay WCAG&nbsp;AA compliant, verified in CI.'],
      ['clock', 'Motion with meaning', '220&nbsp;ms standard easing for state changes, 340&nbsp;ms emphasized for things entering the screen, spring only on switches. Everything honours prefers-reduced-motion.'],
      ['shield', 'Reversible by default', 'Deletes go to a snackbar with Undo first. Destructive confirmations are reserved for things that actually cannot be undone.'],
      ['eye-off', 'Calm by default', 'No dark patterns, no auto-play, no badge spam. Notification channels are granular so you can silence progress and keep completions.'],
    ]
      .map(
        ([ic, t, d]) => `
    <article class="prin__card"><h4><span>${i(ic, 16)}</span>${t}</h4><p>${d}</p></article>`,
      )
      .join('')}
  </div>

  <h2 class="sec">Under the hood</h2>
  <p class="sec-sub">The native layer does the heavy lifting so the WebView only ever draws UI and receives events.</p>
  <div class="arch">
    <table>
      <thead><tr><th>Layer</th><th>Tool</th><th>Responsibility</th></tr></thead>
      <tbody>
        <tr><td>UI</td><td><code>Vue 3</code> <code>Vite</code> <code>Pinia</code></td><td>Screens, design tokens, optimistic state. Plain JavaScript — no TypeScript anywhere.</td></tr>
        <tr><td>Shell</td><td><code>Capacitor 7</code></td><td>WebView host, plugin bridge, Android project, splash + adaptive icon.</td></tr>
        <tr><td>HTTP engine</td><td><code>HttpEngine.kt</code> (OkHttp)</td><td>16 parallel byte-ranges, implicit resume (re-split from current file length), global rate cap. Pure Kotlin — no native blob to ship.</td></tr>
        <tr><td>BitTorrent</td><td><code>libtorrent4j</code></td><td>Magnets + .torrent, file selection, seeds/peers. Its arm64 JNI lib comes from Maven Central, so Gradle resolves it like any dependency.</td></tr>
        <tr><td>Extractor</td><td><code>yt-dlp</code> via Chaquopy</td><td>YouTube, Instagram and 1800+ sites. Runs in an embedded CPython 3.11, arm64 ABI only.</td></tr>
        <tr><td>Transcode</td><td><code>ffmpeg-kit</code> (Maven)</td><td>Video → MP3 conversion, muxing split streams, tag + cover embedding. Natives bundled per ABI by the artifact.</td></tr>
        <tr><td>Service</td><td>Kotlin <code>ForegroundService</code></td><td>Survives app close; <code>dataSync</code> type, wake lock, battery-aware, progress notifications with pause/stop actions.</td></tr>
        <tr><td>Storage</td><td><code>MediaStore</code> + SAF</td><td>Files land in the real Gallery/Music libraries. Custom folders picked through the Storage Access Framework.</td></tr>
        <tr><td>Integrations</td><td>Widget · share target · boot receiver</td><td>4×2 home-screen widget with live speed, "Download with Surge" in the Android share sheet, magnet: link handler, scheduler restore on boot.</td></tr>
      </tbody>
    </table>
  </div>

  <footer class="foot">
    <div>Surge — UI mockup generated ${new Date().toISOString().slice(0, 10)} by <code style="font-family:var(--s-font-mono)">mockup/build-mockup.mjs</code>.</div>
    <div>Tokens: <code style="font-family:var(--s-font-mono)">tools/themes.mjs</code> → <code style="font-family:var(--s-font-mono)">src/styles/themes.css</code>.
        Audit: <code style="font-family:var(--s-font-mono)">node tools/verify-tokens.mjs</code>.</div>
  </footer>

</div>
</body>
</html>`;

writeFileSync(resolve(here, 'surge-mockup.html'), html, 'utf8');
console.log(`wrote mockup/surge-mockup.html  (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${SHOTS.length} screens, ${Object.keys(ICONS).length} icons)`);

// Sanity: warn about any icon name used in markup that does not exist.
const used = new Set([...html.matchAll(/#i-([a-z0-9-]+)/g)].map((m) => m[1]));
// '#i-name' appears verbatim in the "how icons work" copy; it is documentation,
// not a reference, so exclude it from the existence check.
const missing = [...used].filter((n) => n !== 'name' && !ICONS[n]);
if (missing.length) console.warn('missing icons:', missing.join(', '));
void contrast;
