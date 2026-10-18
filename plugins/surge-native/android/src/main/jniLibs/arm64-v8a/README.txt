Drop the prebuilt arm64 binaries HERE, with exactly these names:

  libaria2c.so     aria2 1.37+ static build, renamed so the loader extracts it
  libffmpeg.so     ffmpeg 7.x  (android-aarch64 shared or static-renamed)
  libffprobe.so    ffprobe 7.x

They are renamed to lib*.so because Android 10+ mounts the app data dir noexec;
nativeLibraryDir is the only place an extracted binary keeps its exec bit.
abiFilters is arm64-v8a only, so nothing else is ever packaged.
