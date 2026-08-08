# End-to-end checks

Bun scripts that drive the running app through a real browser (headless
Chrome over the DevTools Protocol - no Playwright). They exercise the whole
stack: Keycloak sign-in, the API, and the frontend.

## Prerequisites

The app must be running locally (see the `verify` skill for how to start it):
API on `:3000`, frontend on `:5173`, local Keycloak on `:8080`, the test-data
fixture seeded, and headless Chrome on `:9222`:

```sh
google-chrome --headless=new --remote-debugging-port=9222 \
  --user-data-dir=$(mktemp -d) about:blank &
```

## Running

```sh
bun e2e/login.ts         # real PKCE sign-in; leaves a session in the browser
bun e2e/smoke.ts         # main authed flows (logs, descent, map, admin, mobile)
bun e2e/draw-feature.ts  # draws a feature geometry on the map and asserts it renders
```

`login.ts` must run first - `smoke.ts` and `draw-feature.ts` reuse the
session it leaves in the browser profile. Each prints `PASS`/`FAIL` lines and
exits non-zero on failure.

Screenshots go to `$E2E_OUT` (default: a `paddlemate-e2e` dir under the system
temp dir), never into the repo.

## Notes

- `cdp.ts` is the shared helper (connect, navigate, evaluate, click, shot).
- Synthetic `Input.dispatchMouseEvent` does not reach the page in this setup;
  dispatch real DOM `MouseEvent`s to click map/canvas targets (the scripts do).
- MUI's `SpeedDial` needs a full pointer sequence to open, not a bare
  `.click()` (see `draw-feature.ts`).
