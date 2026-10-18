/**
 * Surge — color engine
 * ---------------------------------------------------------------------------
 * Perceptual colour maths in OKLCH used to expand a handful of brand colours
 * into a full Material-3 style tonal palette + surface ramp, for BOTH light
 * and dark schemes.
 *
 * Why OKLCH and not HSL: HSL lightness is not perceptually uniform (yellow at
 * L=50% looks far brighter than blue at L=50%). OKLCH gives us a lightness axis
 * that matches human perception, which is exactly what a tonal palette needs —
 * tone(40) should *look* like the same weight across every hue.
 *
 * Everything here is dependency-free so it runs identically in Node (build
 * time, to emit CSS) and in the browser (runtime theme switching).
 */

/* ------------------------------------------------------------------ hex --- */

export const clamp = (v, min = 0, max = 1) => (v < min ? min : v > max ? max : v);

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const to = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/* --------------------------------------------------- srgb <-> linear rgb --- */

const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const linearToSrgb = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
};

/* --------------------------------------------------------- rgb <-> oklab --- */

export function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);

  return [
    linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/* --------------------------------------------------------- rgb <-> oklch --- */

export function rgbToOklch(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

export function oklchToRgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  return oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)]);
}

export const hexToOklch = (hex) => rgbToOklch(hexToRgb(hex));
export const oklchToHex = (lch) => rgbToHex(...oklchToRgb(lch));

const inGamut = (rgb, eps = 0.6) =>
  rgb.every((c) => c >= -eps && c <= 255 + eps);

/**
 * Reduce chroma until the colour fits inside sRGB. Binary search keeps it
 * accurate to ~1/256 of the starting chroma in 8 steps.
 */
export function gamutClip(L, C, H) {
  if (C <= 0) return oklchToRgb([L, 0, H]);
  if (inGamut(oklchToRgb([L, C, H]))) return oklchToRgb([L, C, H]);
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb([L, mid, H]))) lo = mid;
    else hi = mid;
  }
  return oklchToRgb([L, lo, H]);
}

/* ------------------------------------------------------------ tonal ramp --- */

/**
 * Material "tone" is defined on the CIE L* scale (0 = black, 100 = white).
 * Our working space is OKLCH, so we convert:
 *
 *   tone (L*)  →  relative luminance Y  →  OKLab L
 *
 * For a neutral, OKLab L is exactly Y^(1/3) (the LMS rows sum to 1 and the
 * OKLab L row sums to 1, so grey maps cleanly through the cube root). Chromatic
 * colours drift a little from the ideal, but the mapping stays monotonic and
 * consistent across hues — which is the property a tonal palette actually needs.
 *
 * Getting this right matters: a naive `L_ok = tone/100` crushes the dark end
 * (tone 6 becomes near-black instead of the intended #101114-ish surface).
 */
export function toneToOklabL(tone) {
  const t = clamp(tone, 0, 100);
  if (t === 0) return 0;
  if (t >= 100) return 1;
  // CIE L* → Y (Yn = 1), using the linear segment below the ε knee.
  const y = t <= 8 ? t / 903.2962962 : Math.pow((t + 16) / 116, 3);
  return Math.cbrt(y);
}

/** Inverse of the above — useful for auditing and for Material You blending. */
export function oklabLToTone(L) {
  const y = clamp(L, 0, 1) ** 3;
  return y <= 0.008856451679 ? y * 903.2962962 : 116 * Math.cbrt(y) - 16;
}

/**
 * Build a 0..100 tonal palette from a seed colour.
 * Returns { 0:'#000', 4:'#..', ..., 100:'#fff' }
 */
export function tonalPalette(seedHex, opts = {}) {
  const [L, C, H] = hexToOklch(seedHex);
  const chromaScale = opts.chromaScale ?? 1;
  // Very desaturated seeds (near-neutrals) keep whatever tint they have.
  const baseChroma = Math.max(C, opts.minChroma ?? 0) * chromaScale;
  // Chroma peaks in the mid-tones and falls off toward the extremes, so very
  // light containers stay soft and very dark ones stay readable.
  const chromaAt = (t) => baseChroma * (1 - Math.pow(Math.abs(t - 50) / 50, 2.2) * 0.5);

  const tones = [0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100];
  const out = {};
  for (const t of tones) {
    out[t] = rgbToHex(...gamutClip(toneToOklabL(t), chromaAt(t), H));
  }
  return out;
}

/** The standard tone ladder, exported for swatch UIs. */
export const TONES = [0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100];

/* --------------------------------------------------------------- helpers --- */

/** Mix two hex colours in OKLab (perceptually correct blend). */
export function mixHex(a, b, amount = 0.5) {
  const [La, aa, ba] = rgbToOklab(hexToRgb(a));
  const [Lb, ab, bb] = rgbToOklab(hexToRgb(b));
  return rgbToHex(...oklabToRgb([La + (Lb - La) * amount, aa + (ab - aa) * amount, ba + (bb - ba) * amount]));
}

/** Rotate hue by `deg`, optionally scaling chroma. */
export function rotateHue(hex, deg, chromaScale = 1) {
  const [L, C, H] = hexToOklch(hex);
  return rgbToHex(...gamutClip(L, C * chromaScale, (H + deg + 360) % 360));
}

/** Relative luminance (WCAG). */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Pick black or white text for a given background, honouring a minimum
 * contrast target. Used for chips/badges where the token system can't know
 * the surface ahead of time.
 */
export function readableOn(hex, minRatio = 4.5) {
  if (contrast(hex, '#ffffff') >= minRatio) return '#ffffff';
  if (contrast(hex, '#000000') >= minRatio) return '#000000';
  return contrast(hex, '#ffffff') > contrast(hex, '#000000') ? '#ffffff' : '#000000';
}

/** hex -> "r g b" triple for use inside rgb(... / <alpha>) modern syntax. */
export function rgbTriplet(hex) {
  return hexToRgb(hex).join(' ');
}

/** Parse "#rgb"/"#rrggbb" or "r g b" into an alpha-capable css colour. */
export function withAlpha(hex, alpha) {
  return `rgb(${rgbTriplet(hex)} / ${alpha})`;
}
