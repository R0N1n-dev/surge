# Surge ⚡ — Android download manager

A power-user download manager for Android: **YouTube, Instagram, torrents, magnets,
plain HTTP/FTP and MP3 conversion** in one queue. Vue 3 + Vite + Capacitor on the
front; a bundled **aria2 / yt-dlp / ffmpeg** toolchain (arm64 only) underneath.

Replaces IDM+/1DM-class apps with a modern, token-driven Material 3 UI.

---

## Quick start (bun)

```bash
bun install           # deps (postinstall reconciles android/ if it exists)
bun run build         # production bundle → dist/
bun run android:prep  # creates android/ if missing, then pins SDK 36 / AGP / classpaths
bun run android:build # prepare + ./gradlew clean :app:assembleDebug
```

Stuck? `bun run android:check` audits the generated `android/` folder and prints the exact
command that fixes whatever is missing. Details: [Building the Android app](#building-the-android-app-step-by-step).

Want to see the UI without building? Open **`mockup/surge-mockup.html`** in any
browser (no network needed). It renders every screen from the same
`themes.css` + `components.css` the app ships, so it is a faithful preview rather
than a drawing. Regenerate with `bun run mockup`.

---

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| **bun** | ≥ 1.4 | package manager + script runner; this is the supported path |
| JDK | **21** | AGP 8.13 targets `compileSdk 36` |
| Android SDK Platform | **36** | Capacitor 8's androidx AARs refuse to build against 35 |
| Python | **3.10** | Chaquopy runs `pip` during the build (its `buildPython` must match `version`) and `tools/gen-icons.py` needs it |

> **SDK Platform 36 is mandatory.** `androidx.browser:1.9.0` and
> `androidx.core:1.17.0` publish AAR metadata that requires API 36; on 35 the
> build dies at `:app:checkDebugAarMetadata`. Install it with
> `sdkmanager "platforms;android-36"` (or SDK Manager → SDK Platforms).

No TypeScript anywhere. Plain JavaScript + Vue SFCs.

## Everyday commands

| Command | What it does |
| --- | --- |
| `bun install` | Install deps; postinstall reconciles `android/` |
| `bun run dev` | Vite dev server with a simulated download engine |
| `bun run build` | Production bundle into `dist/` |
| `bun run verify` | Every gate: tokens, CSS, JS, Android toolchain, stores |
| `bun run android:check` | Audits the **generated** `android/` folder and names the fix |
| `bun run android:prep` | **Create `android/` if missing**, then pin SDK 36 / AGP 8.13 / classpaths / wrapper |
| `bun run cap:add:android` | Alias of `android:prep` (kept for muscle memory) |
| `bun run cap:sync` | `cap sync android` + overlay |
| `bun run android:build` | Overlay + debug APK |
| `bun run android:run` | Overlay + `cap run android` |
| `bun run android:bundle` | Overlay + release AAB |
| `bun run tokens` | Regenerate `src/styles/themes.css` from `tools/themes.mjs` |
| `bun run mockup` | Regenerate the design mockup, then verify it |
| `bun run icons` | Regenerate launcher / splash / notification artwork |

> **Why `android:prep` exists.** `android/` is **generated and git-ignored**
> (`.gitignore`), so pulling source never changes it. `bun install` runs
> `tools/android-overlay.mjs` as a postinstall step, and `bun run android:prep`
> runs it on demand. It pins `compileSdkVersion`/`targetSdkVersion` **36**, AGP
> **8.13**, the **Kotlin + Chaquopy plugin classpaths**, the Gradle wrapper
> **8.14.3** and `capacitor.settings.gradle`, and points `:surge-native` at the
> tracked source instead of `node_modules`. `bun run android:check` fails if any
> of that drifts.

### Icon art direction

Bright mint-teal → azure diagonal gradient, soft top-left gloss, a whisper of
bottom shade for weight, and a white bolt over a rounded tray — cheery and
inviting at a glance, but the tray keeps it literal: this is a *downloader*.
Judged at 192/128/96/64/48 px on light and dark wallpapers in
`resources/icon-contact-sheet.png`.

Regenerate all artwork (launcher icons, adaptive layers, notification icons,
splash, widget preview, contact sheet):

```bash
bun run icons                      # default palette: bright-tech / dark
python3 tools/gen-icons.py --theme cyber-contrast --mode light
```

## Verification gates (all offline)

One command runs everything CI runs:

```bash
bun run verify
```

…which is exactly:

```bash
bun run tokens:check    # 468 WCAG contrast checks across 18 palette×mode sets
bun run css:check       # every var(--s-*) used is actually defined
bun run android:check   # SDK 36 / AGP / classpaths + your generated android/ folder
bun run stores:check    # constructs all 4 Pinia stores; 31 runtime assertions
node tools/verify-js.mjs --strict        # syntax, imports, templates, icons,
                                         #   bridge calls, Pinia `.value` misuse,
                                         #   WebView-compat (no Chrome 92+ APIs in
                                         #   the boot path; color-mix and
                                         #   backdrop-filter always fall back)
node tools/verify-classify.mjs --strict  # JS ↔ Kotlin category tables agree
node tools/verify-mockup.mjs --strict    # tag balance, class coverage, sprite refs
```

Plus the real compile gate:

```bash
bun run build            # vite build → dist/ — must pass before any APK
```

---

## Architecture

```
┌──────────────────────────── WebView (Vue 3, JS) ────────────────────────────┐
│ views/  components/  stores/  composables/                                  │
│   └─ src/lib/native.js   ← the ONLY place Capacitor is imported             │
│        · live reactive download table                                       │
│        · web Mock engine (same event shapes) so `bun run dev` is faithful   │
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
with wallpaper-derived colours. `bun run tokens:check` fails CI if any
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

## How the `android/` folder is managed

`android/` is **generated, never committed** (`.gitignore`). It is produced by
`cap add android` from the Capacitor CLI template already in `node_modules`, then
reconciled by `tools/android-overlay.mjs`.

All custom Kotlin + resources live in **`plugins/surge-native/`**, a local Capacitor
plugin (a `file:` dependency), so regenerating the platform is harmless: `cap sync` adds
it to `capacitor.settings.gradle` + `assets/capacitor.plugins.json`, the **stock**
`BridgeActivity` auto-registers every `@CapacitorPlugin`, and the overlay points
`:surge-native` at that tracked source instead of the installed copy.

Create or repair it with one command — it runs `cap add android` when the folder is
missing and then reconciles everything:

```bash
bun run android:prep
```

`tools/android-overlay.mjs` then deletes the stock resources that would
otherwise override the plugin's (Capacitor icon, stock splash, purple
`styles.xml`, stock `file_paths.xml`) and re-asserts SDK 36, AGP 8.13, the
Kotlin/Chaquopy plugin classpaths, the Gradle wrapper, arm64-only + JDK 21.
App-module resources beat library resources, so without this step you would
silently ship the template's icon and theme.

## Known scope notes

- There are **no manual binary steps left**: every native dependency resolves
  from Maven/PyPI during the Gradle build. `plugins/surge-native/.../jniLibs/`
  exists only as a documented escape hatch for custom builds.
- The Play-Store "downloading code at runtime" policy is why yt-dlp ships
  *inside* the APK via Chaquopy rather than being fetched on first run.

---

## Building the Android app (step by step)

Prerequisites: **JDK 21** and **Android SDK Platform 36**
(`sdkmanager "platforms;android-36"`).

```bash
# 1. dependencies — postinstall also reconciles android/
bun install

# 2. web bundle → dist/
bun run build

# 3. create android/ if missing + reconcile SDK/AGP/plugins/wrapper
bun run android:prep

# 4. copy dist/ into the platform and re-apply the overlay
bun run cap:sync

# 5. sanity check — expect no output
bun run android:check

# 6. build the debug APK (overlay + gradle in one command)
bun run android:build

# 7. install and watch startup
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -s SurgeBoot Capacitor CapacitorConsole AndroidRuntime chromium
```

`bun run android:build` is shorthand for:

```bash
bun run android:prep
cd android && ./gradlew clean :app:assembleDebug
```

> **Always `clean` after changing SDK / AGP / plugins.** Gradle will happily install a
> stale APK whose WebView code no longer matches the Kotlin plugins.

`SurgeBoot` lines tell you how far startup got: `MainActivity.onCreate` →
`bridge activity created` → `DownloadService.onCreate` → `DownloadService ready`.
If it stops between two of those, that gap is your bug.

Prefer Android Studio? `bun run android:prep && bun run android:open`, then press Run.
Release bundle: `bun run android:bundle` → `android/app/build/outputs/bundle/release/`.

---

## Troubleshooting

### App starts, but the screen is black / blank

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

### `bash: ./gradlew: No such file or directory`

`cap sync android` **never** creates the Gradle wrapper — only `cap add android`
does — so a folder provisioned by a bare sync has no `./gradlew`:

```bash
bun run build
bun run cap:sync                # copies web assets + plugins; leaves no wrapper
cd android && ./gradlew assembleDebug
# bash: ./gradlew: No such file or directory
```

Run the overlay, which unpacks the wrapper (Gradle 8.14.3 — the version the
pinned AGP 8.13 needs) straight out of the Capacitor CLI template that is already
in `node_modules`, and upgrades a too-old wrapper if one is already there:

```bash
bun run android:prep           # or: bun run cap:sync, which runs it for you
cd android && ./gradlew clean :app:assembleDebug
```

`android:build`, `android:bundle` and `android:run` run the overlay themselves, so
the repo's own commands can never hit this.

### Checking your checkout (do this first when something "still fails")

`android/` is **generated**, so pulling source never changes it — and if Gradle is pointed
at a stale copy of the plugin, it will keep reporting the same error however many times you
pull. Two commands tell you the truth:

```bash
git log -1 --oneline     # must be the commit that contains the fix
bun run android:check    # audits the GENERATED project and names what to run
```

`android:check` prints lines like these instead of making you guess:

```
android/build.gradle is missing org.jetbrains.kotlin:kotlin-gradle-plugin — run: bun run android:prep
android/app/build.gradle is not on compileSdk 36 — run: bun run android:prep
:surge-native is wired to a node_modules copy — run: bun run android:prep so Gradle builds the tracked source
android/gradlew is missing — run: bun run android:prep
```

Then:

```bash
bun install                 # postinstall runs the overlay
cd android && ./gradlew clean :app:assembleDebug
```

Fresh machine, nothing built yet? `bun install` printing
`android/ platform not created yet — nothing to reconcile.` is **normal** — the folder has
not been generated yet. `bun run android:prep` creates it.

`bun run android:prep` also wires `:surge-native` to **`plugins/surge-native/android`**
(the tracked source) rather than `node_modules/surge-native`, so a stale installed copy can
never shadow a fix again — and it refreshes that copy if your package manager installed one
instead of symlinking it.

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
bun install            # postinstall runs the overlay automatically
# or explicitly:
bun run android:prep
```

`android/` is generated and git-ignored, so **pulling source alone never changes
it** — the prep step is what rewrites the folder. If it is still missing after
that, the plugin module now fails with that exact instruction instead of Gradle's
cryptic one.

### `Could not find method pyc() … on extension 'chaquopy'`

```
A problem occurred evaluating project ':app'.
> Could not find method pyc() for arguments […] on extension 'chaquopy'
```

Chaquopy 17 moved `pyc` **onto `defaultConfig`**, and the `chaquopy` block must be a
sibling of `android { }`, not nested inside it:

```groovy
chaquopy {
    defaultConfig {
        version '3.11'
        pip { install 'yt-dlp==2024.11.18' }
        pyc { src = false }
    }
}
```

Only **one** module may apply `com.chaquo.python` — its docs say it "can only be used in
one module per app". Surge applies it in `:surge-native` only; the app module must not.
`bun run verify` fails if both modules apply it again.

### `AAPT: error: resource style/AppTheme not found`

Three resources, all referenced by the **stock Capacitor** manifest:

```
resource style/AppTheme not found
resource style/AppTheme.NoActionBarLaunch not found
resource string/title_activity_main not found
```

The plugin's `themes.xml` / `strings.xml` replace those resources, and `.MainActivity`
resolves against the app namespace (`com.surge.downloader.app`) while the real class is
`com.surge.downloader.MainActivity`. The overlay installs a maintained manifest that only
references what Surge ships:

```bash
bun run android:prep
```

`bun run android:check` compares the installed manifest with
`tools/templates/app-AndroidManifest.xml` and fails if it is still the stock one. Every
`@style` / `@string` / `@mipmap` reference is also validated offline against the plugin's
resources, so this class of failure is caught by `bun run verify`.

### `Couldn't find Python 3.10` / `is not a valid Python 3.10 command`

Chaquopy runs `pip` on the **build machine**, and its `check_build_python.py` requires the
build Python's major.minor to equal the target `version` **exactly**
(`sys.exit("it is version X")`). This repo targets **3.10** with `buildPython 'python3'`:

```bash
python3 --version      # must print 3.10.x
```

If it prints something else, either install 3.10 (`sudo apt install python3.10`) or make
both numbers match what you have, in `plugins/surge-native/android/build.gradle`:

```groovy
chaquopy {
    defaultConfig {
        version '3.12'        // ← same major.minor as `python3 --version`
        buildPython 'python3'
    }
}
```
