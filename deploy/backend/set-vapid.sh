#!/bin/bash
set -euo pipefail

# Gives the production API its web push identity (VAPID) and copies it to the
# NAS. Run from repo root: bash deploy/backend/set-vapid.sh
#
# The key is written to deploy/backend/.env, not only to the NAS, because
# deploy.sh copies that file over the NAS copy on every deploy - a key that
# lived only on the NAS would be wiped by the next one.
#
# Run it once. A new key cuts every device off push until each one switches
# push off and on again, so an existing key is kept unless you pass --rotate.
#
# VAPID_SUBJECT defaults to mailto:<your git email>; push services may use it
# to reach you about this server. Override: VAPID_SUBJECT=mailto:x@y bash ...

# NAS connection: deploy/deploy.env (git-ignored; copy deploy.env.example).
# Environment variables override it.
[ -f deploy/deploy.env ] && . deploy/deploy.env
: "${NAS_USER:?set NAS_USER in deploy/deploy.env}"
: "${NAS_HOST:?set NAS_HOST in deploy/deploy.env}"
: "${NAS_ROOT:?set NAS_ROOT in deploy/deploy.env}"
: "${NAS_MODULE_ROOT:?set NAS_MODULE_ROOT in deploy/deploy.env}"
NAS_RSYNC_MODULE="${NAS_RSYNC_MODULE:-$NAS_MODULE_ROOT/paddlemate-backend}"
ENV_FILE="deploy/backend/.env"

ROTATE=false
[ "${1:-}" = "--rotate" ] && ROTATE=true

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing ${ENV_FILE} - run from the repo root." >&2
    exit 1
fi

if grep -q '^VAPID_PRIVATE_KEY=.' "$ENV_FILE" && [ "$ROTATE" = false ]; then
    echo "${ENV_FILE} already has a VAPID key; keeping it."
    echo "Pass --rotate to replace it (every device must re-enable push)."
else
    SUBJECT="${VAPID_SUBJECT:-mailto:$(git config user.email)}"
    case "$SUBJECT" in
        mailto:?*@?* | https://?*) ;;
        *) echo "VAPID_SUBJECT must be mailto:<address> or https://<url>, got '${SUBJECT}'" >&2; exit 1 ;;
    esac

    # The raw 32-byte P-256 private scalar, base64url without padding - the
    # form the API reads. Taken from openssl's own hex dump of the key rather
    # than from DER offsets.
    HEX=$(openssl ecparam -name prime256v1 -genkey -noout 2>/dev/null |
        openssl ec -text -noout 2>/dev/null |
        awk '/^priv:/{p=1;next} /^pub:/{p=0} p' | tr -d ' :\n')
    HEX=$(printf '%064s' "${HEX: -64}" | tr ' ' 0)
    KEY=$(printf '%s' "$HEX" | xxd -r -p | base64 -w0 | tr '+/' '-_' | tr -d '=')
    if [ "${#KEY}" -ne 43 ]; then
        echo "Key generation failed (got ${#KEY} characters, expected 43)." >&2
        exit 1
    fi

    # Replace any previous VAPID lines, keep everything else as it is.
    TMP=$(mktemp)
    grep -v '^VAPID_PRIVATE_KEY=\|^VAPID_SUBJECT=' "$ENV_FILE" > "$TMP" || true
    {
        echo "VAPID_PRIVATE_KEY=${KEY}"
        echo "VAPID_SUBJECT=${SUBJECT}"
    } >> "$TMP"
    chmod 600 "$TMP"
    mv "$TMP" "$ENV_FILE"
    echo "Wrote a new VAPID key to ${ENV_FILE} (subject ${SUBJECT})."
fi

echo "Copying ${ENV_FILE} to the NAS..."
rsync -az -e ssh "$ENV_FILE" "${NAS_USER}@${NAS_HOST}::${NAS_RSYNC_MODULE}/"

echo "Done. The API picks the key up the next time its container is created:"
echo "  bash deploy/backend/deploy.sh"
echo "Its log then no longer says 'web push is off'."
