"""
Surge <-> yt-dlp bridge.

Kept deliberately tiny and JSON-in/JSON-out: Kotlin calls these three functions
and never touches yt_dlp objects directly, which keeps the Chaquopy boundary
stable across yt-dlp releases (their internal APIs churn; the public opts dict
does not).
"""

import json
import os

import yt_dlp

# Resolutions the product promises, in order. Anything else yt-dlp reports is
# dropped so the picker never shows a format the UI can't label.
ALLOWED = ["240p", "360p", "480p", "720p", "1080p", "1440p", "2160p"]

_HEIGHT_TO_LABEL = {
    240: "240p", 360: "360p", 480: "480p", 720: "720p",
    1080: "1080p", 1440: "1440p", 2160: "2160p",
}


def _base_opts():
    return {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": 20,
        "retries": 3,
        # Do not let yt-dlp write .part/.ytdl junk outside our dir.
        "restrictfilenames": False,
        "windowsfilenames": False,
    }


def probe(url):
    """Return the metadata + format table the Vue picker renders."""
    opts = _base_opts()
    opts["skip_download"] = True
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    formats = []
    seen = set()
    for f in info.get("formats", []):
        h = f.get("height")
        if not h:
            continue
        label = _HEIGHT_TO_LABEL.get(int(h))
        if not label or label in seen:
            continue
        # Prefer progressive mp4; fall back to the split-stream variant.
        seen.add(label)
        formats.append({
            "res": label,
            "codec": (f.get("ext") or "mp4"),
            "fps": f.get("fps") or 30,
            "size": f.get("filesize") or f.get("filesize_approx") or 0,
            "tag": {"720p": "HD", "1080p": "FHD", "1440p": "2K", "2160p": "4K"}.get(label),
            "format_id": f.get("format_id"),
        })
    formats.sort(key=lambda x: int(x["res"][:-1]))

    return json.dumps({
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration") or 0,
        "thumbnail": info.get("thumbnail"),
        "view_count": info.get("view_count") or 0,
        "formats": formats,
        "subtitles": list((info.get("subtitles") or {}).keys())[:8],
        "auto_captions": list((info.get("automatic_captions") or {}).keys())[:8],
        "playlist_count": (info.get("playlist_count") or 0),
    })


def download(url, format_spec, out_dir, template, subtitles_csv):
    """Download one video at an explicit resolution, muxing if required."""
    opts = _base_opts()
    height = format_spec.rstrip("p")
    # bv*[height=H]+ba picks the best video at H plus best audio; yt-dlp muxes.
    opts["format"] = f"bv*[height<={height}][ext=mp4]+ba[ext=m4a]/b[height<={height}]/b"
    opts["outtmpl"] = os.path.join(out_dir, template)
    opts["merge_output_format"] = "mp4"
    subs = [s for s in subtitles_csv.split(",") if s]
    if subs:
        opts["writesubtitles"] = True
        opts["writeautomaticsub"] = True
        opts["subtitleslangs"] = subs
        opts["subtitlesformat"] = "srt/best"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    return ydl.prepare_filename(info) if False else _final(out_dir, info, "mp4")


def extract_audio(url, out_dir, kbps="320"):
    """Audio-only, straight to MP3 at an exact CBR bitrate."""
    opts = _base_opts()
    opts["format"] = "bestaudio/best"
    opts["outtmpl"] = os.path.join(out_dir, "%(title)s.%(ext)s")
    opts["postprocessors"] = [{
        "key": "FFmpegExtractAudio",
        "preferredcodec": "mp3",
        "preferredquality": kbps,
    }, {
        "key": "FFmpegEmbedThumbnail",
    }, {
        "key": "EmbedThumbnail",
    }]
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    return _final(out_dir, info, "mp3")


def _final(out_dir, info, ext):
    """yt-dlp's prepare_filename lies about the post-processed extension."""
    title = info.get("title") or info.get("id") or "video"
    cand = os.path.join(out_dir, f"{title}.{ext}")
    if os.path.exists(cand):
        return cand
    # Fall back to newest matching file in the dir.
    hits = [os.path.join(out_dir, f) for f in os.listdir(out_dir) if f.endswith("." + ext)]
    return max(hits, key=os.path.getmtime) if hits else None
