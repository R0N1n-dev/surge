/**
 * Surge — theme system
 * ---------------------------------------------------------------------------
 * Source of truth for every theme in the app. The nine palettes come straight
 * from `app-theme.txt` (5 dual 80/20 themes + 4 triple 60/30/10 themes); each
 * is expanded into a full light AND dark Material-3 style token set.
 *
 * Distribution rules from the spec are respected:
 *   dual   → 80% primary surface/structure, 20% accent as the "pop"
 *   triple → 60% dominant, 30% structural, 10% accent
 *
 * Consumed by:
 *   - tools/gen-css.mjs       → src/styles/themes.css (static, zero-JS first paint)
 *   - src/composables/useTheme.js → runtime switching + Material You injection
 *   - mockup/build-mockup.mjs → the design mockup
 */

import { tonalPalette, hexToOklch, oklchToHex, rotateHue, contrast, readableOn } from './color.mjs';

/** The nine brand palettes, verbatim from app-theme.txt. */
export const BRAND_THEMES = [
  {
    id: 'classic-corporate',
    name: 'Classic Corporate',
    use: 'Fintech, SaaS & crypto',
    kind: 'dual',
    ratio: '80 / 20',
    seed: { primary: '#1E2761', accent: '#408EC6' },
    label: { primary: 'Deep Navy', accent: 'Electric Blue' },
  },
  {
    id: 'energetic-retail',
    name: 'Energetic Retail',
    use: 'E-commerce, delivery & travel',
    kind: 'dual',
    ratio: '80 / 20',
    seed: { primary: '#2C3E50', accent: '#E67E22' },
    label: { primary: 'Charcoal', accent: 'Warm Orange' },
  },
  {
    id: 'eco-organic',
    name: 'Eco-Organic',
    use: 'Sustainability, gardening & wellness',
    kind: 'dual',
    ratio: '80 / 20',
    seed: { primary: '#2C5F2D', accent: '#97BC62' },
    label: { primary: 'Forest Green', accent: 'Moss Green' },
  },
  {
    id: 'cyber-contrast',
    name: 'Cyber High-Contrast',
    use: 'Productivity, dev tools & fitness',
    kind: 'dual',
    ratio: '80 / 20',
    seed: { primary: '#1A1A1A', accent: '#C1DD13' },
    label: { primary: 'Ink Black', accent: 'Neon Lime' },
  },
  {
    id: 'minimal-editorial',
    name: 'Minimalist Editorial',
    use: 'Fashion, portfolio & lifestyle',
    kind: 'dual',
    ratio: '80 / 20',
    seed: { primary: '#CC313D', accent: '#F7C5CC' },
    label: { primary: 'Cherry Red', accent: 'Blush Pink' },
  },
  {
    id: 'high-end-trio',
    name: 'The High-End Trio',
    use: 'Luxury retail, portfolio & fine dining',
    kind: 'triple',
    ratio: '60 / 30 / 10',
    seed: { primary: '#1E2761', secondary: '#408EC6', accent: '#7A2048' },
    label: { primary: 'Midnight Blue', secondary: 'Royal Blue', accent: 'Burgundy Wine' },
  },
  {
    id: 'bright-tech',
    name: 'The Bright Tech Vibe',
    use: 'SaaS dashboards, finance & data',
    kind: 'triple',
    ratio: '60 / 30 / 10',
    seed: { primary: '#2D3047', secondary: '#2EC4B6', accent: '#FF7A59' },
    label: { primary: 'Dark Slate', secondary: 'Mint Teal', accent: 'Vibrant Coral' },
  },
  {
    id: 'playful-pastel',
    name: 'The Playful Pastel',
    use: 'Casual social, mindfulness & education',
    kind: 'triple',
    ratio: '60 / 30 / 10',
    seed: { primary: '#B298E7', secondary: '#B8E3E9', accent: '#F5B8D5' },
    label: { primary: 'Soft Lavender', secondary: 'Pale Sky Blue', accent: 'Bubblegum Pink' },
  },
  {
    id: 'earthy-muted',
    name: 'The Earthy Muted',
    use: 'Home decor, plant tracking & lifestyle',
    kind: 'triple',
    ratio: '60 / 30 / 10',
    seed: { primary: '#4A5842', secondary: '#EFEBE4', accent: '#D98A6C' },
    label: { primary: 'Muted Sage', secondary: 'Alabaster', accent: 'Terracotta' },
  },
];

