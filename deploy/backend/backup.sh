#!/bin/bash
set -euo pipefail

# Run ON THE NAS, nightly from a DSM scheduled task and before every deploy
# (deploy.sh calls it with the label "predeploy"):
#   bash <NAS_ROOT>/paddlemate-backend/backup.sh [label]
#
# Writes a pg_dump (custom format, restorable with pg_restore) and a
# hard-linked snapshot of data/media into backups/nightly/, keeping the
# newest $KEEP of each. Hyper Backup then copies backups/ off this volume;
# the live data/postgres folder is never copied file by file, since a copy
# taken while Postgres writes can be inconsistent.

NAS_PATH="$(cd "$(dirname "$0")" && pwd)"
LABEL="${1:-nightly}"
KEEP="${KEEP:-14}"
DOCKER="${DOCKER:-/usr/local/bin/docker}"
DB_CONTAINER="${DB_CONTAINER:-paddlemate-db}"
OUT="${NAS_PATH}/backups/nightly"
STAMP="$(date +%Y-%m-%d_%H%M)"
NAME="paddlemate-${STAMP}-${LABEL}"

mkdir -p "${OUT}/media"

if ! "${DOCKER}" ps --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
    echo "Database container ${DB_CONTAINER} is not running; nothing to back up."
    exit 0
fi

echo "Dumping database to ${OUT}/${NAME}.dump"
"${DOCKER}" exec "${DB_CONTAINER}" pg_dump -U postgres -Fc paddlemate > "${OUT}/${NAME}.dump.part"
# A dump pg_restore cannot list is broken; keep the previous ones instead.
"${DOCKER}" exec -i "${DB_CONTAINER}" pg_restore --list < "${OUT}/${NAME}.dump.part" > /dev/null
mv "${OUT}/${NAME}.dump.part" "${OUT}/${NAME}.dump"

echo "Snapshotting media to ${OUT}/media/${NAME}"
# Unchanged photos are hard links to the previous snapshot, so each copy
# costs only the files that changed.
PREV="$(ls -1d "${OUT}"/media/paddlemate-* 2>/dev/null | sort | tail -n 1 || true)"
if [ -n "${PREV}" ]; then
    rsync -a --delete --link-dest="${PREV}" "${NAS_PATH}/data/media/" "${OUT}/media/${NAME}/"
else
    rsync -a "${NAS_PATH}/data/media/" "${OUT}/media/${NAME}/"
fi

echo "Keeping the newest ${KEEP} dumps and media snapshots"
ls -1 "${OUT}"/paddlemate-*.dump | sort | head -n -"${KEEP}" | while read -r old; do rm -f -- "${old}"; done
ls -1d "${OUT}"/media/paddlemate-* | sort | head -n -"${KEEP}" | while read -r old; do rm -rf -- "${old}"; done

echo "Backup ${NAME} done ($(du -h "${OUT}/${NAME}.dump" | cut -f1))"
