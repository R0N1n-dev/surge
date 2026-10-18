#!/usr/bin/env python3
"""
Surge — icon & splash generator
===============================================================================
Pure-Python vector rasteriser. No ImageMagick, no Cairo, no Pillow: this box
has none of them and the app still needs real, correct PNGs. So we implement the
small amount of 2D graphics the job actually requires:

  * scanline polygon fill with even-odd rule
  * N× supersampling + box downsample for antialiasing
  * capsules (stroked polylines with round caps/joins) for the wordmark
  * linear gradients
  * a minimal PNG encoder (IHDR/IDAT/IEND + CRC32)

Everything is drawn from one vector description of the logo, so the 48px
launcher icon, the 432px adaptive foreground and the 2732px splash are all the
same mark at different resolutions — no upscaling, no drift between assets.

Outputs (relative to the project root):

  resources/                       master artwork + Capacitor source assets
    icon-only.png                  1024² squircle logo (store listing)
    icon-foreground.png            1024² transparent bolt (adaptive fg)
    icon-background.png            1024² brand fill (adaptive bg)
    splash.png                     2732² logo + wordmark on brand
    splash-dark.png                2732² dark variant
    logo.svg                       the same mark as vector source of truth

  android/app/src/main/res/
    mipmap-{m,h,xh,xxh,xxxh}dpi/   ic_launcher.png, ic_launcher_round.png,
                                   ic_launcher_foreground.png,
                                   ic_launcher_background.png,
                                   ic_launcher_monochrome.png
    mipmap-anydpi-v26/             ic_launcher.xml, ic_launcher_round.xml
    drawable-{m..xxxh}dpi/         ic_stat_surge.png  (notification small icon)
    drawable/                      ic_widget_surge.xml, widget_preview.png
    drawable/splash.png            Capacitor splash
    values/ic_launcher_background.xml, values/colors.xml

Usage:  python3 tools/gen-icons.py [--theme bright-tech] [--mode dark]
"""

from __future__ import annotations

import argparse
import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# --------------------------------------------------------------------------- #
#  Vector artwork
# --------------------------------------------------------------------------- #
#
#  The logo is a lightning bolt: "surge" = a sudden rush of throughput. It is
#  drawn in a 100×100 design space so the same coordinate list works for every
#  output size. The bolt is deliberately chunky — at 48px a thin mark turns to
#  mush, and launcher icons are seen at 48px far more often than at 432px.
#
BOLT = [
    (55.0, 4.0),
    (78.0, 4.0),
    (48.0, 46.0),
    (66.0, 46.0),
    (28.0, 96.0),
    (42.0, 54.0),
    (24.0, 54.0),
]

# --------------------------------------------------------------------------- #
#  Icon art direction
# --------------------------------------------------------------------------- #
#  Brief: bright, cheery, inviting — but to the point and serious.
#
#    · a confident mint-teal -> azure diagonal gradient (friendly, energetic,
#      and unmistakably "fresh" on a home screen full of grey utilities)
#    · a soft top-left gloss so the plate feels lit, not flat
#    · a whisper of bottom shade for weight — this is the "serious" part
#    · the bolt gains a rounded TRAY underneath, so at 48px the mark still says
#      "download", not merely "lightning"
#
ICON_TOP = (72, 224, 196)    # #48E0C4 bright mint
ICON_MID = (43, 178, 214)    # #2BB2D6 crossover
ICON_BOT = (37, 124, 246)    # #257CF6 azure
TRAY_Y = 84.0                # tray baseline in design space
BOLT_SQUASH = 0.78           # vertical squeeze so the tray fits under the bolt
BOLT_LIFT = 4.0


def bolt_art():
    """The bolt, compressed vertically to leave room for the tray."""
    return [(x, y * BOLT_SQUASH + BOLT_LIFT) for (x, y) in BOLT]


def tray_pts():
    return [(28.0, TRAY_Y), (72.0, TRAY_Y)]


