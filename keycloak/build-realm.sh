#!/usr/bin/env sh
# Composes the local dev realm from the shared client definitions so the
# clients never drift between this file and a production import.
# Run after editing either *-client.json:  sh keycloak/build-realm.sh
set -eu
cd "$(dirname "$0")"

# The fixture (.claude/skills/test-data) assigns its descents, proposals and
# favourites to this user id, so the local Keycloak user must carry the same
# subject or a signed-in session would see none of the seeded data.
FIXTURE_USER_ID="5a5e307b-bd29-4f61-a9e3-b29df4cb1744"

jq -n \
  --slurpfile web paddlemate-web-client.json \
  --slurpfile api paddlemate-api-client.json \
  --arg uid "$FIXTURE_USER_ID" \
  '{
    realm: "paddle",
    enabled: true,
    sslRequired: "none",
    registrationAllowed: true,
    loginWithEmailAllowed: true,
    accessTokenLifespan: 1800,
    ssoSessionIdleTimeout: 7200,
    roles: {
      realm: [
        { name: "server_admin", description: "Full administrative access" }
      ]
    },
    clients: [
      $web[0],
      ($api[0] + { secret: "local-dev-secret" })
    ],
    users: [
      {
        id: $uid,
        username: "vincent",
        enabled: true,
        emailVerified: true,
        email: "vincent@example.test",
        firstName: "Vincent",
        lastName: "Local",
        requiredActions: [],
        credentials: [
          { type: "password", value: "paddle", temporary: false }
        ],
        realmRoles: ["default-roles-paddle", "server_admin"]
      },
      {
        username: "service-account-paddlemate-api",
        enabled: true,
        serviceAccountClientId: "paddlemate-api",
        clientRoles: { "realm-management": ["view-users"] }
      }
    ]
  }' > realm-local.json

echo "wrote keycloak/realm-local.json"
