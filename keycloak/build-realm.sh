#!/usr/bin/env sh
# Composes the local dev realm from the shared client definitions so the
# clients never drift between this file and a production import.
# Run after editing either *-client.json:  sh keycloak/build-realm.sh
set -eu
cd "$(dirname "$0")"

# The fixture (.claude/skills/test-data) pins these subjects, so a signed-in
# session sees exactly the seeded data. Change one here and change it there.
# Vincent is the admin you normally sign in as; the other four are the mates
# he shares trips, groups and logs with, and signing in as one of them is how
# you check what a non-admin, non-owner actually sees.
FIXTURE_USER_ID="5a5e307b-bd29-4f61-a9e3-b29df4cb1744"
MARA_ID="9a1c0d4e-2b73-4f8a-9c15-6d2e8b7a4013"
TOBI_ID="c4f27a86-5d19-4e62-b8a3-1f7c9e05d284"
AOIFE_ID="e83b5c17-9f42-4a0d-8e6b-3c15d7208af9"
JONAS_ID="7d64e920-8a31-4c5f-b27e-05f3a9c61d48"

jq -n \
  --slurpfile web paddlemate-web-client.json \
  --slurpfile api paddlemate-api-client.json \
  --arg uid "$FIXTURE_USER_ID" \
  --arg mara "$MARA_ID" \
  --arg tobi "$TOBI_ID" \
  --arg aoife "$AOIFE_ID" \
  --arg jonas "$JONAS_ID" \
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
        id: $mara,
        username: "mara",
        enabled: true,
        emailVerified: true,
        email: "mara@example.test",
        firstName: "Mara",
        lastName: "Lindqvist",
        requiredActions: [],
        credentials: [{ type: "password", value: "paddle", temporary: false }],
        realmRoles: ["default-roles-paddle"]
      },
      {
        id: $tobi,
        username: "tobi",
        enabled: true,
        emailVerified: true,
        email: "tobi@example.test",
        firstName: "Tobias",
        lastName: "Reiner",
        requiredActions: [],
        credentials: [{ type: "password", value: "paddle", temporary: false }],
        realmRoles: ["default-roles-paddle"]
      },
      {
        id: $aoife,
        username: "aoife",
        enabled: true,
        emailVerified: true,
        email: "aoife@example.test",
        firstName: "Aoife",
        lastName: "Byrne",
        requiredActions: [],
        credentials: [{ type: "password", value: "paddle", temporary: false }],
        realmRoles: ["default-roles-paddle"]
      },
      {
        id: $jonas,
        username: "jonas",
        enabled: true,
        emailVerified: true,
        email: "jonas@example.test",
        firstName: "Jonas",
        lastName: "Weber",
        requiredActions: [],
        credentials: [{ type: "password", value: "paddle", temporary: false }],
        realmRoles: ["default-roles-paddle"]
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