# Wordmark "SURGE" as stroke polylines on a 4-wide × 7-tall em box per glyph.
# Rendered as capsules, so it stays geometric and legible down to small sizes.
GLYPHS = {
    "S": [[(3.6, 0.9), (1.5, 0.9), (0.6, 1.8), (0.6, 2.9), (1.5, 3.7), (2.7, 3.7),
           (3.6, 4.5), (3.6, 5.6), (2.7, 6.4), (0.6, 6.4)]],
    "U": [[(0.6, 0.9), (0.6, 5.5), (1.5, 6.4), (2.7, 6.4), (3.6, 5.5), (3.6, 0.9)]],
    "R": [[(0.6, 6.4), (0.6, 0.9), (2.7, 0.9), (3.6, 1.8), (3.6, 2.8), (2.7, 3.7), (0.6, 3.7)],
          [(2.3, 3.7), (3.7, 6.4)]],
    "G": [[(3.7, 1.7), (2.9, 0.9), (1.4, 0.9), (0.6, 1.8), (0.6, 5.5), (1.4, 6.4),
           (2.9, 6.4), (3.7, 5.5), (3.7, 3.6), (2.2, 3.6)]],
    "E": [[(3.6, 0.9), (0.6, 0.9), (0.6, 6.4), (3.6, 6.4)],
          [(0.6, 3.65), (2.9, 3.65)]],
}
WORD = "SURGE"

# Android adaptive-icon geometry, in dp.
ADAPTIVE_DP = 108          # full canvas
ADAPTIVE_SAFE_DP = 66      # guaranteed-visible centre (Google's 66dp rule)
DENSITIES = {"m": 1, "h": 1.5, "xh": 2, "xxh": 3, "xxxh": 4}


# --------------------------------------------------------------------------- #
#  Colour helpers
# --------------------------------------------------------------------------- #

def hex_to_rgb(h: str):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgba_str(c):
    return f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}" + ("" if len(c) < 4 or c[3] == 255 else f"{c[3]:02x}")


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def lighten(c, t):
    return mix(c, (255, 255, 255), t)


def darken(c, t):
    return mix(c, (0, 0, 0), t)


# --------------------------------------------------------------------------- #
#  Canvas
# --------------------------------------------------------------------------- #

