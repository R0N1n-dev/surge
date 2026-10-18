/**
 * Surge — source detection
 * ---------------------------------------------------------------------------
 * The single most important piece of UX in a download manager: paste *anything*
 * and know instantly what it is and what we can do with it. This module is pure
 * (no I/O) so it is trivially testable and runs synchronously on every keystroke
 * in the composer.
 */

/** Source kinds the app knows about, in priority order. */
export const KIND = {
  MAGNET: 'magnet',
  TORRENT: 'torrent',
  YOUTUBE: 'youtube',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  TWITTER: 'twitter',
  MEDIA: 'media', // direct media file by extension
  ARCHIVE: 'archive',
  HTTP: 'http',
};

export const KIND_LABEL = {
  [KIND.MAGNET]: 'Magnet link',
  [KIND.TORRENT]: 'Torrent file',
  [KIND.YOUTUBE]: 'YouTube',
  [KIND.INSTAGRAM]: 'Instagram',
  [KIND.TIKTOK]: 'TikTok',
  [KIND.TWITTER]: 'X / Twitter',
  [KIND.MEDIA]: 'Media file',
  [KIND.ARCHIVE]: 'Archive',
  [KIND.HTTP]: 'Direct file',
};

/** Which pipeline handles each kind: aria2 (raw bytes) or yt-dlp (extract). */
export const KIND_ENGINE = {
  [KIND.MAGNET]: 'torrent',
  [KIND.TORRENT]: 'torrent',
  [KIND.HTTP]: 'http',
  [KIND.ARCHIVE]: 'http',
  [KIND.MEDIA]: 'http',
  [KIND.YOUTUBE]: 'ytdlp',
  [KIND.INSTAGRAM]: 'ytdlp',
  [KIND.TIKTOK]: 'ytdlp',
  [KIND.TWITTER]: 'ytdlp',
};

const RX = {
  magnet: /^magnet:\?/i,
  torrent: /\.torrent($|\?)/i,
  youtube:
    /(?:^|\.)((youtube\.com|youtu\.be|youtube-nocookie\.com|music\.youtube\.com)($|\/))/i,
  instagram: /(?:^|\.)((instagram\.com|instagr\.am)($|\/))/i,
  tiktok: /(?:^|\.)((tiktok\.com|vm\.tiktok\.com)($|\/))/i,
  twitter: /(?:^|\.)((twitter\.com|x\.com|t\.co)($|\/))/i,
  media: /\.(mp4|m4v|mkv|webm|mov|mp3|m4a|aac|flac|ogg|opus|wav)($|\?)/i,
  archive: /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|iso|dmg)($|\?)/i,
};

/**
 * Classify a link. Returns a rich descriptor rather than a bare string so the
 * composer can show the right icon, the right affordances and the right errors.
 *
 * @param {string} input
 * @returns {{kind:string, engine:string, label:string, host:string|null, valid:boolean, reason?:string}}
 */
export function detectSource(input) {
  const raw = String(input || '').trim();
  const fail = (kind, reason) => ({
    kind,
    engine: KIND_ENGINE[kind] || 'aria2',
    label: KIND_LABEL[kind],
    host: null,
    valid: false,
    reason,
  });

  if (!raw) return fail(KIND.HTTP, 'empty');

  if (RX.magnet.test(raw)) {
    // A magnet without an info-hash can never resolve — say so up front instead
    // of letting aria2 fail opaquely three seconds later.
    if (!/[?&]xt=urn:btih:[a-z0-9]{32,40}/i.test(raw) && !/[?&]xt=urn:btmh:/i.test(raw)) {
      return fail(KIND.MAGNET, 'missing info hash');
    }
    const name = /[?&]dn=([^&]+)/i.exec(raw);
    return {
      kind: KIND.MAGNET,
      engine: 'aria2',
      label: KIND_LABEL[KIND.MAGNET],
      host: name ? safeDecode(name[1]) : null,
      valid: true,
    };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail(KIND.HTTP, 'not a URL');
  }
  // The native engine is OkHttp-based: HTTP(S) only. Saying so here (in the
  // composer, before the user commits) beats a mid-transfer failure.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fail(KIND.HTTP, `unsupported protocol ${url.protocol.replace(':', '')} — HTTP/HTTPS only`);
  }

  const host = url.hostname.replace(/^www\./i, '');
  const base = { engine: null, host, valid: true };

  if (RX.torrent.test(raw)) return { ...base, kind: KIND.TORRENT, engine: 'aria2', label: KIND_LABEL[KIND.TORRENT] };
  if (RX.youtube.test(host)) return { ...base, kind: KIND.YOUTUBE, engine: 'ytdlp', label: KIND_LABEL[KIND.YOUTUBE] };
  if (RX.instagram.test(host)) return { ...base, kind: KIND.INSTAGRAM, engine: 'ytdlp', label: KIND_LABEL[KIND.INSTAGRAM] };
  if (RX.tiktok.test(host)) return { ...base, kind: KIND.TIKTOK, engine: 'ytdlp', label: KIND_LABEL[KIND.TIKTOK] };
  if (RX.twitter.test(host)) return { ...base, kind: KIND.TWITTER, engine: 'ytdlp', label: KIND_LABEL[KIND.TWITTER] };
  if (RX.media.test(raw)) return { ...base, kind: KIND.MEDIA, engine: 'aria2', label: KIND_LABEL[KIND.MEDIA] };
  if (RX.archive.test(raw)) return { ...base, kind: KIND.ARCHIVE, engine: 'aria2', label: KIND_LABEL[KIND.ARCHIVE] };
  return { ...base, kind: KIND.HTTP, engine: 'aria2', label: KIND_LABEL[KIND.HTTP] };
}

/** Extract the YouTube video id for thumbnails / metadata. */
export function youtubeId(input) {
  try {
    const u = new URL(String(input));
    if (/youtu\.be$/i.test(u.hostname)) return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = /\/(shorts|embed|live)\/([\w-]{11})/i.exec(u.pathname);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

/** Thumbnail for a detected source (used before native metadata arrives). */
export function sourceThumb(info) {
  if (info.kind === KIND.YOUTUBE) {
    const id = youtubeId(info.host ? info.raw || '' : '');
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return null;
}

/**
 * Split a multi-line paste block into individual links, dropping blanks and
 * de-duplicating while preserving order. Powers "batch add".
 */
export function splitLinks(blob) {
  const seen = new Set();
  const out = [];
  for (const line of String(blob || '').split(/[\s,;]+/)) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}