/**
 * Neutral ramp is tinted with the primary hue so light/dark surfaces feel like
 * they belong to the brand instead of being generic grey. Chroma is kept low
 * (<=0.022) to avoid a "dirty" cast, and near-neutral seeds keep whatever
 * tint they already have.
 */
function neutralPalette(primary) {
  const [, C, H] = hexToOklch(primary);
  // Keep the tint subtle: enough to feel branded, not enough to look dirty.
  const tint = Math.min(Math.max(C * 0.45, 0.006), 0.022);
  return tonalPalette(hueSeed(H, tint), { chromaScale: 1 });
}

/** A mid-grey carrying only a hue + chroma — used as a neutral ramp seed. */
function hueSeed(hue, chroma) {
  return oklchToHex([0.58, chroma, hue]);
}

/**
 * Expand one brand theme + one mode into a flat token object.
 * Keys are CSS custom property names without the leading `--`.
 */
export function buildTokens(theme, mode) {
  const dark = mode === 'dark';
  const { primary, secondary, accent } = {
    primary: theme.seed.primary,
    secondary: theme.seed.secondary ?? theme.seed.accent,
    accent: theme.seed.accent ?? theme.seed.secondary,
  };

  // Dual themes: accent becomes secondary; tertiary is derived by rotating the
  // accent hue so we still get a third distinguishable colour for graphs/badges.
  const tertiarySeed = theme.kind === 'dual' ? rotateHue(accent, 62, 0.95) : accent;

  const P = tonalPalette(primary, { chromaScale: dark ? 0.94 : 1 });
  const S = tonalPalette(secondary, { chromaScale: dark ? 0.94 : 1 });
  const T = tonalPalette(tertiarySeed, { chromaScale: dark ? 0.94 : 1 });
  const E = tonalPalette(accent, { chromaScale: dark ? 0.94 : 1 }); // error/semantic anchor
  const N = neutralPalette(primary);
  const NV = neutralPalette(accent); // tinted variant for containers

  const t = dark
    ? {
        // ---- surfaces (M3 expressive dark ramp) ----------------------------
        background: N[6],
        onBackground: N[90],
        surface: N[6],
        onSurface: N[90],
        surfaceDim: N[6],
        surfaceBright: N[24],
        surfaceContainerLowest: N[4],
        surfaceContainerLow: N[10],
        surfaceContainer: N[12],
        surfaceContainerHigh: N[17],
        surfaceContainerHighest: N[22],
        onSurfaceVariant: NV[80],
        surfaceVariant: NV[30],
        outline: NV[60],
        outlineVariant: NV[30],
        scrim: '#000000',
        inverseSurface: N[90],
        inverseOnSurface: N[20],
        inversePrimary: P[40],
        // ---- primary -------------------------------------------------------
        primary: P[80],
        onPrimary: P[20],
        primaryContainer: P[30],
        onPrimaryContainer: P[90],
        primaryFixed: P[90],
        onPrimaryFixed: P[10],
        // ---- secondary (structural) ----------------------------------------
        secondary: S[80],
        onSecondary: S[20],
        secondaryContainer: S[30],
        onSecondaryContainer: S[90],
        // ---- tertiary / accent (the 10-20% pop) ----------------------------
        tertiary: T[80],
        onTertiary: T[20],
        tertiaryContainer: T[30],
        onTertiaryContainer: T[90],
        accent: E[80],
        onAccent: E[20],
        accentContainer: E[30],
        onAccentContainer: E[90],
        // ---- semantic ------------------------------------------------------
        error: '#FFB4AB',
        onError: '#690005',
        errorContainer: '#93000A',
        onErrorContainer: '#FFDAD6',
        success: '#7BD88F',
        onSuccess: '#00390F',
        successContainer: '#00531A',
        onSuccessContainer: '#B7F0B9',
        warning: '#FFD479',
        onWarning: '#4A2800',
        warningContainer: '#6B3B00',
        onWarningContainer: '#FFEDBE',
        info: '#8ECAF2',
        onInfo: '#00324B',
        infoContainer: '#004B6E',
        onInfoContainer: '#CAE6FF',
      }
    : {
        background: N[98],
        onBackground: N[10],
        surface: N[98],
        onSurface: N[10],
        surfaceDim: N[87],
        surfaceBright: N[98],
        surfaceContainerLowest: N[100],
        surfaceContainerLow: N[96],
        surfaceContainer: N[94],
        surfaceContainerHigh: N[92],
        surfaceContainerHighest: N[90],
        onSurfaceVariant: NV[30],
        surfaceVariant: NV[90],
        outline: NV[50],
        outlineVariant: NV[80],
        scrim: '#000000',
        inverseSurface: N[20],
        inverseOnSurface: N[95],
        inversePrimary: P[80],
        primary: P[40],
        onPrimary: P[100],
        primaryContainer: P[90],
        onPrimaryContainer: P[10],
        primaryFixed: P[90],
        onPrimaryFixed: P[10],
        secondary: S[40],
        onSecondary: S[100],
        secondaryContainer: S[90],
        onSecondaryContainer: S[10],
        tertiary: T[40],
        onTertiary: T[100],
        tertiaryContainer: T[90],
        onTertiaryContainer: T[10],
        accent: E[40],
        onAccent: E[100],
        accentContainer: E[90],
        onAccentContainer: E[10],
        error: '#BA1A1A',
        onError: '#FFFFFF',
        errorContainer: '#FFDAD6',
        onErrorContainer: '#410002',
        success: '#0F7B32',
        onSuccess: '#FFFFFF',
        successContainer: '#B7F0B9',
        onSuccessContainer: '#002106',
        warning: '#8A5300',
        onWarning: '#FFFFFF',
        warningContainer: '#FFDDB3',
        onWarningContainer: '#2C1800',
        info: '#00658F',
        onInfo: '#FFFFFF',
        infoContainer: '#CAE6FF',
        onInfoContainer: '#001E2E',
      };

  // ---- derived, non-M3 tokens the Surge UI leans on -----------------------
  t.shadowColor = dark ? '#000000' : N[10];
  t.scrimAlpha = dark ? 0.62 : 0.42;

  // Brand chrome: the header, FAB, widget and launcher icon use the *seed*
  // brand colour rather than the tone-shifted M3 `primary`, so the app keeps a
  // recognisable identity across every theme. Dark mode lightens it for glare.
  t.brand = dark ? P[80] : primary;
  t.brandStrong = dark ? P[90] : rotateHue(primary, 0, 1.15);
  t.brandDim = dark ? P[30] : P[90];
  t.onBrand = readableOn(t.brand);
  t.brandContrast = contrast(t.brand, t.onBrand).toFixed(2);

  // Raw seeds — used for the launcher icon, splash, widget and the speed graph
  // where we want maximum brand saturation rather than surface-friendly tones.
  t.seedPrimary = primary;
  t.seedSecondary = secondary;
  t.seedAccent = accent;
  t.onSeedAccent = readableOn(accent);

  // Download-state colours, tuned per mode for legibility on both surfaces.
  t.stateQueued = dark ? N[70] : N[40];
  t.stateActive = t.primary;
  t.statePaused = dark ? '#FFD479' : '#8A5300';
  t.stateError = t.error;
  t.stateDone = dark ? '#7BD88F' : '#0F7B32';
  t.stateSeeding = dark ? '#8ECAF2' : '#00658F';

  // Source-type badges (YouTube / Instagram / torrent / http) — these are
  // recognisable brand hues, so they are fixed but lightness-corrected per mode.
  const badge = (hex) => {
    const pal = tonalPalette(hex);
    const bg = dark ? pal[30] : pal[90];
    const fg = dark ? pal[90] : pal[20];
    return { bg, fg };
  };
  t.badgeYoutubeBg = badge('#FF0000').bg;
  t.badgeYoutubeFg = badge('#FF0000').fg;
  t.badgeInstagramBg = badge('#E1306C').bg;
  t.badgeInstagramFg = badge('#E1306C').fg;
  t.badgeTorrentBg = badge('#2E8B57').bg;
  t.badgeTorrentFg = badge('#2E8B57').fg;
  t.badgeHttpBg = badge('#5B6CFF').bg;
  t.badgeHttpFg = badge('#5B6CFF').fg;
  t.badgeAudioBg = badge('#8E44AD').bg;
  t.badgeAudioFg = badge('#8E44AD').fg;

  // ---- typography -------------------------------------------------------
  return { colors: t, typeScale: TYPE_SCALE, meta: { theme, mode, dark } };
}

