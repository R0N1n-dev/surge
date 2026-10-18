/**
 * Surge — formatting utilities
 * ---------------------------------------------------------------------------
 * Every numeric readout in a download manager ticks many times per second. If
 * the string width changes as it ticks, the layout jitters and the eye can't
 * track it. So these helpers always return FIXED-WIDTH, tabular strings, and
 * pair each value with its unit so the component can style them separately.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/**
 * Human bytes with a stable unit choice.
 * `formatBytes(2_650_000_000)` → '2.47 GB'
 */
export function formatBytes(bytes, { decimals = 2, forceUnit = null } = {}) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return forceUnit ? `0 ${forceUnit}` : '0 B';
  const neg = bytes < 0;
  let b = Math.abs(bytes);
  let idx = 0;
  if (forceUnit) {
    idx = Math.max(0, UNITS.indexOf(forceUnit));
    b = b / Math.pow(1024, idx);
  } else {
    while (b >= 1024 && idx < UNITS.length - 1) {
      b /= 1024;
      idx++;
    }
  }
  const d = b >= 100 || idx === 0 ? 0 : decimals;
  return `${neg ? '-' : ''}${b.toFixed(d)} ${UNITS[idx]}`;
}

/** Bytes-per-second, e.g. '12.4 MB/s'. */
export function formatSpeed(bytesPerSec) {
  if (bytesPerSec == null || bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec, { decimals: 1 })}/s`;
}

/**
 * Countdown that never lies about precision: above an hour we drop seconds,
 * above a day we drop minutes. A wall of "2h 13m 44s left" is noise.
 */
export function formatEta(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const s = Math.round(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** mm:ss or h:mm:ss, tabular. */
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "3 minutes ago" → but compact: '3m', '2h', '4d'. Full form via title attr. */
export function formatRelative(isoOrMs) {
  const t = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const step = (v, unit) => (future ? `in ${v}${unit}` : `${v}${unit} ago`);
  if (s < 5) return future ? 'in moments' : 'just now';
  if (s < 60) return step(Math.round(s), 's');
  if (s < 3600) return step(Math.round(s / 60), 'm');
  if (s < 86400) return step(Math.round(s / 3600), 'h');
  if (s < 86400 * 7) return step(Math.round(s / 86400), 'd');
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Percent as an integer string, clamped — progress UI never shows 100.4%. */
export function formatPercent(fraction) {
  if (fraction == null || !Number.isFinite(fraction)) return '0';
  return String(Math.max(0, Math.min(100, Math.round(fraction * 100))));
}

/** Compact integer for badges: 1234 → '1.2k'. */
export function formatCount(n) {
  if (n == null) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** 'video/mp4' → 'MP4'. Used for library chips and file rows. */
export function extLabel(nameOrMime = '') {
  const m = /\.([a-z0-9]{1,6})$/i.exec(nameOrMime);
  if (m) return m[1].toUpperCase();
  const sub = /\/([a-z0-9+.-]+)$/i.exec(nameOrMime);
  return sub ? sub[1].toUpperCase().replace('MPEG', 'MP3') : 'FILE';
}

/** Byte-size → a 0..1 fraction for progress bars. Guards divide-by-zero. */
export function fraction(done, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(1, done / total));
}
