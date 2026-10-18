/**
 * Surge — download classifier & folder taxonomy
 * ---------------------------------------------------------------------------
 * The 1DM-style behaviour: one root folder on the device, with a fixed set of
 * category sub-folders, and every download auto-filed into the right one the
 * moment it is added — no manual sorting, ever.
 *
 *   Internal storage › Download › Surge ›
 *       compressed/  documents/  general/  music/  others/
 *       photos/  programs/  subtitles/  torrents/  videos/
 *
 * Rules of the road:
 *
 *  · The folder names are the contract (they are what the user sees in any file
 *    manager), so they are plain lowercase words, never localised. The *labels*
 *    shown in-app are separate and can be pretty.
 *  · Classification happens ONCE, at add-time, from the best signal available
 *    (filename → URL path → MIME → source kind). A file never moves after the
 *    fact; re-classifying finished downloads would break the user's mental map.
 *  · This table is mirrored 1:1 in Kotlin (`core/Classifier.kt`) because aria2
 *    needs the destination directory at add-time, on the native side. The two
 *    are kept honest by `tools/verify-classify.mjs`, which parses both and fails
 *    the build if they drift.
 */

/** Ordered: first match wins. `match` is checked against the lowercased ext. */
export const CATEGORIES = [
  {
    id: 'videos',
    folder: 'videos',
    label: 'Videos',
    icon: 'film',
    blurb: 'Movies, episodes, reels, recordings',
    ext: ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'f4v', '3gp', '3g2', 'ts', 'm2ts', 'mts', 'vob', 'ogv', 'divx'],
    mime: ['video/'],
  },
  {
    id: 'music',
    folder: 'music',
    label: 'Music',
    icon: 'music',
    blurb: 'Tracks, podcasts, ringtones, MP3 conversions',
    ext: ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wav', 'wma', 'alac', 'aiff', 'aif', 'ape', 'mka'],
    mime: ['audio/'],
  },
  {
    id: 'photos',
    folder: 'photos',
    label: 'Photos',
    icon: 'image',
    blurb: 'Images, wallpapers, screenshots, cover art',
    ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif', 'svg', 'dng', 'raw'],
    mime: ['image/'],
  },
  {
    id: 'documents',
    folder: 'documents',
    label: 'Documents',
    icon: 'doc',
    blurb: 'PDFs, office files, ebooks, notes',
    ext: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'epub', 'mobi', 'azw3', 'fb2', 'djvu'],
    // Deliberately NOT a bare `application/vnd.` prefix: that would swallow
    // `application/vnd.android.package-archive` (APK) before `programs` gets a
    // look. Office MIME types are enumerated explicitly instead.
    mime: [
      'text/',
      'application/pdf',
      'application/rtf',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats',
      'application/vnd.oasis',
      'application/epub',
      'application/x-mobipocket',
    ],
  },
  {
    id: 'compressed',
    folder: 'compressed',
    label: 'Compressed',
    icon: 'archive',
    blurb: 'Archives, disk images, packages of files',
    ext: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'zst', 'lz4', 'cab', 'iso', 'img', 'dmg', 'wim'],
    mime: ['application/zip', 'application/x-rar', 'application/x-7z', 'application/gzip', 'application/x-tar', 'application/x-iso'],
  },
  {
    id: 'programs',
    folder: 'programs',
    label: 'Programs',
    icon: 'apk',
    blurb: 'APKs, bundles, installers, executables',
    ext: ['apk', 'xapk', 'apks', 'apkm', 'aab', 'exe', 'msi', 'deb', 'rpm', 'dmg', 'jar', 'bin'],
    mime: ['application/vnd.android.package-archive'],
  },
  {
    id: 'subtitles',
    folder: 'subtitles',
    label: 'Subtitles',
    icon: 'subtitles',
    blurb: 'Subtitle and caption tracks',
    ext: ['srt', 'ass', 'ssa', 'sub', 'vtt', 'sbv', 'smi', 'idx'],
    mime: ['application/x-subrip', 'text/vtt'],
  },
  {
    id: 'torrents',
    folder: 'torrents',
    label: 'Torrents',
    icon: 'torrent',
    blurb: '.torrent metadata and magnet snapshots',
    ext: ['torrent'],
    mime: ['application/x-bittorrent'],
  },
  {
    id: 'general',
    folder: 'general',
    label: 'General',
    icon: 'file',
    blurb: 'Recognised types with no home of their own',
    ext: ['html', 'htm', 'xhtml', 'css', 'js', 'mjs', 'json', 'xml', 'yml', 'yaml', 'ttf', 'otf', 'woff', 'woff2', 'ics', 'vcf', 'key', 'pub', 'apkx'],
    mime: ['text/html', 'application/json', 'application/xml', 'font/'],
  },
  {
    id: 'others',
    folder: 'others',
    label: 'Others',
    icon: 'file-question',
    blurb: 'No extension, or genuinely unrecognised',
    ext: [],
    mime: [],
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/** Default root, relative to internal storage. Mirrors 1DM's `1DMP`. */
export const DEFAULT_ROOT = 'Download/Surge';

/* --------------------------------------------------------------- helpers --- */

const EXT_INDEX = (() => {
  const m = new Map();
  for (const cat of CATEGORIES) {
    for (const e of cat.ext) if (!m.has(e)) m.set(e, cat.id);
  }
  return m;
})();

const afterLastSlash = (s) => {
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
};

export function extensionOf(nameOrUrl = '') {
  // Strip query/hash first so `file.mp4?token=1` still classifies.
  const clean = String(nameOrUrl).split(/[?#]/)[0];
  const base = afterLastSlash(clean);
  const m = /\.([a-z0-9]{1,8})$/i.exec(base);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Classify a download. Signals are tried in order of reliability:
 *   1. an explicit override (the user picked a category in the picker)
 *   2. the file name / URL path extension
 *   3. a known MIME type
 *   4. the source kind (a magnet with no filename yet → torrents)
 *   5. fallback: no extension at all → others, else general
 *
 * @returns {{id:string, folder:string, label:string, icon:string, via:string}}
 */
export function classify({ name = '', url = '', mime = '', kind = '', override = null } = {}) {
  if (override && CATEGORY_BY_ID[override]) {
    return { ...CATEGORY_BY_ID[override], via: 'override' };
  }

  const ext = extensionOf(name) || extensionOf(url);
  if (ext && EXT_INDEX.has(ext)) {
    return { ...CATEGORY_BY_ID[EXT_INDEX.get(ext)], via: 'extension' };
  }

  if (mime) {
    const m = mime.toLowerCase();
    for (const cat of CATEGORIES) {
      if (cat.mime.some((p) => m.startsWith(p))) return { ...cat, via: 'mime' };
    }
  }

  if (kind === 'torrent' || kind === 'magnet') {
    // A magnet has no filename until metadata resolves; its *payload* will be
    // re-classified per-file when aria2 reports real names, but the container
    // itself belongs with torrents.
    return { ...CATEGORY_BY_ID.torrents, via: 'kind' };
  }

  if (!ext) return { ...CATEGORY_BY_ID.others, via: 'no-extension' };
  return { ...CATEGORY_BY_ID.general, via: 'general' };
}

/* ----------------------------------------------------------------- paths --- */

/**
 * The on-disk relative path for a category, e.g. `Download/Surge/videos`.
 * This is what we hand to MediaStore as RELATIVE_PATH (API 29+) and what we
 * mkdir on older devices, so the tree always physically exists.
 */
export function folderPathFor(categoryId, root = DEFAULT_ROOT) {
  const cat = CATEGORY_BY_ID[categoryId] ?? CATEGORY_BY_ID.others;
  return `${root.replace(/\/+$/, '')}/${cat.folder}`;
}

/** Pretty breadcrumb for UI: `Internal storage › Download › Surge › videos`. */
export function displayPath(categoryId, root = DEFAULT_ROOT) {
  return ['Internal storage', ...folderPathFor(categoryId, root).split('/')].join(' › ');
}

/** Every category folder, for mkdir-on-boot and the Library tree. */
export function allFolders(root = DEFAULT_ROOT) {
  return CATEGORIES.map((c) => folderPathFor(c.id, root));
}

/**
 * Which MediaStore collection a category publishes into. Everything lives in
 * the Downloads tree (that is what keeps the single-root layout), but the
 * collection + MIME decide whether Gallery/Music/Files surface it.
 */
export function mediaCollectionFor(categoryId) {
  switch (categoryId) {
    case 'videos':
      return 'video';
    case 'music':
      return 'audio';
    case 'photos':
      return 'image';
    default:
      return 'downloads';
  }
}
