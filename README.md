# Surge ⚡ — Android download manager

A power-user download manager for Android: **YouTube, Instagram, torrents, magnets,
plain HTTP/FTP and MP3 conversion** in one queue. Vue 3 + Vite + Capacitor on the
front; a bundled **aria2 / yt-dlp / ffmpeg** toolchain (arm64 only) underneath.

Replaces IDM+/1DM-class apps with a modern, token-driven Material 3 UI.

---

## Open the design first

```
mockup/surge-mockup.html        ← 14 phone screens, palette gallery, icon set
```

Open it in any browser (no network needed). Every frame is rendered with the
**same** `src/styles/themes.css` + `components.css` the app ships, so it is a
faithful preview, not a drawing. Regenerate with `npm run mockup`.

---

## Requirements

| Tool     | Version | Why                                                     |
| -------- | ------- | ------------------------------------------------------- |
| JDK      | **21**  | per spec; AGP 8.13 runs on it and targets `compileSdk 36` |
| Node     | ≥ 20    | Vite 6                                                    |
| Android SDK | 36   | compileSdk/targetSdk 36 (Capacitor 8 baseline)             |
| Python   | 3.11    | only for `tools/gen-icons.py` (asset generation)          |

> **Android SDK Platform 36 is required.** Capacitor 8 is an API 36 stack, and
> the androidx libraries it pulls in (`androidx.browser:1.9.0`,
> `androidx.core:1.17.0`) publish AAR metadata that refuses to build unless the
> consumer compiles against API 36 — a project still on 35 dies at
> `:app:checkDebugAarMetadata`. Install **SDK Platform 36** in the SDK Manager.
>
> `android/` is **generated, not tracked** (see `.gitignore`). `npm install`
> runs `tools/android-overlay.mjs` as a postinstall step, and `npm run
> android:prep` does the same on demand: it pins `compileSdkVersion`/
> `targetSdkVersion` (36), the Android Gradle Plugin (8.13), the **Kotlin and
> Chaquopy plugin classpaths**, the Gradle wrapper (8.14.3) and
> `capacitor.settings.gradle` in that folder. `npm run android:check` fails if
> any of it drifts.

No TypeScript anywhere. Plain JavaScript + Vue SFCs.

## Setup

```bash
bun install             # or npm install
bun run cap:sync        # cap sync android + android-overlay (see below)
bun run tokens          # regenerate src/styles/themes.css from tools/themes.mjs
npm run dev             # browser preview with a live simulated engine
bun run build && bun run cap:sync
bun run android:run     # or: cd android && ./gradlew :app:assembleDebug
```

### Icon art direction

Bright mint-teal → azure diagonal gradient, soft top-left gloss, a whisper of
bottom shade for weight, and a white bolt over a rounded tray — cheery and
inviting at a glance, but the tray keeps it literal: this is a *downloader*.
Judged at 192/128/96/64/48 px on light and dark wallpapers in
`resources/icon-contact-sheet.png`.

Regenerate all artwork (launcher icons, adaptive layers, notification icons,
splash, widget preview, contact sheet):

```bash
npm run icons                      # default palette: bright-tech / dark
python3 tools/gen-icons.py --theme cyber-contrast --mode light
```

## Verification gates (all offline, no network)

```bash
npm run tokens:check    # 468 WCAG contrast checks across 18 palette×mode sets
npm run css:check       # every var(--s-*) used is actually defined
npm run android:check   # compileSdk/targetSdk 36 + AGP pin + overlay normalisation
npm run stores:check    # constructs every Pinia store; 31 runtime assertions
node tools/verify-mockup.mjs --strict   # tag balance, class coverage, sprite refs
node tools/verify-js.mjs --strict       # syntax, imports, templates, icons,
                                        #   + WebView-compat gate (no Chrome 92+
                                        #   APIs in the boot path, color-mix and
                                        #   backdrop-filter always have fallbacks)
node tools/verify-classify.mjs --strict # JS <-> Kotlin category tables agree
```