class Canvas:
    """An RGBA byte buffer with just enough 2D ops to build the artwork."""

    __slots__ = ("w", "h", "buf")

    def __init__(self, w: int, h: int, color=(0, 0, 0, 0)):
        self.w, self.h = int(w), int(h)
        r, g, b, a = (list(color) + [255, 255, 255, 255])[:4]
        self.buf = bytearray(self.w * self.h * 4) if a == 0 else \
            bytearray(bytes((r, g, b, a)) * (self.w * self.h))

    # -- low level --------------------------------------------------------- #

    def _blend_span(self, x0: int, x1: int, y: int, color, alpha: float):
        """Source-over composite of `color` across [x0,x1) on row y (opaque)."""
        if x1 <= x0 or y < 0 or y >= self.h:
            return
        x0 = max(0, x0); x1 = min(self.w, x1)
        if x1 <= x0:
            return
        cr, cg, cb = color[0], color[1], color[2]
        ca = (color[3] if len(color) > 3 else 255) / 255.0 * alpha
        if ca <= 0:
            return
        off = y * self.w * 4 + x0 * 4
        if ca >= 0.999 and (len(color) < 4 or color[3] == 255):
            self.buf[off: off + (x1 - x0) * 4] = bytes((cr, cg, cb, 255)) * (x1 - x0)
            return
        inv = 1.0 - ca
        buf = self.buf
        for p in range(off, off + (x1 - x0) * 4, 4):
            da = buf[p + 3] / 255.0
            oa = ca + da * inv
            if oa <= 0:
                continue
            buf[p] = int((cr * ca + buf[p] * da * inv) / oa)
            buf[p + 1] = int((cg * ca + buf[p + 1] * da * inv) / oa)
            buf[p + 2] = int((cb * ca + buf[p + 2] * da * inv) / oa)
            buf[p + 3] = int(oa * 255)

    def _blend_row_alphas(self, y: int, x0: int, alphas, color):
        """
        Composite one row where each pixel has its own coverage alpha.
        Runs of fully-opaque coverage take a memcpy fast path, which is what
        makes a full-bleed gradient affordable in pure Python.
        """
        cr, cg, cb = color[0], color[1], color[2]
        ca_base = (color[3] if len(color) > 3 else 255) / 255.0
        opaque = ca_base >= 0.999
        buf = self.buf
        w = self.w
        n = len(alphas)
        run_start = None
        for i in range(n):
            a = alphas[i]
            if opaque and a >= 0.999:
                if run_start is None:
                    run_start = i
                continue
            if run_start is not None:
                base = y * w * 4 + (x0 + run_start) * 4
                ln = i - run_start
                buf[base: base + ln * 4] = bytes((cr, cg, cb, 255)) * ln
                run_start = None
            if a <= 0:
                continue
            ca = ca_base * a
            inv = 1.0 - ca
            p = y * w * 4 + (x0 + i) * 4
            da = buf[p + 3] / 255.0
            oa = ca + da * inv
            if oa <= 0:
                continue
            buf[p] = int((cr * ca + buf[p] * da * inv) / oa)
            buf[p + 1] = int((cg * ca + buf[p + 1] * da * inv) / oa)
            buf[p + 2] = int((cb * ca + buf[p + 2] * da * inv) / oa)
            buf[p + 3] = int(oa * 255)
        if run_start is not None:
            base = y * w * 4 + (x0 + run_start) * 4
            ln = n - run_start
            buf[base: base + ln * 4] = bytes((cr, cg, cb, 255)) * ln

    # -- coverage rasterisation -------------------------------------------- #

    def _coverage(self, polys, ss: int):
        """
        Scanline even-odd fill, restricted to the polygons' bounding box and
        supersampled ss× so the box-filter down to device pixels antialiases.

        Returns (cov, ss, bx0, by0, bw, bh) with cov sized bw*bh.
        """
        minx = min(p[0] for poly in polys for p in poly)
        maxx = max(p[0] for poly in polys for p in poly)
        miny = min(p[1] for poly in polys for p in poly)
        maxy = max(p[1] for poly in polys for p in poly)
        bx0 = max(0, int(math.floor(minx)))
        by0 = max(0, int(math.floor(miny)))
        bx1 = min(self.w, int(math.ceil(maxx)) + 1)
        by1 = min(self.h, int(math.ceil(maxy)) + 1)
        if bx1 <= bx0 or by1 <= by0:
            return None, ss, 0, 0, 0, 0
        bw, bh = bx1 - bx0, by1 - by0

        edges = []
        for poly in polys:
            n = len(poly)
            for k in range(n):
                x0, y0 = poly[k]
                x1, y1 = poly[(k + 1) % n]
                x0 = (x0 - bx0) * ss; x1 = (x1 - bx0) * ss
                y0 = (y0 - by0) * ss; y1 = (y1 - by0) * ss
                if y0 == y1:
                    continue
                edges.append((min(y0, y1), max(y0, y1), x0, x1, y0, y1))
        if not edges:
            return None, ss, bx0, by0, bw, bh
        edges.sort(key=lambda e: e[0])

        W = bw * ss
        cov = bytearray(W * bh * ss)
        active = []
        ei = 0
        ne = len(edges)
        for row in range(bh * ss):
            yc = row + 0.5
            while ei < ne and edges[ei][0] <= yc:
                active.append(edges[ei]); ei += 1
            if active:
                active = [e for e in active if e[1] > yc]
            if not active:
                continue
            xs = []
            for _, _, x0, x1, y0, y1 in active:
                t = (yc - y0) / (y1 - y0)
                xs.append(x0 + (x1 - x0) * t)
            xs.sort()
            base = row * W
            for k in range(0, len(xs) - 1, 2):
                a = max(0, int(math.ceil(xs[k] - 0.5)))
                b = min(W, int(math.floor(xs[k + 1] + 0.5)))
                if b > a:
                    cov[base + a: base + b] = b"\xff" * (b - a)
        return cov, ss, bx0, by0, bw, bh

    def _paint(self, polys, color_fn, ss=3):
        """Rasterise `polys`; `color_fn(y)` returns the colour for that row."""
        cov, s, bx0, by0, bw, bh = self._coverage(polys, ss)
        if cov is None:
            return
        W = bw * s
        inv = 1.0 / (s * s * 255.0)
        for j in range(bh):
            y = by0 + j
            if y < 0 or y >= self.h:
                continue
            alphas = []
            srow = j * s * W
            for i in range(bw):
                c0 = srow + i * s
                tot = 0
                for dy in range(s):
                    o = c0 + dy * W
                    tot += sum(cov[o:o + s])
                alphas.append(tot * inv)
            if not any(alphas):
                continue
            self._blend_row_alphas(y, bx0, alphas, color_fn(y))

    def fill_polygons(self, polys, color, ss: int = 3):
        self._paint(polys, lambda y: color, ss)

    def fill_gradient_polygons(self, polys, top, bottom, ss: int = 3):
        """Vertical linear gradient across the canvas height."""
        h = max(1, self.h - 1)
        self._paint(polys, lambda y: mix(top, bottom, y / h), ss)

    def fill_rect(self, x0, y0, x1, y1, color):
        for y in range(max(0, int(y0)), min(self.h, int(y1))):
            self._blend_span(int(x0), int(x1), y, color, 1.0)

    def fill_circle(self, cx, cy, r, color, ss: int = 3):
        n = max(24, min(512, int(r * 2)))
        poly = [(cx + r * math.cos(2 * math.pi * k / n),
                 cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
        self.fill_polygons([poly], color, ss)

    def stroke_polyline(self, pts, width, color, ss: int = 3):
        """A polyline drawn as a chain of capsules → round caps and joins."""
        r = width / 2.0
        shapes = []
        for k in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[k], pts[k + 1]
            dx, dy = x1 - x0, y1 - y0
            L = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / L * r, dx / L * r
            shapes.append([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny),
                           (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])
        for (x, y) in pts:
            n = max(16, min(128, int(r * 4)))
            shapes.append([(x + r * math.cos(2 * math.pi * k / n),
                            y + r * math.sin(2 * math.pi * k / n)) for k in range(n)])
        for shape in shapes:
            self.fill_polygons([shape], color, ss)

    # -- compositing -------------------------------------------------------- #

    def paste(self, other: "Canvas", x: int, y: int):
        x, y = int(x), int(y)
        ob = other.buf
        ow = other.w
        for sy in range(other.h):
            dy = y + sy
            if dy < 0 or dy >= self.h:
                continue
            for sx in range(ow):
                dx = x + sx
                if dx < 0 or dx >= self.w:
                    continue
                so = (sy * ow + sx) * 4
                a = ob[so + 3]
                if a == 0:
                    continue
                self._blend_span(dx, dx + 1, dy, (ob[so], ob[so + 1], ob[so + 2], a), 1.0)

    def downscale(self, factor: int) -> "Canvas":
        f = int(factor)
        if f <= 1:
            return self
        nw, nh = self.w // f, self.h // f
        out = Canvas(nw, nh)
        src = self.buf
        sw = self.w
        for y in range(nh):
            for x in range(nw):
                pr = pg = pb = acc_a = 0.0
                for dy in range(f):
                    row = ((y * f + dy) * sw + x * f) * 4
                    for dx in range(f):
                        o = row + dx * 4
                        a = src[o + 3] / 255.0
                        pr += src[o] * a; pg += src[o + 1] * a; pb += src[o + 2] * a
                        acc_a += a
                if acc_a <= 0:
                    continue
                o = (y * nw + x) * 4
                out.buf[o] = int(pr / acc_a)
                out.buf[o + 1] = int(pg / acc_a)
                out.buf[o + 2] = int(pb / acc_a)
                out.buf[o + 3] = int(min(255, acc_a / (f * f) * 255))
        return out

    # -- PNG ---------------------------------------------------------------- #

    def to_png(self) -> bytes:
        raw = bytearray()
        stride = self.w * 4
        for y in range(self.h):
            raw.append(0)  # filter: None
            raw += self.buf[y * stride:(y + 1) * stride]
        comp = zlib.compress(bytes(raw), 9)

        def chunk(tag: bytes, data: bytes) -> bytes:
            return (struct.pack(">I", len(data)) + tag + data
                    + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

        ihdr = struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0)
        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                + chunk(b"IDAT", comp) + chunk(b"IEND", b""))

    def save(self, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(self.to_png())
        return path


# --------------------------------------------------------------------------- #
#  Shape builders (design space 0..100 → device pixels)
# --------------------------------------------------------------------------- #

def scale_poly(poly, size, ox=0.0, oy=0.0, pad=0.0):
    """
    Map the 0..100 design space into a `size`px box, optionally inset by `pad`
    device pixels. A bad pad silently inverts the polygon (usable goes negative
    and the fill floods), so guard it loudly.
    """
    usable = size - 2 * pad
    if usable <= 0:
        raise ValueError(f"pad {pad}px leaves no drawable area in a {size}px canvas")
    k = usable / 100.0
    return [(x * k + pad + ox, y * k + pad + oy) for (x, y) in poly]


def squircle_poly(size, radius_ratio=0.2237, samples=16):
    """
    An iOS/Android-style continuous-corner square (superellipse).
    radius_ratio 0.2237 ≈ the squircle Google uses for legacy launcher icons.
    """
    r = size * radius_ratio
    pts = []

    def corner(cx, cy, a0, a1):
        for k in range(samples + 1):
            t = a0 + (a1 - a0) * k / samples
            pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))

    corner(size - r, r, -math.pi / 2, 0)
    corner(size - r, size - r, 0, math.pi / 2)
    corner(r, size - r, math.pi / 2, math.pi)
    corner(r, r, math.pi, math.pi * 1.5)
    return pts


