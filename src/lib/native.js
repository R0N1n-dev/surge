/**
 * Surge — native bridge
 * ---------------------------------------------------------------------------
 * The ONE place the UI talks to the platform. Everything else in `src/` is pure
 * Vue and never imports a Capacitor plugin directly.
 *
 * Two backends behind the same interface:
 *
 *   native  → the Kotlin `DownloaderPlugin` (aria2 JSON-RPC + yt-dlp + ffmpeg),
 *             reached over the Capacitor bridge with typed events.
 *   web     → an in-memory simulator that emits the exact same event shapes on
 *             a tick loop. This is what makes `npm run dev` in a desktop browser
 *             a faithful proxy for the device: the same store mutations, the same
 *             progress cadence, the same notification intents (as snackbars).
 *
 * Keeping the contract identical means a UI bug found in the browser is a real
 * bug on the device, and vice versa.
 */

import { reactive, readonly } from 'vue';
import { classify, folderPathFor, DEFAULT_ROOT } from './classify.js';

/* ------------------------------------------------------------------ env ---- */

let Capacitor = null;
let plugins = null;

/** True once we are inside the Capacitor WebView on a real device. */
export const isNative = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

async function loadPlugins() {
  if (plugins) return plugins;
  if (!isNative) return (plugins = {});
  const [cap, app, statusbar, splash, haptics, clipboard, network, filesystem, prefs, share] =
    await Promise.all([
      import('@capacitor/core'),
      import('@capacitor/app'),
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
      import('@capacitor/haptics'),
      import('@capacitor/clipboard'),
      import('@capacitor/network'),
      import('@capacitor/filesystem'),
      import('@capacitor/preferences'),
      import('@capacitor/share'),
    ]);
  Capacitor = cap.Capacitor;
  plugins = {
    Capacitor,
    App: app.App,
    StatusBar: statusbar.StatusBar,
    SplashScreen: splash.SplashScreen,
    Haptics: haptics.Haptics,
    Clipboard: clipboard.Clipboard,
    Network: network.Network,
    Filesystem: filesystem.Filesystem,
    Preferences: prefs.Preferences,
    Share: share.Share,
    // Our own Kotlin plugins, registered in MainActivity.
    Downloader: cap.registerPlugin('Downloader'),
    Torrent: cap.registerPlugin('Torrent'),
    Media: cap.registerPlugin('Media'),
    Storage: cap.registerPlugin('Storage'),
    Widget: cap.registerPlugin('Widget'),
    Notifier: cap.registerPlugin('Notifier'),
  };
  return plugins;
}

export const getPlugins = loadPlugins;

/* --------------------------------------------------------------- state ---- */

/**
 * Live download table. Reactive so views bind straight to it; the bridge owns
 * it because it is the only writer (events mutate, views read).
 */
export const state = reactive({
  ready: false,
  engine: { aria2: 'starting', ytdlp: 'starting', ffmpeg: 'starting' },
  totals: { down: 0, up: 0, active: 0, queued: 0, completedToday: 0 },
  history: [], // [timestamp, bytesPerSec] ring for the speed dock
  items: new Map(), // id -> item (kept as Map for O(1) event patching)
});

export const downloads = readonly(state);

/* ------------------------------------------------------------ item model --- */

/**
 * crypto.randomUUID needs a secure context. Capacitor serves https://localhost
 * so it is always present on device, but a stray http preview or an ancient
 * WebView must not throw here — an exception in makeItem during boot is exactly
 * the kind of thing that ends in a blank screen.
 */
const uid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/**
 * The canonical download record. Every field the UI can show, nothing it can't.
 * `state` is one of: queued | active | paused | complete | error | seeding
 */