---

## Architecture

```
┌──────────────────────────── WebView (Vue 3, JS) ────────────────────────────┐
│ views/  components/  stores/  composables/                                  │
│   └─ src/lib/native.js   ← the ONLY place Capacitor is imported             │
│        · live reactive download table                                       │
│        · web Mock engine (same event shapes) so `npm run dev` is faithful   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ Capacitor bridge (6 Kotlin plugins)
┌──────────────────────────────────┴──────────────────────────────────────────┐
│ Kotlin                                                                      │
│  service/DownloadService   foreground, type=dataSync, wake-lock discipline  │
│  core/HttpEngine           16-way segmented OkHttp downloader (pure Kotlin)  │
│  core/TorrentEngine        libtorrent4j (arm64 JNI from Maven)               │
│  core/Pipelines            YtDlp (Chaquopy CPython) + Ffmpeg (ffmpeg-kit)    │
│  core/MediaStoreSink       MediaStore insert (29+) / MediaScanner (≤28) /SAF │
│  widget/SurgeWidget        4×2 RemoteViews, live speed + pause/quick-add     │
│  receiver/Receivers        boot re-arm (WorkManager), notification actions   │
│  service/SnifferActivity   real WebView that reports downloadable responses  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why the native binaries are renamed `lib*.so`

Since Android 10 the app *data* dir is mounted `noexec`, so you cannot `exec()`
a file you unpacked into `filesDir`. Shipping the executable as a JNI library in
`jniLibs/arm64-v8a/` makes the package manager extract it into
`nativeLibraryDir`, which *is* executable — no root, no runtime download.
Combined with `abiFilters 'arm64-v8a'` + `useLegacyPackaging = true`
(see `android/app/build.gradle`) this satisfies "bundle the one for arm64".

### Theming

`tools/themes.mjs` holds the nine palettes from your brief (5 dual 80/20 +
4 triple 60/30/10) and expands each into a full Material-3-style token set for
**both light and dark** via an OKLCH tonal-palette engine (`tools/color.mjs`).
`tools/gen-css.mjs` emits `src/styles/themes.css` (18 palettes, ~8 KB gzipped).
Runtime switching is a class swap; Material You overwrites the three seed roles
with wallpaper-derived colours. `npm run tokens:check` fails CI if any
palette/mode pairing drops below WCAG AA.

---

## Feature map

| Area | Where |
| --- | --- |
| Multi-segment HTTP/FTP/SFTP, resume, mirrors | `Aria2Daemon` (`--split=16`) |
| BitTorrent + magnet, file select, seeds/peers, ratio limit | `Aria2Daemon`, `TorrentView`, `TorrentPlugin` |
| YouTube / Instagram / 1800+ extractors, quality picker 240p→2160p | `YtDlp` + `MediaPickerView` |
| Video → MP3 (128/192/256/320), muxing, tag + cover embedding | `Ffmpeg`, `MediaPlugin.convertToMp3` |
| Foreground service survives app close; pause/stop from shade | `DownloadService` |
| Granular notification channels (ongoing / done / error) | `DownloadService.createChannels` |
| 4×2 home widget with live speed | `SurgeWidget` |
| Magnet tap, .torrent open, share-sheet "Download with Surge" | `AndroidManifest` intent-filters → `MainActivity.route` |
| Scheduler survives reboot (night batch, Wi-Fi only) | `BootReceiver` + WorkManager |
| Files appear in Gallery/Music; custom folders via SAF | `MediaStoreSink` |
| Browser tab with download sniffer | `SnifferActivity` + `SniffBus` |
| 9 palettes × light/dark + Material You | `stores/theme.js`, `ThemesView` |
| Content always sits between the system bars (never under the status bar / notification shade, never under the gesture pill); keyboard-aware sheets | `plugins/SafeAreaPlugin.kt` → `composables/useSafeArea.js` → `--sat/--sab/--sal/--sar/--sak` |
| No horizontal overflow from hostile strings (URLs, torrent names, tags) | `base.css` overflow guards |
| **1DM-style auto-filing**: root folder + `videos/ music/ photos/ documents/ compressed/ programs/ subtitles/ torrents/ general/ others/`, filed at add-time | `src/lib/classify.js` + `core/Classifier.kt` (kept in sync by `verify-classify.mjs`), `MediaStoreSink`, `SettingsView` → *Storage & auto-filing* |

## Repo layout

```
tools/            design-token engine, icon sprite, asset + CSS generators, audits
mockup/           build-mockup.mjs → surge-mockup.html (the design preview)
src/              Vue app (views, components, stores, lib, styles)
android/          App shell ONLY (stock MainActivity + manifest). Regenerable:
                  `cap add android` can never destroy custom code again.
