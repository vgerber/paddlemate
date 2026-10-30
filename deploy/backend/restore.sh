#!/bin/bash
set -e

# Run this ON THE NAS after running dump_and_restore.sh locally.
#   ssh <nas> "cd <NAS_ROOT>/paddlemate-backend && bash restore.sh"

NAS_PATH="$(cd "$(dirname "$0")" && pwd)"
DUMP_FILE="${NAS_PATH}/paddlemate_export.dump"

if [ ! -f "${DUMP_FILE}" ]; then
    echo "❌ Dump file not found: ${DUMP_FILE}"
    echo "   Run deploy/backend/dump_and_restore.sh first."
    exit 1
fi

echo "⏹️  Stopping API..."
/usr/local/bin/docker-compose -f "${NAS_PATH}/docker-compose.yml" stop api

echo "🗑️  Dropping and recreating database..."
/usr/local/bin/docker exec paddlemate-db psql -U postgres -c "DROP DATABASE IF EXISTS paddlemate;"
/usr/local/bin/docker exec paddlemate-db psql -U postgres -c "CREATE DATABASE paddlemate;"

echo "🔄 Restoring dump..."
/usr/local/bin/docker cp "${DUMP_FILE}" paddlemate-db:/tmp/paddlemate_export.dump
/usr/local/bin/docker exec paddlemate-db pg_restore \
    --username=postgres \
    --dbname=paddlemate \
    --no-owner \
    --no-acl \
    /tmp/paddlemate_export.dump

echo "▶️  Starting API..."
/usr/local/bin/docker-compose -f "${NAS_PATH}/docker-compose.yml" start api

echo "🧹 Cleaning up..."
rm -f "${DUMP_FILE}"
/usr/local/bin/docker exec paddlemate-db rm -f /tmp/paddlemate_export.dump

echo "✅ Restore complete!"
