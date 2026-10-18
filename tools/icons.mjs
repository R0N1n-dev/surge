/**
 * Surge — icon set
 * ---------------------------------------------------------------------------
 * A single, self-authored 24x24 outline set on a 1.8px stroke with round caps.
 * No icon-font, no network fetch, no per-icon Vue component: one `<svg>` that
 * references a `<symbol>` in the sprite we inject once at app start. That keeps
 * the bundle tiny and the stroke weight perfectly consistent.
 *
 * `sprite()` returns the full inline SVG sprite string (used in index.html and
 * by the mockup); `iconPath(name)` returns the raw inner markup.
 */

/** name -> inner SVG markup (paths/shapes drawn in a 24x24 viewBox) */
export const ICONS = {
  /* ---- transport / download control ---- */
  download: '<path d="M12 3.5v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>',
  upload: '<path d="M12 20.5v-11"/><path d="M7.5 13.5 12 9l4.5 4.5"/><path d="M4 6.5V5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 5v1.5"/>',
  pause: '<path d="M9.5 5v14"/><path d="M14.5 5v14"/>',
  play: '<path d="M7.5 5.2a.7.7 0 0 1 1.06-.6l8.2 5.3a.7.7 0 0 1 0 1.2l-8.2 5.3a.7.7 0 0 1-1.06-.6z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  resume: '<path d="M7.5 5.2a.7.7 0 0 1 1.06-.6l8.2 5.3a.7.7 0 0 1 0 1.2l-8.2 5.3a.7.7 0 0 1-1.06-.6z"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6.5 6.5 17.5 17.5"/><path d="M17.5 6.5 6.5 17.5"/>',
  check: '<path d="M5 12.5 9.5 17 19 7"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/>',
  'x-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m9.5 9.5 5 5"/><path d="m14.5 9.5-5 5"/>',
  alert: '<path d="M12 4.6 2.9 20h18.2z"/><path d="M12 10v4.2"/><path d="M12 17.3h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><path d="M12 7.9h.01"/>',
  'more-h': '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  'more-v': '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>',
  'chevron-right': '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  'chevron-left': '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  'chevron-down': '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
  'chevron-up': '<path d="m5.5 14.5 6.5-6.5 6.5 6.5"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',

  home: '<path d="M4 10.6 12 4l8 6.6"/><path d="M6.2 9.2v9.4a1.6 1.6 0 0 0 1.6 1.6h8.4a1.6 1.6 0 0 0 1.6-1.6V9.2"/><path d="M10 20.2v-5.4a2 2 0 0 1 4 0v5.4"/>',

  /* ---- sources ---- */
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10.4 9.6 4.6 2.4-4.6 2.4z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.1" cy="6.9" r="1.05"/>',
  magnet: '<path d="M6 3.5v8a6 6 0 0 0 12 0v-8h-4.2v8a1.8 1.8 0 0 1-3.6 0v-8z"/><path d="M6 7.2h4.2"/><path d="M13.8 7.2H18"/>',
  torrent: '<path d="M12 3.2v9.4"/><path d="M8.4 9.2 12 12.8l3.6-3.6"/><path d="M4.5 16.2h15"/><path d="M6.5 19.6h11"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5a13 13 0 0 1 0 17a13 13 0 0 1 0-17z"/>',
  link: '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0L6.1 12.8a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3"/>',
  clipboard: '<rect x="5.5" y="4.5" width="13" height="16" rx="2.5"/><path d="M9.5 4.5V3.6a1.1 1.1 0 0 1 1.1-1.1h2.8a1.1 1.1 0 0 1 1.1 1.1v.9z"/><path d="M9 11h6"/><path d="M9 14.8h4"/>',
  browser: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M2.5 9h19"/><circle cx="6" cy="6.75" r=".8"/><circle cx="8.8" cy="6.75" r=".8"/>',
  cloud: '<path d="M7.2 18.5A4.2 4.2 0 0 1 7 10.1a5.4 5.4 0 0 1 10.2 1.4 3.6 3.6 0 0 1-.6 7z"/>',
  server: '<rect x="3.5" y="4.5" width="17" height="6" rx="2"/><rect x="3.5" y="13.5" width="17" height="6" rx="2"/><path d="M7 7.5h.01"/><path d="M7 16.5h.01"/>',
  share: '<circle cx="17.5" cy="5.8" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18.2" r="2.6"/><path d="m8.9 10.7 6.3-3.5"/><path d="m8.9 13.3 6.3 3.5"/>',
  cast: '<path d="M2.8 19.2a2 2 0 0 1 2 2"/><path d="M2.8 15.4a5.8 5.8 0 0 1 5.8 5.8"/><path d="M2.8 11.6a9.6 9.6 0 0 1 9.6 9.6"/><path d="M20.5 12.4V5.6a2 2 0 0 0-2-2H5.2"/>',

  /* ---- content types ---- */
  video: '<rect x="2.5" y="5" width="14" height="14" rx="3"/><path d="m16.5 10.5 5-3v9l-5-3z"/>',
  film: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M7.5 4.5v15"/><path d="M16.5 4.5v15"/><path d="M2.5 12h19"/><path d="M2.5 8.2h5"/><path d="M2.5 15.8h5"/><path d="M16.5 8.2h5"/><path d="M16.5 15.8h5"/>',
  music: '<path d="M9 18.2V6.4l10-1.9v11.8"/><circle cx="6.6" cy="18.2" r="2.6"/><circle cx="16.6" cy="16.3" r="2.6"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13.5" width="4.5" height="7" rx="2.2"/><rect x="17" y="13.5" width="4.5" height="7" rx="2.2"/>',
  mic: '<rect x="9" y="2.8" width="6" height="11.4" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3.2"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.6" cy="9.8" r="1.7"/><path d="m3.6 17.4 4.8-4.6a2 2 0 0 1 2.7 0l3 2.9a2 2 0 0 0 2.7 0l3.6-3.4"/>',
  file: '<path d="M13.6 2.8H7a2.2 2.2 0 0 0-2.2 2.2v14a2.2 2.2 0 0 0 2.2 2.2h10a2.2 2.2 0 0 0 2.2-2.2V8.4z"/><path d="M13.6 2.8v5.6h5.6"/>',
  archive: '<rect x="3" y="3.8" width="18" height="4.4" rx="1.6"/><path d="M4.8 8.2v10.4a1.6 1.6 0 0 0 1.6 1.6h11.2a1.6 1.6 0 0 0 1.6-1.6V8.2"/><path d="M10 12.2h4"/>',
  apk: '<path d="M7.2 10.4a4.8 4.8 0 0 1 9.6 0z"/><rect x="5.4" y="10.4" width="13.2" height="7.6" rx="2.6"/><path d="M8.4 5.4 9.9 7.9"/><path d="M15.6 5.4 14.1 7.9"/><path d="M9.6 13h.01"/><path d="M14.4 13h.01"/><path d="M3.4 12.2v4"/><path d="M20.6 12.2v4"/>',
  doc: '<path d="M13.6 2.8H7a2.2 2.2 0 0 0-2.2 2.2v14a2.2 2.2 0 0 0 2.2 2.2h10a2.2 2.2 0 0 0 2.2-2.2V8.4z"/><path d="M13.6 2.8v5.6h5.6"/><path d="M8.6 13h6.8"/><path d="M8.6 16.6h4.6"/>',
  subtitles: '<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M6.8 14.6h4.4"/><path d="M14 14.6h3.2"/><path d="M6.8 10.6h10.4"/>',
  folder: '<path d="M3 7.4a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8H19a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'folder-open': '<path d="M3 7.4a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8H19a2 2 0 0 1 2 2v.6"/><path d="M3.4 10.6h17.9l-2.1 8.2a2 2 0 0 1-1.9 1.4H5.4a2 2 0 0 1-2-1.6z"/>',
  trash: '<path d="M3.8 6.6h16.4"/><path d="M9 6.6V4.9a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 4.9v1.7"/><path d="m5.9 6.6 1 12.4a1.8 1.8 0 0 0 1.8 1.6h6.6a1.8 1.8 0 0 0 1.8-1.6l1-12.4"/><path d="M10.2 10.6v6"/><path d="M13.8 10.6v6"/>',
  save: '<path d="M5.5 3.5h10L20.5 8.5v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M8 3.5v5h7v-5"/><path d="M7.5 20.5v-6h9v6"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.4"/><path d="M15.5 5.6a2.1 2.1 0 0 0-2.1-2.1H5.6a2.1 2.1 0 0 0-2.1 2.1v7.8a2.1 2.1 0 0 0 2.1 2.1"/>',
  edit: '<path d="M16.2 3.9a2.3 2.3 0 0 1 3.3 3.3L7.6 19.1l-4.1.8.8-4.1z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m20.2 20.2-4.6-4.6"/>',
  filter: '<path d="M3.6 5.2h16.8l-6.5 7.7v5.9l-3.8 2v-7.9z"/>',
  sort: '<path d="M4 7h16"/><path d="M6.5 12h11"/><path d="M9 17h6"/>',
  grid: '<rect x="3.6" y="3.6" width="7" height="7" rx="2"/><rect x="13.4" y="3.6" width="7" height="7" rx="2"/><rect x="3.6" y="13.4" width="7" height="7" rx="2"/><rect x="13.4" y="13.4" width="7" height="7" rx="2"/>',
  list: '<path d="M8.4 6.2h12"/><path d="M8.4 12h12"/><path d="M8.4 17.8h12"/><path d="M3.9 6.2h.01"/><path d="M3.9 12h.01"/><path d="M3.9 17.8h.01"/>',
  layers: '<path d="m12 3.2 8.6 4.4L12 12 3.4 7.6z"/><path d="m3.4 12.4 8.6 4.4 8.6-4.4"/><path d="m3.4 16.8 8.6 4.4 8.6-4.4"/>',

  /* ---- status / system ---- */
  wifi: '<path d="M2.6 9.2a14 14 0 0 1 18.8 0"/><path d="M5.8 12.7a9.3 9.3 0 0 1 12.4 0"/><path d="M9 16.2a4.6 4.6 0 0 1 6 0"/><path d="M12 19.8h.01"/>',
  'wifi-off': '<path d="m2.8 2.8 18.4 18.4"/><path d="M5.8 12.7a9.3 9.3 0 0 1 4-2.4"/><path d="M2.6 9.2a14 14 0 0 1 5.3-3.2"/><path d="M15.4 6.4a14 14 0 0 1 6 2.8"/><path d="M9 16.2a4.6 4.6 0 0 1 6 0"/><path d="M12 19.8h.01"/>',
  'mobile-data': '<path d="M7.5 4.5v15"/><path d="M16.5 4.5v15"/><path d="m4.5 8 3-3.5L10.5 8"/><path d="m13.5 16 3 3.5 3-3.5"/>',
  battery: '<rect x="2.5" y="7.5" width="16.5" height="9" rx="2.5"/><path d="M21.5 11v2"/><rect x="5" y="10" width="7" height="4" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 1.9"/>',
  timer: '<path d="M10 2.8h4"/><circle cx="12" cy="13.6" r="7.6"/><path d="M12 10.2v3.6l2.4 1.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.8h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  zap: '<path d="M13.4 2.5 4.8 13.4h6.2l-1.4 8.1 8.6-10.9h-6.2z"/>',
  gauge: '<path d="M4 18a8.6 8.6 0 1 1 16 0"/><path d="m12 14.2 3.6-4.4"/><circle cx="12" cy="15" r="1.4"/>',
  activity: '<path d="M2.8 12.8h4L9.4 6l4.4 12 2.6-5.2h4.8"/>',
  signal: '<path d="M4 20v-4"/><path d="M9.3 20v-8"/><path d="M14.7 20v-12"/><path d="M20 20V4"/>',
  'hard-drive': '<path d="M4.4 12.6 6.9 5.4a2 2 0 0 1 1.9-1.3h6.4a2 2 0 0 1 1.9 1.3l2.5 7.2"/><rect x="3" y="12.6" width="18" height="6.8" rx="2"/><path d="M7 16h.01"/><path d="M10.4 16h.01"/>',
  shield: '<path d="M12 3.2 4.8 6v5.6c0 4.3 3 8.1 7.2 9.2 4.2-1.1 7.2-4.9 7.2-9.2V6z"/><path d="m9.2 12.1 2 2 3.6-4"/>',
  lock: '<rect x="4.8" y="10.4" width="14.4" height="10" rx="2.6"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/><path d="M12 14.4v2.2"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12"/><circle cx="12" cy="12" r="3.2"/>',
  'eye-off': '<path d="M9.6 6.2A9.6 9.6 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-3.3 4.1"/><path d="M6.3 7.9A17 17 0 0 0 2.5 12S6 18.2 12 18.2a9.4 9.4 0 0 0 3.8-.8"/><path d="m10.2 10.3a2.6 2.6 0 0 0 3.5 3.6"/><path d="m3 3 18 18"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5.2-2 6.6-2 6.6h16S18 14.2 18 9"/><path d="M13.7 19.4a2 2 0 0 1-3.4 0"/>',
  'bell-off': '<path d="m2.8 2.8 18.4 18.4"/><path d="M8.2 5.3A6 6 0 0 1 18 9c0 1.6.2 2.8.5 3.7"/><path d="M17.4 15.6H4s2-1.4 2-6.6c0-.5.1-1 .2-1.4"/><path d="M13.7 19.4a2 2 0 0 1-3.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.3 14.4a1.5 1.5 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1v.3a1.9 1.9 0 1 1-3.7 0v-.2a1.5 1.5 0 0 0-2.7-1l-.1.1a1.9 1.9 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1-2.6h-.3a1.9 1.9 0 1 1 0-3.7h.2a1.5 1.5 0 0 0 1-2.7l-.1-.1A1.9 1.9 0 1 1 7.8 4.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.3a1.9 1.9 0 1 1 3.7 0v.2a1.5 1.5 0 0 0 2.6 1l.1-.1a1.9 1.9 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1 2.6h.3a1.9 1.9 0 1 1 0 3.7h-.2a1.5 1.5 0 0 0-1.4.9z"/>',
  sliders: '<path d="M4 7.5h9"/><path d="M17.5 7.5H20"/><circle cx="15.2" cy="7.5" r="2.3"/><path d="M4 16.5h2.5"/><path d="M11 16.5h9"/><circle cx="8.8" cy="16.5" r="2.3"/>',
  palette: '<path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.3 0 1.9-.9 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h1.4a4.6 4.6 0 0 0 4.6-4.6c0-3.9-3.9-7-8.7-7"/><circle cx="7.6" cy="11.4" r="1.2"/><circle cx="10.2" cy="7.6" r="1.2"/><circle cx="14.6" cy="7.9" r="1.2"/>',
  moon: '<path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.2"/><path d="M12 19.4v2.2"/><path d="M4.6 4.6 6.2 6.2"/><path d="M17.8 17.8l1.6 1.6"/><path d="M2.4 12h2.2"/><path d="M19.4 12h2.2"/><path d="M4.6 19.4 6.2 17.8"/><path d="M17.8 6.2l1.6-1.6"/>',
  smartphone: '<rect x="6" y="2.6" width="12" height="18.8" rx="3"/><path d="M10.6 18.6h2.8"/>',
  android: '<path d="M7.4 10.2a4.6 4.6 0 0 1 9.2 0z"/><rect x="4.6" y="10.2" width="14.8" height="8.4" rx="2.6"/><path d="M8.6 5.2 10 7.6"/><path d="M15.4 5.2 14 7.6"/><path d="M9.4 13h.01"/><path d="M14.6 13h.01"/>',
  cpu: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.4"/><rect x="9.8" y="9.8" width="4.4" height="4.4" rx="1"/><path d="M9.6 2.8v3.6"/><path d="M14.4 2.8v3.6"/><path d="M9.6 17.6v3.6"/><path d="M14.4 17.6v3.6"/><path d="M2.8 9.6h3.6"/><path d="M2.8 14.4h3.6"/><path d="M17.6 9.6h3.6"/><path d="M17.6 14.4h3.6"/>',
  database: '<ellipse cx="12" cy="6" rx="7.6" ry="3.2"/><path d="M4.4 6v12c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2V6"/><path d="M4.4 12c0 1.8 3.4 3.2 7.6 3.2s7.6-1.4 7.6-3.2"/>',
  key: '<circle cx="7.8" cy="15.6" r="4.2"/><path d="m10.8 12.6 8-8"/><path d="m16.4 7 2.4 2.4"/><path d="m18.6 4.8 2.2 2.2"/>',
  bug: '<rect x="7.6" y="7.4" width="8.8" height="12" rx="4.4"/><path d="M9.4 5.6a2.6 2.6 0 0 1 5.2 0"/><path d="M3.4 10.6h4.2"/><path d="M16.4 10.6h4.2"/><path d="M3.4 18.4 7.6 16"/><path d="M20.6 18.4 16.4 16"/><path d="M12 11v6"/>',
  star: '<path d="m12 3.6 2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.3 10l6-.9z"/>',
  bookmark: '<path d="M6.4 3.8h11.2a1 1 0 0 1 1 1v15.8l-6.6-4-6.6 4V4.8a1 1 0 0 1 1-1"/>',
  refresh: '<path d="M20.4 11a8.4 8.4 0 0 0-14.6-4.6L3.6 8.6"/><path d="M3.6 4.6v4h4"/><path d="M3.6 13a8.4 8.4 0 0 0 14.6 4.6l2.2-2.2"/><path d="M20.4 19.4v-4h-4"/>',
  history: '<path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1L3.6 8.4"/><path d="M3.6 4.4v4h4"/><path d="M12 7.8V12l3 1.8"/>',
  'power-off': '<path d="M12 3.4v8.4"/><path d="M17.6 6.4a8 8 0 1 1-11.2 0"/>',
  'external-link': '<path d="M14 3.8h6.2V10"/><path d="M20.2 3.8 11.6 12.4"/><path d="M18 14.4v4.4a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8V8.2a1.8 1.8 0 0 1 1.8-1.8H10"/>',
  'drag-handle': '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  'crop-free': '<path d="M3.8 8.4V5.6a1.8 1.8 0 0 1 1.8-1.8h2.8"/><path d="M15.6 3.8h2.8a1.8 1.8 0 0 1 1.8 1.8v2.8"/><path d="M20.2 15.6v2.8a1.8 1.8 0 0 1-1.8 1.8h-2.8"/><path d="M8.4 20.2H5.6a1.8 1.8 0 0 1-1.8-1.8v-2.8"/>',
  scan: '<path d="M3.8 8.4V5.6a1.8 1.8 0 0 1 1.8-1.8h2.8"/><path d="M15.6 3.8h2.8a1.8 1.8 0 0 1 1.8 1.8v2.8"/><path d="M20.2 15.6v2.8a1.8 1.8 0 0 1-1.8 1.8h-2.8"/><path d="M8.4 20.2H5.6a1.8 1.8 0 0 1-1.8-1.8v-2.8"/><path d="M3.8 12h16.4"/>',
  'queue-music': '<path d="M3.6 6.6h11"/><path d="M3.6 11h11"/><path d="M3.6 15.4h7"/><path d="M17 15.6V9.2l3.6-.7v6.4"/><circle cx="15.6" cy="15.9" r="1.9"/><circle cx="19.1" cy="15.2" r="1.9"/>',
  speed: '<path d="M12 3.6a8.6 8.6 0 0 0-8.6 8.6c0 1.9.6 3.6 1.6 5h14c1-1.4 1.6-3.1 1.6-5A8.6 8.6 0 0 0 12 3.6"/><path d="m12 12.6 3.4-3.8"/><circle cx="12" cy="13.4" r="1.2"/>',
  hash: '<path d="M9.4 3.6 7.6 20.4"/><path d="M16.4 3.6l-1.8 16.8"/><path d="M4.2 8.6h16"/><path d="M3.4 15.4h16"/>',
  users: '<circle cx="9.4" cy="8.4" r="3.6"/><path d="M2.8 20.2a6.6 6.6 0 0 1 13.2 0"/><path d="M16.4 5.1a3.6 3.6 0 0 1 0 6.9"/><path d="M17.6 14.2a6.6 6.6 0 0 1 3.6 6"/>',
  seedling: '<path d="M12 21v-7.4"/><path d="M12 13.6C12 9.9 9.1 7 5.4 7H3.4v2c0 3.7 2.9 6.6 6.6 6.6z"/><path d="M12 13.6c0-3.7 2.9-6.6 6.6-6.6H20.6v2c0 3.7-2.9 6.6-6.6 6.6z"/>',
  heart: '<path d="M12 20.4S3.6 15.4 3.6 9.4a4.4 4.4 0 0 1 8.4-1.8 4.4 4.4 0 0 1 8.4 1.8c0 6-8.4 11-8.4 11"/>',
  'sd-card': '<path d="M7.4 3.4h7.2l4 4v12.2a1.4 1.4 0 0 1-1.4 1.4H7.4a1.4 1.4 0 0 1-1.4-1.4V4.8a1.4 1.4 0 0 1 1.4-1.4"/><path d="M10 6.6v3"/><path d="M13 6.6v3"/>',
  pie: '<path d="M12 3.4a8.6 8.6 0 1 0 8.6 8.6h-8.6z"/><path d="M15.4 2.6a6 6 0 0 1 6 6h-6z"/>',
  target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
  'wifi-tethering': '<path d="M6.2 15.8a8.2 8.2 0 0 1 11.6 0"/><path d="M3 12.6a12.6 12.6 0 0 1 18 0"/><circle cx="12" cy="19.2" r="1.4"/>',
  'arrow-down-tray': '<path d="M12 3.6v10.2"/><path d="m8.2 10.4 3.8 3.8 3.8-3.8"/><path d="M4.4 16.6v2.2a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8v-2.2"/>',
  shuffle: '<path d="M17 3.8 20.6 7 17 10.2"/><path d="M17 13.8l3.6 3.2-3.6 3.2"/><path d="M3.4 7h3.2c1.4 0 2.4.8 3.2 2l3.4 6c.8 1.2 1.8 2 3.2 2h3"/><path d="M3.4 17h3.2c1.2 0 2.1-.6 2.8-1.5"/><path d="M14.2 8c.7-.7 1.5-1 2.4-1h3.6"/>',
  repeat: '<path d="M17 2.8 20.6 6.4 17 10"/><path d="M3.4 12.4V9.8a3.4 3.4 0 0 1 3.4-3.4h13.8"/><path d="M7 21.2 3.4 17.6 7 14"/><path d="M20.6 11.6v2.6a3.4 3.4 0 0 1-3.4 3.4H3.4"/>',
  'skip-forward': '<path d="M5.4 5.2 14 12l-8.6 6.8z"/><path d="M18.6 5.2v13.6"/>',
  'skip-back': '<path d="M18.6 5.2 10 12l8.6 6.8z"/><path d="M5.4 5.2v13.6"/>',
  'volume': '<path d="M11 5.2 6.6 8.8H3.4v6.4h3.2L11 18.8z"/><path d="M15.2 9.4a3.6 3.6 0 0 1 0 5.2"/><path d="M17.8 6.8a7.2 7.2 0 0 1 0 10.4"/>',
  maximize: '<path d="M9 3.6H3.6V9"/><path d="M15 20.4h5.4V15"/><path d="M3.6 3.6 9.4 9.4"/><path d="M20.4 20.4 14.6 14.6"/>',
  minimize: '<path d="M9.4 3.6v5.8H3.6"/><path d="M14.6 20.4v-5.8h5.8"/>',
  'rotate-cw': '<path d="M20.4 5.6v4.8h-4.8"/><path d="M19.4 10.4A8 8 0 1 0 20 14"/>',
  sparkles: '<path d="m12 3.4 1.7 4.5 4.5 1.7-4.5 1.7L12 15.8l-1.7-4.5-4.5-1.7 4.5-1.7z"/><path d="m18.4 15.2.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z"/>',
  wand: '<path d="m4 20 10.4-10.4"/><path d="M16.6 4.2 17.6 6l1.8 1-1.8 1-1 1.8-1-1.8-1.8-1 1.8-1z"/><path d="M7.4 4.6 8 5.8l1.2.6-1.2.6-.6 1.2-.6-1.2L5.6 6.4l1.2-.6z"/><path d="m14.6 14.4 4.2-4.2a1.6 1.6 0 0 1 2.2 2.2l-4.2 4.2z"/>',
  plug: '<path d="M9 3.4v5"/><path d="M15 3.4v5"/><path d="M6.6 8.4h10.8v3.2a5.4 5.4 0 0 1-10.8 0z"/><path d="M12 17v3.6"/>',
  infinity: '<path d="M6.8 8.4a3.6 3.6 0 1 0 0 7.2c2.4 0 3.4-3.6 5.2-3.6s2.8 3.6 5.2 3.6a3.6 3.6 0 1 0 0-7.2c-2.4 0-3.4 3.6-5.2 3.6S9.2 8.4 6.8 8.4"/>',
  'file-question': '<path d="M13.6 2.8H7a2.2 2.2 0 0 0-2.2 2.2v14a2.2 2.2 0 0 0 2.2 2.2h10a2.2 2.2 0 0 0 2.2-2.2V8.4z"/><path d="M13.6 2.8v5.6h5.6"/><path d="M9.9 13.4a2.1 2.1 0 1 1 3.2 1.8c-.7.5-1.1.9-1.1 1.7"/><path d="M12 19.4h.01"/>',
};

export const ICON_NAMES = Object.keys(ICONS);

/**
 * Build the inline `<svg>` sprite. Injected once into index.html (and into the
 * mockup) so every icon in the app is a single `<use href="#i-name">`.
 */
export function sprite(names = ICON_NAMES) {
  const symbols = names
    .filter((n) => ICONS[n])
    .map((n) => `    <symbol id="i-${n}" viewBox="0 0 24 24">${ICONS[n]}</symbol>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${symbols}\n  </svg>`;
}

/** Raw `<svg>` element markup for a single icon (server-side / static use). */
export function svg(name, { size = 24, cls = '', strokeWidth } = {}) {
  const body = ICONS[name];
  if (!body) return `<!-- unknown icon: ${name} -->`;
  const sw = strokeWidth ? ` stroke-width="${strokeWidth}"` : '';
  const c = cls ? ` class="${cls}"` : '';
  return `<svg${c} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${sw}>${body}</svg>`;
}
