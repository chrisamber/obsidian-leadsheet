#!/bin/bash
# Convert a screen recording to a clean, README-sized GIF.
# Usage: ./make-gif.sh <input.mov> [width] [fps]
# Output: assets/demo.gif  (next to this script)
set -euo pipefail

IN="${1:?usage: make-gif.sh <input.mov> [width] [fps]}"
WIDTH="${2:-900}"
FPS="${3:-15}"
OUT="$(cd "$(dirname "$0")" && pwd)/demo.gif"
PAL="$(mktemp -t leadsheet-pal).png"

# Two-pass: generate an optimized palette, then apply it (sharp colors, small file).
ffmpeg -y -i "$IN" -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff" "$PAL"
ffmpeg -y -i "$IN" -i "$PAL" -lavfi "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "$OUT"

rm -f "$PAL"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
