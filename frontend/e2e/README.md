# End-to-end tests

Playwright specs, one folder per feature (`app-shell`, `charts`, `logs`, `map`,
`navigation`, `primitives`, `proposals`, `provenance`, `search`,
`section-detail`, `sections`, `settings`, `shared-parts`, `theme`, `trips`).
They check what a user can do and what the browser computes (tokens, sizes, no
sideways scroll), not component internals.

## Running

Start the stack with the `dev-services` skill and seed the test-data fixture
(see [setup](../../doc/setup.md)). The specs sign in through Keycloak, drive the
system Chrome and share one seeded database, so they run in one worker; a spec
that changes data puts it back.

```
cd frontend && npx playwright test                  # everything
cd frontend && npx playwright test e2e/theme        # one feature
cd frontend && npx playwright test --project=phone  # one layout
```

## Projects

| Project | Layout | Runs |
|---|---|---|
| `phone` | Pixel 7 | every spec |
| `small` | 320px wide | specs tagged `@small` |
| `desktop` | 1280px | every spec |

## Layout of the folder

| Path | Holds |
|---|---|
| `auth.setup.ts` | The Keycloak sign-in the other projects reuse |
| `support/` | Shared helpers: `fixture.ts` (seeded ids), `global-setup.ts`, `finger.ts` (touch gestures), `notifications.ts` |
| `map/regions.mock.ts` | Canned region data for the map specs |

Configuration is in [playwright.config.ts](../playwright.config.ts). Run
`npx biome check src e2e` with the other gates.