def circle_poly(size):
    r = size / 2.0
    n = max(96, int(size))
    return [(r + r * math.cos(2 * math.pi * k / n),
             r + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def wordmark(size, stroke_ratio=0.135, tracking=0.62):
    """
    Build the SURGE wordmark as capsule strokes.
    Returns a list of polygons/points sized to fit `size` px wide.
    """
    glyph_w = 4.2
    glyph_h = 7.3
    total_w = len(WORD) * glyph_w + (len(WORD) - 1) * (tracking * glyph_w)
    k = size / total_w
    sw = glyph_h * k * stroke_ratio * 1.55
    out = []
    for gi, ch in enumerate(WORD):
        ox = gi * (glyph_w + tracking * glyph_w) * k
        for poly in GLYPHS[ch]:
            out.append([(ox + x * k, y * k) for (x, y) in poly])
    return out, sw


# --------------------------------------------------------------------------- #
#  Artwork composition
# --------------------------------------------------------------------------- #

def cheery_plate(size, shape="squircle", ss=2):
    """
    The bright plate: diagonal mint->azure gradient, a soft top-left gloss so it
    reads as lit rather than flat, and a whisper of bottom shade for weight.

    Implemented as ONE masked pass: the plate coverage is rasterised once, then
    every covered pixel is coloured analytically (ramp lookup + radial gloss +
    row shade). No per-layer canvases, no repeated coverage walks.
    """
    if shape == "squircle":
        plate = [squircle_poly(size)]
    elif shape == "circle":
        plate = [circle_poly(size)]
    else:  # 'rect' — full bleed, for adaptive background layers
        plate = [[(0, 0), (size, 0), (size, size), (0, size)]]
    probe = Canvas(size, size)
    cov, s_, bx0, by0, bw, bh = probe._coverage(plate, ss)
    c = Canvas(size, size)
    if cov is None:
        return c

    h = max(1, size - 1)
    # Diagonal ramp indexed by (x + y).
    ramp = [mix(ICON_TOP, ICON_BOT, i / (2.0 * h)) for i in range(2 * size + 1)]
    # Per-row bottom weight.
    shade = []
    for y in range(size):
        ty = y / h
        shade.append(((ty - 0.55) / 0.45) ** 1.5 if ty > 0.55 else 0.0)
    gx, gy, gr = size * 0.34, size * 0.26, size * 0.66
    inv_gr = 1.0 / gr
    buf = c.buf
    inv = 1.0 / (s_ * s_)

    for j in range(bh):
        y = by0 + j
        if y < 0 or y >= size:
            continue
        dy = y - gy
        sh = shade[y]
        row = j * s_ * (bw * s_)
        for i in range(bw):
            x = bx0 + i
            if x < 0 or x >= size:
                continue
            tot = 0
            c0 = row + i * s_
            for ddy in range(s_):
                o = c0 + ddy * (bw * s_)
                tot += sum(cov[o:o + s_])
            a = tot * inv
            if a <= 0.004:
                continue
            col = ramp[x + y]
            dx = x - gx
            g = 1.0 - math.sqrt(dx * dx + dy * dy) * inv_gr
            if g > 0:
                g = 0.20 * g * g
                col = mix(col, (255, 255, 255), g)
            if sh > 0:
                col = mix(col, (10, 22, 48), 0.12 * sh)
            o = (y * size + x) * 4
            buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]
            buf[o + 3] = int(min(1.0, a) * 255)
    return c


def draw_art(c, size, pad_ratio=15.0, ss=3, ink=(255, 255, 255)):
    """Bolt + tray, centred, with a soft ink gradient for a little depth."""
    pad = size * pad_ratio / 100.0
    bolt = scale_poly(bolt_art(), size, pad=pad)
    c.fill_gradient_polygons([bolt], (255, 255, 255), (233, 246, 255), ss)
    tray = [(x * (size - 2 * pad) / 100.0 + pad, y * (size - 2 * pad) / 100.0 + pad)
            for (x, y) in tray_pts()]
    c.stroke_polyline(tray, size * 0.062, (255, 255, 255, 255), ss)
    return c


def bolt_canvas(size, fg, bg=None, shape="none", pad_ratio=0.0, ss=3):
    """
    Render the logo at `size` px.
      shape: 'none' | 'squircle' | 'circle'  (background plate)
      pad_ratio: inset of the bolt within the canvas (0 = full bleed)
    """
    c = Canvas(size, size)
    if shape == "squircle":
        plate = [squircle_poly(size)]
        c.fill_gradient_polygons(plate, lighten(bg, 0.14), darken(bg, 0.16), ss)
    elif shape == "circle":
        plate = [circle_poly(size)]
        c.fill_gradient_polygons(plate, lighten(bg, 0.14), darken(bg, 0.16), ss)

    # pad_ratio is a PERCENTAGE of the canvas edge (20 == a 20% inset).
    pad = size * pad_ratio / 100.0
    bolt = scale_poly(BOLT, size, pad=pad)
    c.fill_gradient_polygons([bolt], lighten(fg, 0.10), darken(fg, 0.04), ss)
    return c


def notification_icon(size):
    """
    Notification small icons must be a white silhouette on full transparency —
    Android tints them, so any colour we bake in is discarded (or worse, fights
    the tint). We ship the bolt at the generous 24dp-in-48dp proportion Google
    recommends so it stays readable in the status bar.
    """
    c = Canvas(size, size)
    bolt = scale_poly(BOLT, size, pad=size * 0.14)
    c.fill_polygons([bolt], (255, 255, 255, 255), 4)
    return c


def splash_canvas(size, brand, fg, dark=False, with_word=True):
    """
    Capacitor splash. 2732² is the documented master size: it is centre-cropped
    into every aspect ratio from 4:3 phones to tablets, so all artwork must sit
    inside the middle ~55% or it gets sliced off on wide screens.
    """
    if dark:
        bg_top = darken(brand, 0.66)
        bg_bot = darken(brand, 0.84)
    else:
        bg_top, bg_bot = ICON_TOP, ICON_BOT   # bright, cheery launch
    c = Canvas(size, size)
    c.fill_gradient_polygons([[(0, 0), (size, 0), (size, size), (0, size)]], bg_top, bg_bot, ss=1)

    ink = (255, 255, 255, 255)

    # -- mark, centred slightly above the optical middle -------------------- #
    mark = size * 0.215
    mx = (size - mark) / 2.0
    my = size * 0.415 - mark / 2.0
    bolt = [(x + mx, y + my) for (x, y) in scale_poly(BOLT, mark)]
    c.fill_gradient_polygons([bolt], ink, (236, 240, 250, 255), ss=3)

    # -- wordmark under the mark -------------------------------------------- #
    if with_word:
        word_w = size * 0.245
        polys, sw = wordmark(word_w)
        xs = [pt[0] for poly in polys for pt in poly]
        off = size / 2.0 - (min(xs) + max(xs)) / 2.0
        top_y = size * 0.415 + mark / 2.0 + size * 0.052
        for poly in polys:
            shifted = [(x + off, y + top_y) for (x, y) in poly]
            c.stroke_polyline(shifted, sw, ink, 3)
    return c


def logo_svg(brand, fg):
    """Vector source of truth — handy for the store listing and the README."""
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in BOLT)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{rgba_str(lighten(brand, 0.14))}"/>
      <stop offset="1" stop-color="{rgba_str(darken(brand, 0.16))}"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{rgba_str(lighten(fg, 0.10))}"/>
      <stop offset="1" stop-color="{rgba_str(darken(fg, 0.04))}"/>
    </linearGradient>
  </defs>
  <rect width="108" height="108" fill="url(#bg)"/>
  <!-- 66dp safe zone: 21..87. The bolt is drawn in the 100-unit design space
       and mapped into that box, so no launcher mask can clip it. -->
  <g transform="translate(21 21) scale(0.66)">
    <polygon points="{pts}" fill="url(#fg)"/>
  </g>
