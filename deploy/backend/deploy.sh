#!/bin/bash
set -e

# Run from repo root: bash deploy/backend/deploy.sh
# NAS connection: deploy/deploy.env (git-ignored; copy deploy.env.example).
# Environment variables override it.
[ -f deploy/deploy.env ] && . deploy/deploy.env
: "${NAS_USER:?set NAS_USER in deploy/deploy.env}"
: "${NAS_HOST:?set NAS_HOST in deploy/deploy.env}"
: "${NAS_ROOT:?set NAS_ROOT in deploy/deploy.env}"
: "${NAS_MODULE_ROOT:?set NAS_MODULE_ROOT in deploy/deploy.env}"
NAS_PATH="${NAS_PATH:-$NAS_ROOT/paddlemate-backend}"
NAS_RSYNC_MODULE="${NAS_RSYNC_MODULE:-$NAS_MODULE_ROOT/paddlemate-backend}"

ENV_FILE="deploy/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Missing ${ENV_FILE}"
    echo "   Copy deploy/backend/.env.example → deploy/backend/.env and fill in your values."
    exit 1
fi

echo "🔨 Building API image..."
docker build -t paddlemate-api ./api

echo "📤 Copying config files to NAS..."
ssh "${NAS_USER}@${NAS_HOST}" "mkdir -p ${NAS_PATH}/data/postgres ${NAS_PATH}/data/media && chmod 777 ${NAS_PATH}/data/postgres ${NAS_PATH}/data/media"
rsync -az -e ssh deploy/backend/docker-compose.yml deploy/backend/restore.sh "${ENV_FILE}" \
    "${NAS_USER}@${NAS_HOST}::${NAS_RSYNC_MODULE}/"

echo "🚀 Pushing image to NAS..."
docker save paddlemate-api:latest | ssh "${NAS_USER}@${NAS_HOST}" "/usr/local/bin/docker load"

echo "🔄 Restarting backend on NAS..."
ssh "${NAS_USER}@${NAS_HOST}" "
    cd ${NAS_PATH} && \
    /usr/local/bin/docker-compose -f docker-compose.yml down && \
    /usr/local/bin/docker-compose -f docker-compose.yml up -d
"

echo "✅ Files pushed — restart manually to apply."
echo "   ssh ${NAS_USER}@${NAS_HOST} \"cd ${NAS_PATH} && /usr/local/bin/docker-compose -f docker-compose.yml down && /usr/local/bin/docker-compose -f docker-compose.yml up -d\""
# echo "📍 API running at: https://paddle.vgerber.io/api/v1"
