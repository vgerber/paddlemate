#!/usr/bin/env bash
# Provisions a Keycloak for paddlemate: realm, both clients, the server_admin
# role, and the API service account's permission to look up usernames.
# Idempotent, so it is also how you roll out an edit to paddlemate-*-client.json.
#
#   ./keycloak/setup-keycloak.sh                                  # localhost:8080
#   ./keycloak/setup-keycloak.sh https://auth.example.com https://app.example.com
#
# Args:  [keycloak-url] [app-origin]     app-origin is added to the web client's
#                                        redirect/CORS lists when given.
# Env:   KC_ADMIN_USER (default admin), KC_ADMIN_PASSWORD (prompted if unset),
#        KC_REALM (default paddle), KC_API_SECRET (generated if unset).
#
# For local development use `docker compose --profile auth up -d keycloak`
# instead: it imports realm-local.json, which - unlike the Admin API this
# script uses - can pin the dev user's id to the test-data fixture's owner.
set -euo pipefail
cd "$(dirname "$0")"

URL="${1:-http://localhost:8080}"
ORIGIN="${2:-}"
REALM="${KC_REALM:-paddle}"
ADMIN="${KC_ADMIN_USER:-admin}"
SECRET="${KC_API_SECRET:-$(head -c 24 /dev/urandom | base64 | tr -d '/+=')}"

if [ -z "${KC_ADMIN_PASSWORD:-}" ]; then
  read -rsp "Keycloak admin password for $ADMIN@$URL: " KC_ADMIN_PASSWORD
  echo
fi

TOKEN=$(curl -sf -X POST "$URL/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli -d "username=$ADMIN" \
  --data-urlencode "password=$KC_ADMIN_PASSWORD" | jq -r .access_token)
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "admin login failed" >&2; exit 1; }

# Every call returns the status code; the body lands in $BODY.
kc() {
  local method=$1 path=$2
  BODY=$(mktemp)
  curl -sS -o "$BODY" -w '%{http_code}' -X "$method" "$URL/admin/realms$path" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    ${3+--data "$3"}
}
say() { printf '%-28s %s\n' "$1" "$2"; }

# Realm
if [ "$(kc GET "/$REALM")" = 404 ]; then
  kc POST "" "$(jq -n --arg r "$REALM" '{realm:$r,enabled:true,registrationAllowed:false}')" >/dev/null
  say "realm $REALM" created
else
  say "realm $REALM" exists
fi

# Clients, from the checked-in definitions. An app origin, when given, is
# merged into the browser client's redirect and CORS lists.
client() {
  local file=$1 payload
  payload=$(jq --arg o "$ORIGIN" "$2"'
    | if $o == "" then . else
        .redirectUris = ((.redirectUris // []) + [$o + "/*"] | unique)
      | .webOrigins   = ((.webOrigins   // []) + [$o]       | unique)
      end' "$file")
  local id
  kc GET "/$REALM/clients?clientId=$(jq -r .clientId "$file")" >/dev/null
  id=$(jq -r '.[0].id // empty' "$BODY")
  if [ -n "$id" ]; then
    kc PUT "/$REALM/clients/$id" "$payload" >/dev/null
    say "client $(jq -r .clientId "$file")" updated
  else
    kc POST "/$REALM/clients" "$payload" >/dev/null
    say "client $(jq -r .clientId "$file")" created
  fi
}
client paddlemate-web-client.json .
client paddlemate-api-client.json ".secret = \"$SECRET\""

# Realm role the app checks for admin rights, on both the API and the frontend.
if [ "$(kc GET "/$REALM/roles/server_admin")" = 404 ]; then
  kc POST "/$REALM/roles" '{"name":"server_admin","description":"Full paddlemate admin"}' >/dev/null
  say "role server_admin" created
else
  say "role server_admin" exists
fi

# The API resolves usernames via GET /admin/realms/{realm}/users/{id}, which
# needs realm-management's view-users on its service account.
kc GET "/$REALM/clients?clientId=paddlemate-api" >/dev/null
sa=$(jq -r '.[0].id' "$BODY")
kc GET "/$REALM/clients/$sa/service-account-user" >/dev/null
sa_user=$(jq -r .id "$BODY")
kc GET "/$REALM/clients?clientId=realm-management" >/dev/null
mgmt=$(jq -r '.[0].id' "$BODY")
kc GET "/$REALM/clients/$mgmt/roles/view-users" >/dev/null
kc POST "/$REALM/users/$sa_user/role-mappings/clients/$mgmt" "[$(jq -c '{id,name}' "$BODY")]" >/dev/null
say "view-users grant" ok

cat <<EOF

API:       KEYCLOAK_URL=$URL
           KEYCLOAK_REALM=$REALM
           KEYCLOAK_AUDIENCE=account
           KEYCLOAK_TOKEN_URL=$URL/realms/$REALM/protocol/openid-connect/token
           KEYCLOAK_CLIENT_ID=paddlemate-api
           KEYCLOAK_CLIENT_SECRET=$SECRET
Frontend:  VITE_AUTH_SERVER=$URL
           VITE_AUTH_REALM=$REALM
           VITE_AUTH_CLIENT_ID=paddlemate-web
EOF
[ -n "${KC_API_SECRET:-}" ] || echo "
The client secret was generated just now - store it, it is not shown again."