/** Default M3-expressive type scale. Theme-independent, so it is emitted once
 *  on `:root` rather than duplicated into all 18 palettes. */
export const TYPE_SCALE = {
  displayLarge: { size: 44, line: 52, weight: 600, tracking: -0.8 },
  displayMedium: { size: 36, line: 44, weight: 600, tracking: -0.6 },
  displaySmall: { size: 30, line: 38, weight: 600, tracking: -0.5 },
  headlineLarge: { size: 26, line: 34, weight: 600, tracking: -0.3 },
  headlineMedium: { size: 22, line: 30, weight: 600, tracking: -0.2 },
  headlineSmall: { size: 19, line: 26, weight: 600, tracking: -0.1 },
  titleLarge: { size: 17, line: 24, weight: 600, tracking: -0.1 },
  titleMedium: { size: 15, line: 22, weight: 600, tracking: 0 },
  titleSmall: { size: 14, line: 20, weight: 550, tracking: 0.05 },
  labelLarge: { size: 13, line: 18, weight: 600, tracking: 0.1 },
  labelMedium: { size: 12, line: 16, weight: 550, tracking: 0.3 },
  labelSmall: { size: 11, line: 15, weight: 500, tracking: 0.4 },
  bodyLarge: { size: 15, line: 23, weight: 400, tracking: 0.1 },
  bodyMedium: { size: 13.5, line: 20, weight: 400, tracking: 0.1 },
  bodySmall: { size: 12, line: 17, weight: 400, tracking: 0.2 },
  monoLarge: { size: 19, line: 25, weight: 500, tracking: -0.2 },
  monoMedium: { size: 13, line: 18, weight: 500, tracking: 0 },
  monoSmall: { size: 11.5, line: 16, weight: 500, tracking: 0 },
};