</svg>
'''


# --------------------------------------------------------------------------- #
#  Theme resolution (mirrors tools/themes.mjs; kept tiny and dependency-free)
# --------------------------------------------------------------------------- #

# primary / secondary / accent seeds, verbatim from app-theme.txt
SEEDS = {
    "classic-corporate": ("#1E2761", "#408EC6", "#408EC6"),
    "energetic-retail": ("#2C3E50", "#E67E22", "#E67E22"),
    "eco-organic": ("#2C5F2D", "#97BC62", "#97BC62"),
    "cyber-contrast": ("#1A1A1A", "#C1DD13", "#C1DD13"),
    "minimal-editorial": ("#CC313D", "#F7C5CC", "#F7C5CC"),
    "high-end-trio": ("#1E2761", "#408EC6", "#7A2048"),
    "bright-tech": ("#2D3047", "#2EC4B6", "#FF7A59"),
    "playful-pastel": ("#B298E7", "#B8E3E9", "#F5B8D5"),
    "earthy-muted": ("#4A5842", "#EFEBE4", "#D98A6C"),
}


def pick_fg(brand):
    """Highest-contrast neutral for the bolt on this brand colour."""
    def lum(c):
        f = lambda v: (v / 255 / 12.92) if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])

    def ratio(a, b):
        la, lb = lum(a), lum(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

    white, black = (255, 255, 255), (18, 19, 23)
    return white if ratio(brand, white) >= ratio(brand, black) else black


# --------------------------------------------------------------------------- #
#  Output
# --------------------------------------------------------------------------- #

def write(path, canvas_or_bytes):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = canvas_or_bytes if isinstance(canvas_or_bytes, bytes) else canvas_or_bytes.to_png()
    with open(path, "wb") as fh:
        fh.write(data)
    return len(data)


def rel(p):
    return os.path.relpath(p, ROOT)


def main():
    ap = argparse.ArgumentParser(description="Generate Surge icons, splash screens and Android mipmaps.")
    ap.add_argument("--theme", default="bright-tech", choices=sorted(SEEDS), help="brand palette id")
    ap.add_argument("--mode", default="dark", choices=["light", "dark"], help="splash variant to feature")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    primary, secondary, accent = (hex_to_rgb(x) for x in SEEDS[args.theme])
    brand = primary
    fg = pick_fg(brand)
    log = (lambda *a: None) if args.quiet else (lambda *a: print(*a))

    res = os.path.join(ROOT, "resources")
    android_res = os.path.join(ROOT, "android/app/src/main/res")
    total = 0
    files = 0

    def emit(path, canvas):
        nonlocal total, files
        total += write(path, canvas)
        files += 1
        log(f"  {rel(path):<62} {canvas.w}x{canvas.h}")

    log(f"Surge artwork · theme={args.theme} · brand={rgba_str(brand)} · mark={rgba_str(fg)}")
    log("-" * 78)

    # ---- master artwork (Capacitor `resources/`) -------------------------- #
    log("resources/")
    _ic = cheery_plate(1024, "squircle"); draw_art(_ic, 1024, 12.5, 2); emit(f"{res}/icon-only.png", _ic)
    _fg = Canvas(1024, 1024); draw_art(_fg, 1024, 19.0, 2); emit(f"{res}/icon-foreground.png", _fg)
    emit(f"{res}/icon-background.png", cheery_plate(1024, "rect"))
    _mono = Canvas(1024, 1024); draw_art(_mono, 1024, 19.0, 2, ink=(255, 255, 255)); emit(f"{res}/icon-monochrome.png", _mono)
    emit(f"{res}/splash.png", splash_canvas(1440, brand, fg, dark=False))
    emit(f"{res}/splash-dark.png", splash_canvas(1440, brand, fg, dark=True))
    emit(f"{res}/splash-light.png", splash_canvas(1440, brand, fg, dark=False))
    write(f"{res}/logo.svg", logo_svg(brand, fg).encode())
    log(f"  {rel(res + '/logo.svg')}")

    # ---- adaptive icon layers, per density -------------------------------- #
    # Canvas is 108dp; the bolt occupies the central 66dp so no launcher mask
    # (circle, squircle, teardrop — they all differ) can clip the artwork.
    log("\nandroid/app/src/main/res/mipmap-*/")
    for name, mul in DENSITIES.items():
        size = int(round(ADAPTIVE_DP * mul))
        dpi = f"mipmap-{name}dpi"
        d = os.path.join(android_res, dpi)
        ss = 3 if mul <= 2 else 2
        # legacy launcher icons: bright plate + bolt/tray art
        ic = cheery_plate(size, "squircle", ss); draw_art(ic, size, 12.5, ss)
        emit(os.path.join(d, "ic_launcher.png"), ic)
        icr = cheery_plate(size, "circle", ss); draw_art(icr, size, 15.0, ss)
        emit(os.path.join(d, "ic_launcher_round.png"), icr)
        # adaptive layers: 108dp canvas, art inside the 66dp safe zone
        pad = (ADAPTIVE_DP - ADAPTIVE_SAFE_DP) / 2 / ADAPTIVE_DP * 100  # 19.44 in design units
        fg_c = Canvas(size, size); draw_art(fg_c, size, pad, ss)
        emit(os.path.join(d, "ic_launcher_foreground.png"), fg_c)
        emit(os.path.join(d, "ic_launcher_background.png"), cheery_plate(size, "rect", 1))
        mono_c = Canvas(size, size); draw_art(mono_c, size, pad, ss)
        emit(os.path.join(d, "ic_launcher_monochrome.png"), mono_c)

    # ---- notification small icons ----------------------------------------- #
    log("\nandroid/app/src/main/res/drawable-*/  (notification small icons)")
    for name, mul in DENSITIES.items():
        size = int(round(24 * mul))
        nc = Canvas(size, size)
        draw_art(nc, size, 14.0, 4, ink=(255, 255, 255))
        emit(os.path.join(android_res, f"drawable-{name}dpi", "ic_stat_surge.png"), nc)

    # ---- Capacitor splash -------------------------------------------------- #
    # Splash must be a full-bleed 2732² master; Capacitor scales it to fit.
    log("\nandroid/app/src/main/res/drawable*/  (splash)")
    # One 2732 master is enough: the artwork is square and centred, so the same
    # PNG centre-crops correctly in both orientations. Rendering it once saves
    # ~30s of pure-Python rasterisation per build.
    # 1600^2 is comfortably sharp on any phone splash while keeping the decoded
    # bitmap around 10MB instead of the ~30MB a 2732^2 master costs. The 2732
    # master stays in resources/ for iOS / store artwork only.
    big = splash_canvas(1600, brand, fg, dark=False).to_png()
    for orient in ("drawable-land-xxhdpi", "drawable-port-xxhdpi", "drawable-xxhdpi"):
        total += write(os.path.join(android_res, orient, "splash.png"), big)
        files += 1
        log(f"  {rel(os.path.join(android_res, orient, 'splash.png')):<62} 1600x1600")
    emit(os.path.join(android_res, "drawable", "splash.png"),
         splash_canvas(1080, brand, fg, dark=False))

    # ---- widget preview ---------------------------------------------------- #
    log("\nandroid/app/src/main/res/drawable/  (widget preview)")
    _wp = cheery_plate(320, "squircle", 3); draw_art(_wp, 320, 12.5, 3)
    emit(os.path.join(android_res, "drawable-nodpi", "widget_preview.png"), _wp)

    # ---- XML that references the layers ------------------------------------ #
    anydpi = os.path.join(android_res, "mipmap-anydpi-v26")
    for fname in ("ic_launcher.xml", "ic_launcher_round.xml"):
        xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
'''
        write(os.path.join(anydpi, fname), xml.encode())
    log(f"  {rel(anydpi)}/ic_launcher.xml, ic_launcher_round.xml")

    write(os.path.join(android_res, "values", "ic_launcher_background.xml"),
          f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">{rgba_str(brand)}</color>
</resources>
'''.encode())

    write(os.path.join(android_res, "values", "colors.xml"),
          f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="brand_primary">{rgba_str(primary)}</color>
    <color name="brand_secondary">{rgba_str(secondary)}</color>
    <color name="brand_accent">{rgba_str(accent)}</color>
    <color name="splash_background">{rgba_str(mix(ICON_TOP, ICON_BOT, 0.5))}</color>
    <color name="widget_background">#1B1C22</color>
    <color name="notification_accent">{rgba_str(secondary)}</color>
</resources>
'''.encode())
    log("  res/values/colors.xml, res/values/ic_launcher_background.xml")

    log("-" * 78)
    log(f"{files} PNGs written · {total / 1024:.0f} KB total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
