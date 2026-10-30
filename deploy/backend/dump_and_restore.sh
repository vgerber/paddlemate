#!/bin/bash
set -e

# Dump local dev database and restore it into the NAS postgres container.
# Run from repo root: bash scripts/dump_and_restore.sh
#
# Override via env vars:
#   NAS_USER, NAS_HOST, NAS_ROOT  from deploy/deploy.env
#   NAS_PATH       $NAS_ROOT/paddlemate-backend

# NAS connection: deploy/deploy.env (git-ignored; copy deploy.env.example).
# Environment variables override it.
[ -f deploy/deploy.env ] && . deploy/deploy.env
: "${NAS_USER:?set NAS_USER in deploy/deploy.env}"
: "${NAS_HOST:?set NAS_HOST in deploy/deploy.env}"
: "${NAS_ROOT:?set NAS_ROOT in deploy/deploy.env}"
: "${NAS_MODULE_ROOT:?set NAS_MODULE_ROOT in deploy/deploy.env}"
NAS_PATH="${NAS_PATH:-$NAS_ROOT/paddlemate-backend}"

DUMP_FILE="/tmp/paddlemate_export.dump"

echo "📦 Dumping local database..."
# Run pg_dump inside the local dev db container (no local pg tooling needed)
docker compose -f "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)/docker-compose.yml" \
    exec -T db pg_dump \
        --username=postgres \
        --dbname=paddlemate \
        --format=custom \
        --no-owner \
        --no-acl \
    > "${DUMP_FILE}"
echo "   Written to ${DUMP_FILE}"

echo "📤 Copying dump and restore script to NAS..."
rsync -az -e ssh "${DUMP_FILE}" "$(dirname "$0")/restore.sh" \
    "${NAS_USER}@${NAS_HOST}:${NAS_PATH}/"

echo "🧹 Cleaning up local dump..."
rm -f "${DUMP_FILE}"

echo "✅ Done! To restore, run:"
echo "   ssh ${NAS_USER}@${NAS_HOST} \"cd ${NAS_PATH} && bash restore.sh\""
