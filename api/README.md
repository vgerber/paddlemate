# Paddlemate

Platform for managing whitewater rivers, sections, and features.

## Database Schema

```mermaid
erDiagram
    users {
        varchar id PK "Keycloak subject"
        varchar username
        timestamptz created_at
        timestamptz updated_at
    }

    api_tokens {
        bigserial id PK
        varchar user_id
        varchar name
        varchar token_hash UK
        timestamptz created_at
        timestamptz expires_at
        timestamptz last_used_at
        timestamptz revoked_at
    }

    groups {
        bigserial id PK
        varchar name
        text description
        varchar created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    group_members {
        bigint group_id PK,FK
        varchar user_id PK,FK
        enum role "owner | admin | member"
        varchar added_by FK
        timestamptz created_at
    }

    waterways {
        bigserial id PK
        enum waterway_type "river"
        varchar name
        text description
        timestamptz created_at
        timestamptz updated_at
    }

    water_sections {
        bigserial id PK
        bigint waterway_id FK
        varchar name
        text description
        geometry location "LineString WGS84"
        timestamptz created_at
        timestamptz updated_at
    }

    features {
        bigserial id PK
        bigint section_id FK
        enum feature_type "whitewater | freestyle_spot | hole | siphon | strainer | weir | dam | obstacle | bridge | portage | put_in | take_out | waterfall"
        jsonb metadata
        geometry location "Point/LineString/Polygon WGS84"
        varchar created_by
        timestamptz created_at
        timestamptz updated_at
    }

    feature_names {
        bigserial id PK
        bigint feature_id FK
        varchar lang_code
        varchar name
    }

    feature_descriptions {
        bigserial id PK
        bigint feature_id FK
        varchar lang_code
        text description
    }

    users ||--o{ api_tokens : "owns"
    users ||--o{ groups : "creates"
    users ||--o{ group_members : "belongs to"
    groups ||--o{ group_members : "has"
    waterways ||--o{ water_sections : "has"
    water_sections ||--o{ features : "has"
    features ||--o{ feature_names : "has"
    features ||--o{ feature_descriptions : "has"
```

## Authentication

Two authentication methods are supported:

- **Keycloak JWT** — Bearer token via `Authorization` header
- **API Token** — `X-Api-Key: pm_<token>` header

Server admin privileges are granted via the `server_admin` Keycloak realm role.

## Keycloak Setup

The API requires two Keycloak clients in your realm.

### `paddlemate-web` (public OIDC client)

Used by the frontend for PKCE login.

1. Create a client with **Client authentication** OFF (public)
2. Enable **Standard flow**
3. Set redirect URIs and web origins to your frontend URL

### `paddlemate-api` (service account client)

Used by the API backend to look up usernames via the Keycloak Admin REST API.

1. Create a client with **Client authentication** ON (confidential)
2. Enable **Service accounts roles** — this grants the `client_credentials` flow
3. Go to the **Service accounts roles** tab → **Assign role**
   - Change filter to **"Filter by clients"**
   - Search for `realm-management` and assign the **`view-users`** role
4. Copy the client secret from the **Credentials** tab into `KEYCLOAK_CLIENT_SECRET` in `.env`