plugins/surge-native/   LOCAL CAPACITOR PLUGIN: all Kotlin (aria2/yt-dlp/ffmpeg/
                  widget/receivers/safe-area), all res (icons, splash, themes,
                  widget layout), Chaquopy python, jniLibs/arm64-v8a.
                  Auto-registered via @CapacitorPlugin annotations.
resources/        master artwork + logo.svg (Capacitor source assets)
uploads/          your app-theme.txt (the palette brief)
```

## Why you should never need `cap add android` again

All custom Kotlin + resources live in **`plugins/surge-native/`**, a local
Capacitor plugin (a `file:` dependency). `cap sync` adds it to
`capacitor.settings.gradle` and writes it into `assets/capacitor.plugins.json`,
and the **stock** `BridgeActivity` auto-registers every `@CapacitorPlugin` —
there is no manual `registerPlugin()` left to lose. `android/` is now just the
app shell, so regenerating it is harmless.

If you *do* regenerate the platform for any reason:

```bash
bunx cap add android && bun run android:prep   # or just: bun run cap:add:android
```

`tools/android-overlay.mjs` then deletes the stock resources that would
otherwise override the plugin's (Capacitor icon, stock splash, purple
`styles.xml`, stock `file_paths.xml`) and re-asserts arm64-only + JDK 21 in
`app/build.gradle`. App-module resources beat library resources, so without
this step you would silently ship the template's icon and theme.

## Known scope notes

- There are **no manual binary steps left**: every native dependency resolves
  from Maven/PyPI during the Gradle build. `plugins/surge-native/.../jniLibs/`
  exists only as a documented escape hatch for custom builds.
- The Play-Store "downloading code at runtime" policy is why yt-dlp ships
  *inside* the APK via Chaquopy rather than being fetched on first run.

---

## If Android shows a black / blank screen

Launch failures are almost always one of these five. Work top-down:

```bash
adb logcat -s Capacitor CapacitorConsole AndroidRuntime chromium System.out
# or, in a debug build, inspect the WebView directly:
#   Chrome → chrome://inspect → your device → Surge
```

| # | Symptom | Cause | Fix (already applied in this repo) |
| - | ------- | ----- | ---------------------------------- |
| 1 | Hangs on splash, cold install | Chaquopy extracted ~40 MB of CPython inside `Plugin.load()` (bridge-init path) | `YtDlp.init` moved to first media use; `load()` only builds the aria2 handle |
| 2 | Hangs on splash | `SplashScreen.layoutName` pointed at a layout that didn't exist | key removed; splash is the drawable + auto-hide + first-paint hide |
| 3 | Hangs on splash | Splash hidden only after engine RPC answered | auto-hide 900 ms cap, hide on first painted frame, RPC connect-timeout 600 ms |
| 4 | Blank white/black, nothing in logcat | Bundle never ran (old WebView, stale chunks) | `nomodule` message + 4 s watchdog + `unhandledrejection` capture, all printing a readable card |
| 5 | Blank after boot flag | Route chunk 404 (stale install after an update) | `router.onError` surfaces the message instead of an empty shell |
| 6 | Crash at first window | `windowBackground` = multi-MB splash PNG | solid colour; Android splash masters ≤1600² |
| 7 | Queue never moves, no error | Network-security config blocked cleartext to `127.0.0.1`, so every aria2 RPC threw | loopback `domain-config` with cleartext permitted |
| 8 | Crash on widget tap / boot restore | Android 12+ forbids foreground-service start from background | `start()` catches and degrades to `startService` |
| 9 | Build fails, stale APK runs | Fabricated `yt-dlp==2026.10.15` pin; Capacitor includes in wrong Gradle file; missing palette dep | real pin `2024.11.18`; includes in `settings.gradle`; `palette-ktx` added |
| 10 | UI under status bar / gesture pill | WebView reports `env(safe-area-inset-*)` as 0 | `SafeAreaPlugin` → `--sat/--sab/--sal/--sar/--sak` |

### Rebuild checklist (do these in order)

```bash
npm install                 # Capacitor + plugins must exist before sync
npm run build               # produces dist/
npx cap sync android        # copies dist/ into android/app/src/main/assets
# drop your prebuilt arm64 binaries in:
#   android/app/src/main/jniLibs/arm64-v8a/libaria2c.so
#   android/app/src/main/jniLibs/arm64-v8a/libffmpeg.so
#   android/app/src/main/jniLibs/arm64-v8a/libffprobe.so
bun run android:prep        # wrapper + SDK 36 + AGP 8.13 + capacitor.settings.gradle
cd android && ./gradlew clean :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat -s SurgeBoot Capacitor CapacitorConsole AndroidRuntime chromium
```

`SurgeBoot` lines tell you how far startup got: `MainActivity.onCreate` →
`bridge activity created` → `DownloadService.onCreate` → `DownloadService ready`.
If it stops between two of those, that gap is your bug. Gradle will happily run a
stale APK whose WebView code no longer matches the Kotlin plugins — always clean.

### `bash: ./gradlew: No such file or directory`

`cap sync android` **never** creates the Gradle wrapper — only `cap add android`
does — so a folder provisioned by a bare sync has no `./gradlew`:

```bash
npm run build
bunx cap sync android          # copies web assets + plugins; leaves no wrapper
cd android && ./gradlew assembleDebug
# bash: ./gradlew: No such file or directory
```

Run the overlay, which unpacks the wrapper (Gradle 8.14.3 — the version the
pinned AGP 8.13 needs) straight out of the Capacitor CLI template that is already
in `node_modules`, and upgrades a too-old wrapper if one is already there:

```bash
npm run android:prep           # or: bun run cap:sync, which runs it for you
cd android && ./gradlew clean :app:assembleDebug
```

`android:build`, `android:bundle` and `android:run` run the overlay themselves, so
the repo's own commands can never hit this.

### `Plugin with id 'kotlin-android' not found`

```
A problem occurred evaluating project ':surge-native'.
> Plugin with id 'kotlin-android' not found
```

…usually followed by a bogus `project ':surge-native' does not specify 'compileSdk'`.
That second message is a **consequence, not a second bug**: evaluation aborts at the
plugin line, so the `android { compileSdk 36 }` block below it never runs.

Kotlin and Chaquopy are *not* on the Capacitor template's buildscript classpath
(the template only declares AGP + google-services), and this repo's modules apply
both. The overlay adds them to the generated `android/build.gradle`:

```bash
npm install            # postinstall runs the overlay automatically
# or explicitly:
npm run android:prep
```

`android/` is generated and git-ignored, so **pulling source alone never changes
it** — the prep step is what rewrites the folder. If it is still missing after
that, the plugin module now fails with that exact instruction instead of Gradle's
cryptic one.
