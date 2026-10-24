#!/usr/bin/env bash
# Regenerate the PWA and favicon assets from public/logo.svg,
# public/favicon.svg (16-48px) and scripts/icon-src (maskable, Apple).
set -euo pipefail
cd "$(dirname "$0")/.."

npx pwa-assets-generator --config pwa-assets.config.ts
node scripts/gen-favicon.mjs
convert public/_fav16.png public/_fav32.png public/_fav48.png public/favicon.ico
rm public/_fav*.png
echo "Done."
