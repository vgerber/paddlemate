#!/usr/bin/env bash
# Regenerate all PWA/favicon assets from public/logo.svg
set -euo pipefail

SRC="$(dirname "$0")/../public/logo.svg"
OUT="$(dirname "$0")/../public"

echo "Generating icons from $SRC..."

inkscape "$SRC" --export-type=png --export-width=64   --export-height=64   --export-filename="$OUT/pwa-64x64.png"
inkscape "$SRC" --export-type=png --export-width=192  --export-height=192  --export-filename="$OUT/pwa-192x192.png"
inkscape "$SRC" --export-type=png --export-width=512  --export-height=512  --export-filename="$OUT/pwa-512x512.png"
inkscape "$SRC" --export-type=png --export-width=180  --export-height=180  --export-filename="$OUT/apple-touch-icon-180x180.png"
inkscape "$SRC" --export-type=png --export-width=512  --export-height=512  --export-filename="$OUT/maskable-icon-512x512.png"

inkscape "$SRC" --export-type=png --export-width=16 --export-height=16 --export-filename="$OUT/_fav16.png"
inkscape "$SRC" --export-type=png --export-width=32 --export-height=32 --export-filename="$OUT/_fav32.png"
inkscape "$SRC" --export-type=png --export-width=48 --export-height=48 --export-filename="$OUT/_fav48.png"
convert "$OUT/_fav16.png" "$OUT/_fav32.png" "$OUT/_fav48.png" "$OUT/favicon.ico"
rm "$OUT"/_fav*.png

cp "$SRC" "$OUT/favicon.svg"

echo "Done."
