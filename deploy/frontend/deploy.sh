#!/bin/bash
set -e

# Run from repo root: bash deploy/frontend/deploy.sh
# NAS connection: deploy/deploy.env (git-ignored; copy deploy.env.example).
# Environment variables override it.
[ -f deploy/deploy.env ] && . deploy/deploy.env
: "${NAS_USER:?set NAS_USER in deploy/deploy.env}"
: "${NAS_HOST:?set NAS_HOST in deploy/deploy.env}"
: "${NAS_ROOT:?set NAS_ROOT in deploy/deploy.env}"
: "${NAS_MODULE_ROOT:?set NAS_MODULE_ROOT in deploy/deploy.env}"
NAS_PATH="${NAS_PATH:-$NAS_ROOT/paddlemate-frontend}"
NAS_RSYNC_MODULE="${NAS_RSYNC_MODULE:-$NAS_MODULE_ROOT/paddlemate-frontend}"

echo "🔨 Building frontend..."
cd frontend
bun install --frozen-lockfile
bun run build
cd ..

echo "📤 Copying files to NAS..."
ssh "${NAS_USER}@${NAS_HOST}" "mkdir -p ${NAS_PATH}/dist"
rsync -az --delete -e ssh frontend/dist/ "${NAS_USER}@${NAS_HOST}::${NAS_RSYNC_MODULE}/dist/"
rsync -az -e ssh deploy/frontend/docker-compose.yml deploy/frontend/nginx.conf \
    "${NAS_USER}@${NAS_HOST}::${NAS_RSYNC_MODULE}/"

echo "🔄 Restarting frontend on NAS..."
ssh "${NAS_USER}@${NAS_HOST}" "
    cd ${NAS_PATH} && \
    /usr/local/bin/docker-compose -f docker-compose.yml up -d --force-recreate
"

echo "✅ Frontend deployment complete!"
echo "📍 Frontend running at: https://paddle.vgerber.io"