export function makeItem(partial = {}) {
  return {
    id: partial.id ?? uid(),
    name: partial.name ?? 'untitled',
    kind: partial.kind ?? 'http', // see lib/url.js KIND
    engine: partial.engine ?? 'aria2',
    url: partial.url ?? '',
    state: partial.state ?? 'queued',
    totalBytes: partial.totalBytes ?? 0,
    doneBytes: partial.doneBytes ?? 0,
    speed: partial.speed ?? 0,
    uploadSpeed: partial.uploadSpeed ?? 0,
    eta: partial.eta ?? null,
    connections: partial.connections ?? 0,
    // torrent-only
    seeds: partial.seeds ?? 0,
    peers: partial.peers ?? 0,
    files: partial.files ?? null,
    // media-only (yt-dlp)
    media: partial.media ?? null, // { title, channel, duration, thumb, formats[] }
    selectedFormat: partial.selectedFormat ?? null, // { res, codec, size, fps }
    convertToMp3: partial.convertToMp3 ?? false,
    mp3Bitrate: partial.mp3Bitrate ?? 320,
    // housekeeping
    dir: partial.dir ?? null,          // resolved to a category folder on add
    category: partial.category ?? null, // 'videos' | 'music' | … (see lib/classify)
    createdAt: partial.createdAt ?? Date.now(),
    startedAt: partial.startedAt ?? null,
    finishedAt: partial.finishedAt ?? null,
    error: partial.error ?? null,
    retries: partial.retries ?? 0,
    // ui
    selected: false,
  };
}

/**
 * The download root as last persisted by the settings store. Read straight
 * from localStorage so this module never imports Pinia (the store imports us
 * for native sync, so a static import here would be a cycle).
 */
export function currentRoot() {
  try {
    return JSON.parse(localStorage.getItem('surge.settings') || '{}').root || DEFAULT_ROOT;
  } catch {
    return DEFAULT_ROOT;
  }
}

/* ------------------------------------------------------------- events ----- */

const listeners = new Set();

/** Subscribe to bridge events. Returns an unsubscribe fn. */
export function onEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(type, payload = {}) {
  const ev = { type, at: Date.now(), ...payload };
  for (const fn of listeners) fn(ev);
}

/* --------------------------------------------------------------- API ------ */