/** Flatten a token bundle into CSS custom property declarations. */
export function tokensToCssVars({ colors }) {
  return Object.entries(colors)
    .map(([k, v]) => `  --s-${kebab(k)}: ${v};`)
    .join('\n');
}

export function typeScaleToCssVars(scale = TYPE_SCALE) {
  return Object.entries(scale)
    .flatMap(([k, v]) => [
      `  --s-${kebab(k)}-size: ${v.size}px;`,
      `  --s-${kebab(k)}-line: ${v.line}px;`,
      `  --s-${kebab(k)}-weight: ${v.weight};`,
      `  --s-${kebab(k)}-tracking: ${v.tracking}px;`,
    ])
    .join('\n');
}

export const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** Every theme id, for iteration. */
export const THEME_IDS = BRAND_THEMES.map((t) => t.id);
export const MODES = ['light', 'dark'];

/**
 * Default identity. "The Bright Tech Vibe" reads as a dashboard: dark slate
 * structure, mint teal for progress/throughput, coral reserved for the 10%
 * accent (errors, destructive actions, the "now playing" pip). That maps 1:1
 * onto a download manager's information hierarchy.
 */
export const DEFAULT_THEME_ID = 'bright-tech';
export const DEFAULT_MODE = 'dark';

export const getTheme = (id) => BRAND_THEMES.find((t) => t.id === id) ?? BRAND_THEMES[0];

