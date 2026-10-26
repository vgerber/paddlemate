# End-to-end tests

Playwright specs, one folder per feature (`app-shell`, `charts`, `logs`, `map`,
`navigation`, `primitives`, `proposals`, `provenance`, `search`,
`section-detail`, `sections`, `settings`, `shared-parts`, `theme`, `trips`).
They check what a user can do and what the browser computes (tokens, sizes, no
sideways scroll), not component internals.

## Running

Start the stack with the `dev-services` skill and seed the test-data fixture
(see [setup](../../doc/setup.md)); its API start command sets the three rate
limits to 0, which parallel workers need. The specs sign in through Keycloak
and drive the system Chrome.

```
cd frontend && npm run e2e                          # routine run, all layouts
cd frontend && npm run e2e:sweep                    # pre-release sweep
cd frontend && npx playwright test e2e/theme        # one feature
cd frontend && npx playwright test --project=phone  # one layout, read-only tests
```

## Projects

| Project | Layout | Runs |
|---|---|---|
| `phone` | Pixel 7 | every read-only test |
| `small` | 320px wide | read-only tests tagged `@small` |
| `desktop` | 1280px | every read-only test except the phone-only ones |
| `phone-write`, `small-write`, `desktop-write` | as above | tests tagged `@write`, one worker, after all read-only tests, one layout after the other |

The specs share one seeded database. Read-only tests (a `page.route` mock is
not a write) run in parallel; a test that creates, changes or deletes data is
tagged `@write` in its title and runs in the write projects, which put the
data back. Tests that do not depend on the layout call `phoneOnly()` or are
listed in `PHONE_ONLY` in the config. `e2e/sweep` is left out of the routine
run; `npm run e2e:sweep` runs only it.

## Layout of the folder

| Path | Holds |
|---|---|
| `auth.setup.ts` | The Keycloak sign-in the other projects reuse |
| `support/` | Shared helpers: `fixture.ts` (seeded ids), `global-setup.ts`, `finger.ts` (touch gestures), `notifications.ts` |
| `map/regions.mock.ts` | Canned region data for the map specs |

Configuration is in [playwright.config.ts](../playwright.config.ts). Run
`npx biome check src e2e` with the other gates.