export const bridge = {
  /**
   * Boot: start engines, restore persisted queue, wire events.
   *
   * Deliberately non-blocking and failure-tolerant: the UI renders against the
   * local table first and reconciles when the engines answer. A cold daemon, a
   * missing native blob or a plugin hiccup must degrade a feature, never hold
   * the splash screen (that is what reads as a "black screen" on device).
   */
  async init() {
    if (isNative) {
      try {
        const p = await loadPlugins();
        // Native → JS event stream.
        p.Downloader.addListener('progress', (d) => patchItem(d.id, d));
        p.Downloader.addListener('state', (d) => patchItem(d.id, { state: d.state, error: d.error ?? null }));
        p.Downloader.addListener('totals', (t) => Object.assign(state.totals, t));
        p.Downloader.addListener('engine', (e) => Object.assign(state.engine, e));
        p.Downloader.addListener('restored', (r) => {
          (r.items ?? []).forEach((it) => {
            const existing = state.items.get(it.id);
            if (existing) Object.assign(existing, it);
            else state.items.set(it.id, makeItem(it));
          });
        });

        // Service FIRST (it owns aria2's lifecycle), queue restore second and
        // un-awaited: restore() resolves immediately and tops up via 'restored'.
        await p.Downloader.start().catch(() => {});
        p.Downloader.restore().catch(() => {});
      } catch (e) {
        console.warn('[surge] native init degraded; running on local table', e);
      }
      // 1 Hz batched poll: global rates + every item + browser sniffs.
      setInterval(async () => {
        try {
          const r = await p.Downloader.poll();
          state.totals.down = r.down ?? 0;
          state.totals.up = r.up ?? 0;
          (r.items ?? []).forEach((it) => {
            const existing = state.items.get(it.id);
            if (existing) Object.assign(existing, it);
            else state.items.set(it.id, makeItem(it));
          });
          state.history.push([Date.now(), r.down ?? 0]);
          if (state.history.length > 120) state.history.shift();
          emit('tick');
        } catch {
          /* engine mid-restart; next tick recovers */
        }
      }, 1000);
    } else {
      Mock.start();
    }
    state.ready = true;
    emit('ready');
  },

  /** Add one or more downloads. Returns the created items. */
  async add(partials = []) {
    const created = partials.map((p) => {
      const item = makeItem(p);
      // 1DM-style auto-filing: decide the category ONCE, at add-time, from the
      // best available signal, and pin the destination directory so the file
      // lands in the right sub-folder and never moves afterwards.
      if (!item.dir || !item.category) {
        const cat = classify({
          name: item.name,
          url: item.url,
          kind: item.kind,
          override: item.category ?? p.category,
        });
        item.category = cat.id;
        item.dir = item.dir ?? folderPathFor(cat.id, currentRoot());
      }
      return item;
    });
    for (const item of created) {
      state.items.set(item.id, item);
      if (isNative) {
        const p = await loadPlugins();
        await p.Downloader.add(serialise(item));
      } else {
        Mock.enqueue(item);
      }
      emit('added', { id: item.id });
    }
    return created;
  },

  async pause(id) {
    return this._cmd(id, 'pause');
  },
  async resume(id) {
    return this._cmd(id, 'resume');
  },
  async cancel(id) {
    return this._cmd(id, 'cancel');
  },
  async remove(id, { deleteFile = false } = {}) {
    if (isNative) {
      const p = await loadPlugins();
      await p.Downloader.remove({ id, deleteFile });
    }
    state.items.delete(id);
    emit('removed', { id });
  },
  async retry(id) {
    const it = state.items.get(id);
    if (!it) return;
    it.retries += 1;
    return this._cmd(id, 'resume');
  },
  async pauseAll() {
    return this._broadcast('pause');
  },
  async resumeAll() {
    return this._broadcast('resume');
  },

  /** Fetch media metadata (yt-dlp) so the format picker can populate. */
  async probe(url) {
    if (isNative) {
      const p = await loadPlugins();
      return p.Media.probe({ url });
    }
    return Mock.probe(url);
  },

  /** Inspect a magnet/.torrent before downloading (file tree, peers). */
  async inspectTorrent(url) {
    if (isNative) {
      const p = await loadPlugins();
      return p.Torrent.inspect({ url });
    }
    return Mock.torrent(url);
  },

  async setSpeedLimit({ down = -1, up = -1 } = {}) {
    if (isNative) {
      const p = await loadPlugins();
      await p.Downloader.setSpeedLimit({ down, up });
    }
    emit('limits', { down, up });
  },

  /** Ask the OS to open a finished file with the right viewer. */
  async open(id) {
    if (!isNative) return emit('open', { id, simulated: true });
    const p = await loadPlugins();
    return p.Storage.open({ id });
  },

  async share(id) {
    if (!isNative) return emit('share', { id, simulated: true });
    const p = await loadPlugins();
    return p.Storage.share({ id });
  },

  /** Read the clipboard (for the "paste" affordance). */
  async readClipboard() {
    if (!isNative) return navigator.clipboard?.readText?.() ?? '';
    const p = await loadPlugins();
    const { value } = await p.Clipboard.read();
    return value ?? '';
  },

  /** Push the home-screen widget a fresh snapshot (cheap, debounced natively). */
  async refreshWidget() {
    if (!isNative) return;
    const p = await loadPlugins();
    await p.Widget.update(snapshotForWidget());
  },

  async haptic(style = 'light') {
    if (!isNative) return;
    const p = await loadPlugins();
    const map = { light: 'Light', medium: 'Medium', heavy: 'Heavy', success: 'Soft', error: 'Rigid' };
    await p.Haptics.impact({ style: map[style] ?? 'Light' }).catch(() => {});
  },

  async _cmd(id, cmd) {
    const it = state.items.get(id);
    if (!it) return;
    if (isNative) {
      const p = await loadPlugins();
      await p.Downloader[cmd]({ id });
    } else {
      Mock.command(it, cmd);
    }
    // Optimistic local state; the authoritative value arrives via the event.
    if (cmd === 'pause') patchItem(id, { state: 'paused', speed: 0 });
    if (cmd === 'resume') patchItem(id, { state: 'active', error: null });
    emit(cmd, { id });
  },

  async _broadcast(cmd) {
    for (const it of state.items.values()) {
      if (cmd === 'pause' && it.state === 'active') await this._cmd(it.id, 'pause');
      if (cmd === 'resume' && (it.state === 'paused' || it.state === 'queued')) await this._cmd(it.id, 'resume');
    }
  },
};

/* ----------------------------------------------------------- mutations ---- */

export function patchItem(id, patch) {
  const it = state.items.get(id);
  if (!it) return;
  Object.assign(it, patch);
  if (patch.state === 'complete') it.finishedAt = Date.now();
  emit('patch', { id });
}

function serialise(item) {
  const { selected, ...rest } = item;
  void selected;
  return rest;
}

export function snapshotForWidget() {
  const act = [...state.items.values()].filter((i) => i.state === 'active');
  const top = act.sort((a, b) => b.speed - a.speed)[0];
  return {
    active: act.length,
    down: state.totals.down,
    up: state.totals.up,
    title: top ? top.name : null,
    pct: top && top.totalBytes ? top.doneBytes / top.totalBytes : 0,
  };
}