/* ---------------------------------------------------------------------------
 * Non-colour tokens — the geometry, rhythm and motion of the design system.
 * These are theme-independent so they live in one place instead of being
 * duplicated across 18 palettes.
 * ------------------------------------------------------------------------- */

export const SPACE = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '22px',
  6: '28px',
  7: '36px',
  8: '44px',
  9: '56px',
  10: '72px',
};

/** Corner radii. Cards are roomy, controls are pill-ish, sheets top-only. */
export const RADIUS = {
  none: '0px',
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '20px',
  xl: '24px',
  xxl: '28px',
  /** Content cards. SnapTube-soft: nothing in the app is a sharp rectangle. */
  card: '24px',
  /** Thumbnails / media tiles. */
  thumb: '18px',
  full: '999px',
  sheet: '32px',
};

/**
 * Elevation. Shadow opacity differs per mode (dark UIs read elevation from
 * surface lightness, not shadow), so shadows are emitted as a colour + geometry
 * pair and the mode-specific alpha is applied in the CSS generator.
 */
export const ELEVATION = {
  0: { y: 0, blur: 0, spread: 0, alphaLight: 0, alphaDark: 0 },
  1: { y: 1, blur: 2, spread: 0, alphaLight: 0.05, alphaDark: 0.2 },
  2: { y: 2, blur: 8, spread: -2, alphaLight: 0.06, alphaDark: 0.24 },
  3: { y: 6, blur: 18, spread: -6, alphaLight: 0.08, alphaDark: 0.3 },
  4: { y: 10, blur: 30, spread: -10, alphaLight: 0.1, alphaDark: 0.36 },
  5: { y: 18, blur: 46, spread: -16, alphaLight: 0.13, alphaDark: 0.44 },
};

/**
 * Motion. Durations follow the M3 expressive curve set; `emphasized` is used
 * for anything entering the screen, `standard` for state changes in place.
 */
export const MOTION = {
  instant: '80ms',
  fast: '140ms',
  normal: '220ms',
  slow: '340ms',
  deliberate: '520ms',
  easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
  easeEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  easeEmphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  easeEmphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  easeLinear: 'linear',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

/** Touch targets: every interactive element is at least 48x48dp. */
export const SIZES = {
  touchTarget: '48px',
  iconButton: '40px',
  navBar: '64px',
  headerCollapsed: '64px',
  headerExpanded: '112px',
  fab: '56px',
  fabSmall: '40px',
  fabLarge: '96px',
  listItem: '72px',
  chip: '32px',
  controlSmall: '32px',
  controlMedium: '40px',
  controlLarge: '56px',
  progressTrack: '6px',
  progressTrackThin: '3px',
  divider: '1px',
};

/** Breakpoints — the app is phone-first but must survive tablets/foldables. */
export const BREAKPOINTS = {
  compact: '0px', // < 600dp  — phones
  medium: '600px', // 600-839 — foldables / small tablets
  expanded: '840px', // >= 840 — tablets, desktop preview
};

/** z-index ladder — kept explicit so stacking never becomes a guessing game. */
export const Z = {
  base: 0,
  content: 1,
  sticky: 10,
  header: 20,
  fab: 30,
  nav: 40,
  sheet: 60,
  dialog: 70,
  snackbar: 80,
  tooltip: 90,
  overlay: 100,
};