export function listItems(filter = 'all') {
  const all = [...state.items.values()];
  const byRecency = (a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt);
  switch (filter) {
    case 'active':
      return all.filter((i) => i.state === 'active' || i.state === 'seeding').sort(byRecency);
    case 'queued':
      return all.filter((i) => i.state === 'queued').sort(byRecency);
    case 'complete':
      return all.filter((i) => i.state === 'complete').sort(byRecency);
    case 'failed':
      return all.filter((i) => i.state === 'error').sort(byRecency);
    case 'torrent':
      return all.filter((i) => i.kind === 'magnet' || i.kind === 'torrent').sort(byRecency);
    case 'media':
      return all.filter((i) => ['youtube', 'instagram', 'tiktok', 'twitter'].includes(i.kind)).sort(byRecency);
    default:
      return all.sort(byRecency);
  }
}

/* =========================================================== WEB MOCK ====== */

/**
 * A believable in-browser engine. Not a toy: it models segment warm-up, speed
 * jitter, queue promotion when a slot frees, torrent seeding after completion
 * and retry-on-error, because those are exactly the transitions the UI must
 * handle gracefully. If the mock can't break the UI, the device probably can't
 * either.
 */
const Mock = (() => {
  let timer = null;
  const CONCURRENCY = 3;

  const SEED = [
    {
      name: 'Big Buck Bunny — 4K Remux [1080p].mp4',
      kind: 'youtube',
      engine: 'ytdlp',
      totalBytes: 4.21 * 1024 ** 3,
      connections: 8,
      media: { duration: 596 },
    },
    {
      name: 'ubuntu-24.04.3-live-server-arm64.iso',
      kind: 'http',
      totalBytes: 5.84 * 1024 ** 3,
      connections: 16,
    },
    {
      name: 'Debian 12.7 DVD-1 (multi-file torrent)',
      kind: 'magnet',
      totalBytes: 4.7 * 1024 ** 3,
      seeds: 214,
      peers: 12,
    },
    { name: 'lofi-girl-beats-vol-12 → MP3 320 kbps', kind: 'media', totalBytes: 188 * 1024 ** 2, convertToMp3: true },
    { name: 'ProjectAssets_v7.zip', kind: 'archive', totalBytes: 1.09 * 1024 ** 3 },
  ];

  function seed() {
    SEED.forEach((s, idx) => {
      const item = makeItem({ ...s, url: 'https://example.org/' + idx });
      if (idx < 3) {
        item.state = 'active';
        item.startedAt = Date.now() - 60_000 * (idx + 2);
        item.doneBytes = item.totalBytes * [0.63, 0.41, 0.88][idx];
      } else {
        item.state = 'queued';
      }
      state.items.set(item.id, item);
    });
    const done = makeItem({
      name: 'instagram_reel_9f31ac72.mp4',
      kind: 'instagram',
      totalBytes: 18.7 * 1024 ** 2,
      state: 'complete',
    });
    done.doneBytes = done.totalBytes;
    done.finishedAt = Date.now() - 4000;
    state.items.set(done.id, done);
  }

  function tick() {
    const items = [...state.items.values()];
    const active = items.filter((i) => i.state === 'active');

    // Promote queued work into free slots.
    let free = CONCURRENCY - active.length;
    if (free > 0) {
      for (const q of items.filter((i) => i.state === 'queued')) {
        if (free <= 0) break;
        q.state = 'active';
        q.startedAt = Date.now();
        free--;
      }
    }

    let down = 0;
    let up = 0;
    for (const it of items) {
      if (it.state !== 'active') {
        it.speed = it.state === 'seeding' ? 0 : it.speed * 0.5;
        if (it.state === 'seeding') {
          it.uploadSpeed = 1.2 * 1024 ** 2 * (0.7 + Math.random() * 0.6);
          up += it.uploadSpeed;
        }
        continue;
      }
      // Warm-up ramp + jitter so the sparkline looks organic, not linear.
      const ramp = Math.min(1, (Date.now() - it.startedAt) / 4000);
      const target = (it.totalBytes / 240) * ramp; // ~4 min per file baseline
      it.speed = Math.max(64 * 1024, target * (0.75 + Math.random() * 0.5));
      it.doneBytes = Math.min(it.totalBytes, it.doneBytes + it.speed);
      it.eta = it.speed > 0 ? (it.totalBytes - it.doneBytes) / it.speed : null;
      down += it.speed;
      if (it.kind === 'magnet') {
        it.uploadSpeed = it.speed * 0.25;
        up += it.uploadSpeed;
      }
      if (it.doneBytes >= it.totalBytes) {
        if (it.kind === 'magnet') {
          it.state = 'seeding';
          it.doneBytes = it.totalBytes;
        } else {
          it.state = 'complete';
          it.speed = 0;
          it.finishedAt = Date.now();
        }
        emit('state', { id: it.id, state: it.state });
      }
    }

    state.totals.down = down;
    state.totals.up = up;
    state.totals.active = items.filter((i) => i.state === 'active').length;
    state.totals.queued = items.filter((i) => i.state === 'queued').length;

    state.history.push([Date.now(), down]);
    if (state.history.length > 120) state.history.shift();
    emit('tick');
  }

  return {
    start() {
      if (timer) return;
      seed();
      state.engine = { aria2: 'ok', ytdlp: 'ok', ffmpeg: 'ok' };
      timer = setInterval(tick, 700);
    },
    enqueue(item) {
      item.state = 'queued';
      if (!item.totalBytes) item.totalBytes = (40 + Math.random() * 900) * 1024 ** 2;
    },
    command(item, cmd) {
      if (cmd === 'pause') item.state = 'paused';
      if (cmd === 'resume') {
        item.state = 'active';
        item.startedAt = Date.now();
      }
      if (cmd === 'cancel') state.items.delete(item.id);
    },
    probe(url) {
      return {
        title: 'Big Buck Bunny — 4K Remux (Blender Foundation)',
        channel: 'Blender',
        duration: 596,
        thumb: null,
        views: 4_200_000,
        formats: [
          { res: '240p', codec: 'mp4', fps: 30, size: 96 * 1024 ** 2 },
          { res: '360p', codec: 'mp4', fps: 30, size: 214 * 1024 ** 2 },
          { res: '480p', codec: 'mp4', fps: 30, size: 486 * 1024 ** 2 },
          { res: '720p', codec: 'mp4', fps: 60, size: 1.1 * 1024 ** 3, tag: 'HD' },
          { res: '1080p', codec: 'mp4', fps: 60, size: 2.4 * 1024 ** 3, tag: 'FHD' },
          { res: '1440p', codec: 'webm', fps: 60, size: 4.1 * 1024 ** 3, tag: '2K' },
          { res: '2160p', codec: 'webm', fps: 60, size: 8.9 * 1024 ** 3, tag: '4K' },
        ],
        audio: [
          { codec: 'm4a', kbps: 128, size: 9.6 * 1024 ** 2 },
          { codec: 'opus', kbps: 160, size: 12 * 1024 ** 2 },
        ],
        subtitles: ['en (auto)', 'en', 'de'],
        playlist: 12,
        url,
      };
    },
    torrent(url) {
      return {
        name: 'debian-12.7.0-amd64-DVD-1',
        infoHash: '7a6f2e91c0d44b8aa3f1e27d9c5b604812ab33ef',
        totalBytes: 4.7 * 1024 ** 3,
        seeds: 214,
        peers: 12,
        files: [
          { path: 'debian-12.7.0-amd64-DVD-1/debian-12.7.0-amd64-DVD-1.iso', size: 4.38 * 1024 ** 3, selected: true },
          { path: 'debian-12.7.0-amd64-DVD-1/install/', size: 184 * 1024 ** 2, selected: true, dir: true },
          { path: 'debian-12.7.0-amd64-DVD-1/doc/', size: 62.4 * 1024 ** 2, selected: true, dir: true },
          { path: 'debian-12.7.0-amd64-DVD-1/pool/', size: 78.1 * 1024 ** 2, selected: false, dir: true },
          { path: 'debian-12.7.0-amd64-DVD-1/README.html', size: 4.2 * 1024, selected: true },
          { path: 'debian-12.7.0-amd64-DVD-1/SHA512SUMS', size: 12 * 1024, selected: true },
          { path: 'debian-12.7.0-amd64-DVD-1/SHA512SUMS.sign', size: 1024, selected: true },
        ],
        trackers: ['udp://tracker.openbittorrent.com:6969', 'https://tracker.debian.org:443'],
        url,
      };
    },
  };
})();

export { Mock };
