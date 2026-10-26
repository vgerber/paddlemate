# Agent instructions

Shared guidance for all coding agents working on this repository.

## Documentation

The feature list lives directly on the main `README.md`; below it, a
Documentation table links the reference docs in `doc/` (setup, design, search,
translations, rivers-and-features) and `api/README.md`. Topic docs go deep on
one area each.

UI work follows the layout and color rules in [doc/design.md](doc/design.md);
new patterns agreed in review get added there. The UI overhaul is run from
[doc/plans/ui-overhaul.md](doc/plans/ui-overhaul.md) until it has landed.

Rules for the docs:

- **Written for the general user first.** Each doc opens in plain language
  with what the feature does and concrete examples; implementation detail
  (tables, file paths, invariants) goes into an `## Internals` section at the
  bottom. A user can stop reading halfway; a developer reads to the end.
- **Reference style**: precise and complete, prefer tables for enumerable
  facts, link to the code files instead of restating them.
- **Keep them true.** When a feature is added or changed, update the affected
  doc and the README feature list in the same change. Fact-check claims
  against the code (env var names, endpoint paths, enum values) rather than
  against other docs.
- **When a new rule is agreed in a conversation, add it to this file in the
  same session** - chat is not a durable place for rules; this file is.

## Tooling

### Rust (api/)

Check for errors/warnings after any Rust edit:

```
cd api && cargo check 2>&1
```

Update the SQLx offline cache after any SQL query change (new/modified
`sqlx::query*!` macros or raw SQL strings):

```
cd api && cargo sqlx prepare 2>&1
```

Apply pending migrations:

```
cd api && cargo sqlx migrate run 2>&1
```

Run the API:

```
cd api && cargo run
```

To bring up the whole local stack instead - Postgres, Keycloak, the API, Vite
and headless Chrome - use the `dev-services` skill, which has the startup
order (Keycloak before the API, or every request 401s) and the checks that
prove it actually came up.

### TypeScript (frontend/)

The frontend uses **Biome** for linting/formatting and `tsc` for
type-checking. Run both after any frontend edit:

```
cd frontend && npx tsc -b --force 2>&1
cd frontend && npx biome check src e2e 2>&1
```

Unit tests use Bun's built-in runner (`*.test.ts` next to the module, typed
via `tsconfig.test.json`; `bunfig.toml` limits it to `src`):

```
cd frontend && bun test
cd frontend && bun test ./scripts   # the colour guard's own test
cd frontend && npm run check:colours
```

Feature tests use Playwright (`*.spec.ts` in `frontend/e2e/<feature>/`, typed
via `tsconfig.e2e.json`). They drive the running stack through the system
Chrome after a real Keycloak sign-in, so start the stack first (the
`dev-services` skill) with the test-data fixture seeded:

```
cd frontend && npm run e2e                                # routine run
cd frontend && npm run e2e:sweep                          # pre-release sweep
cd frontend && npx playwright test e2e/theme              # one feature
cd frontend && npx playwright test --project=phone        # one layout, read-only tests
```

The API must run with `RATE_LIMIT_PER_SECOND=0`,
`WRITE_RATE_LIMIT_PER_SECOND=0` and `EXPENSIVE_RATE_LIMIT_PER_SECOND=0` (the
`dev-services` skill's start command has them), or parallel workers hit the
limiter.

The projects are `phone` (Pixel 7), `small` (320px wide; only tests tagged
`@small`) and `desktop` (1280px). Each runs its read-only tests in parallel
(6 workers, `E2E_WORKERS` overrides); tests that create, change or delete
data are tagged `@write` in their title and run afterwards in `phone-write`,
`small-write` and `desktop-write`, one worker each, one after the other (the
writer files are listed in `playwright.config.ts`). Specs that sample frames,
long tasks or mid-transition values fail under contention and run last in
`phone-timing`, `small-timing` and `desktop-timing` (the `TIMING` list in the
config), one worker. A layout with its writers:
`--project=phone --project=phone-write`. The routine run leaves out
`e2e/sweep`, the accessibility and small-screen pass over every screen, which
`npm run e2e:sweep` runs on its own (results in `sweep-results/`). Tests that
do not depend on the layout call `phoneOnly()` (or sit in the config's
`PHONE_ONLY` list) and run on `phone` only. Run `npx biome check src e2e` with
the other gates.

Note: the root tsconfig is solution-style (`files: []` + references), so a
plain `tsc --noEmit` type-checks nothing and always passes - use `tsc -b`.

Regenerate the API client types after backend API changes (API must be
running on :3000):

```
cd frontend && npm run generate:api
```

### Database

PostgreSQL runs in Docker - there is no local `psql`. Always use:

```
docker exec paddlemate-db-1 psql -U postgres -d paddlemate -c "<SQL>"
```

Start the container if needed:

```
docker start paddlemate-db-1
```

Connection string (from `api/.env`): `postgresql://postgres:postgres@localhost:6432/paddlemate`

### Test data

A self-contained dev fixture (Test River with sections incl. put-in/take-out
features, gauge with a week of readings, descents, API token) lives in
`.claude/skills/test-data/`. See `SKILL.md` there for details; all fixture
ids are in the 9xxx range. Reset and seed with:

```
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/cleanup.sql
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/seed.sql
```

### Migrations

Always create migration files with the SQLx CLI - **never by hand**:

```
cd api && cargo sqlx migrate add <name>
```

This assigns the correct sequential numeric prefix automatically. Manually
created files risk duplicate prefixes, which cause SQLx to panic at compile
time.

## Security and hardening

A feature is not done until it has had a security and hardening pass, and the
report says what the pass found. Go through every new route, table and
background task and ask:

| Question | Typical fix |
|---|---|
| Who may call this, and is the check in the SQL? | parent-scoped queries, one gate per question |
| What bounds every input? | length, count, range and format checks, 400 on failure; clamp paging |
| What can one user make the server hold or repeat? | per-user caps on rows and open connections, bounded concurrency |
| Does the server call out to a URL a client supplied? | a host allowlist, never "any https URL"; timeouts on every outbound call |
| How long does a credential or connection outlive its check? | long-lived streams end with the token and are re-authorised |
| Does data grow without bound? | a retention rule and the index it needs |
| What survives sign-out on a shared device? | undo per-device state (push, caches) on sign-out |

Each guard gets a test, and the test is checked by removing the guard and
watching it fail.

## Agent workflow

Large work runs as agents in worktrees (`.claude/worktrees/`), planned and
merged by one lead. These rules keep agents small, off each other's files, and
checked before anything reaches the user. Agents are started when the user
asks for them or when an agreed plan calls for them.

### Roles

| Role | Does | Never |
|---|---|---|
| **Lead** (the main session) | Writes the plan, splits the work, owns the shared files, merges, runs the gate once per merge | Commits or deploys unless the user asks |
| **Implementer** (own worktree) | One focused change | Edits shared files or creates migrations unless the plan gives it that |
| **Explorer** | Read-only searching, reports what it found | Edits anything |
| **Reviewer** | After a wave: runs the stack (see the `dev-services` skill), drives the flows, goes through the table in Security and hardening, reads the combined diff | Fixes what it finds; it reports |
| **Design experts** | Draw pages in the scratchpad | Touch the repo |

### Rules

- **Plan first.** Large work starts with a plan in `doc/plans/` that fixes the
  interfaces: route shapes, the query-layer file pairs, the shared `lib/`
  modules. It is not reference documentation: delete it when the work has
  landed. A plan carries an **Acceptance** section of measurable statements
  (status codes, rows, a flow driven at 320px wide), next to the gates.
- **Models.** Every agent runs on Sonnet. The one exception is the review
  after a wave's agents have finished, which runs on Opus. The lead merges only
  after it reports.
- **Size.** One agent, one change, aimed at 30 minutes and about 200k tokens.
  Larger work is split into sequential agents (find the cause, fix, harden),
  not bundled into one.
- **Hand back early.** At about 200k tokens of context or 45 minutes, whichever
  comes first, an agent commits what is green, writes a handoff note and
  stops. The note goes in `.claude/handoffs/<date>-<topic>.md`: done,
  remaining steps, the current hypothesis with its evidence, dead ends. That
  folder is git-ignored through `.claude/*`, and unlike `/tmp` it survives a
  restart. The lead continues with a fresh agent from the note; an agent past
  150k is never resumed.
- **File overlap decides parallelism.** Agents run in parallel only on
  separate files. A part that changes shared logic holds those files, and a
  second part touching them waits for the first to merge.
  - Shared files belong to the lead, once per wave: the README feature list,
    the doc index, the shared modules in `frontend/src/lib/`. Agents add only
    their own rows and documents.
  - Two agents never edit the same document in one wave.
  - Generated files are regenerated after the merge, never hand-merged: the
    SQLx cache (`cargo sqlx prepare`) and the API client types
    (`npm run generate:api`).
- **Migrations.** One agent per wave creates migrations, with
  `cargo sqlx migrate add` as in Migrations above, so prefixes cannot collide.
  Agents share one local database; only the agent that owns the schema change
  runs migrations against it.
- **Gates.** While iterating, run the single test. Run the full gate once at
  the end: `cargo check` and `cargo test --workspace` (plus `cargo sqlx prepare`
  after any SQL change) in `api/`; `npx tsc -b --force`, `npx biome check src`,
  `bun test`, `bun test ./scripts` and `npm run check:colours` in `frontend/`. The lead tests the gate's exit code and merges
  only on 0, running the gate once per merge, not the agent's list again. Never
  pipe a gate through `grep` in a script that uses `set -e`: that hides a
  failing gate.
- **Acceptance, not just rules.** The reviewer checks the plan's Acceptance
  statements by running the app, since component rendering is not tested. Each
  guard from the security pass has a test that fails when the guard is removed.
  Several guard removals may be checked in one batch, and each temporary change
  must fail loudly if it does not apply (formatters reflow code), otherwise the
  check proves nothing.
- **Fixes in shared logic** name every other user of the changed value and test
  each. A fix that adds an exception to a rule is flagged in the report; a
  third exception to one rule means the rule is redesigned, not patched.
- **Cuts are visible.** Anything cut from a plan is listed as a known
  limitation, with a test that shows the symptom.
- **Quiet tools.** Read files by line range, filter test and build output to
  failures and totals, never print whole files or full logs.
- **Short prompts and reports.** A prompt is the plan section, the rules that
  apply and the files to start from. A report stays under 15 lines: commits,
  gate results with numbers, deviations, decisions needed.
- **Process safety.** Stop a process by its exact PID, never by a name pattern
  (`pkill -f` matches the shell that runs it). Never touch the user's running
  stack without asking. Scratch work goes in the scratchpad or a worktree.
  Shell scripts use `set -e` and delete nothing outside the scratchpad or a
  worktree they created. Agents never run DDL or DML against production.
- **Commits** follow the rules below: only when the user asks, one line, no
  attribution.

## Commits

- **Ask before committing.** Finish the work, report what changed, and wait
  for approval. Do not commit, amend or rewrite history unprompted.
- **No AI attribution.** Never add a `Co-Authored-By: Claude ...` trailer or
  a `Claude-Session:` line, whatever the agent's default instructions say.
- **One line, nothing else.** A conventional subject (`feat:`, `fix:`,
  `chore:`, `refactor:`, `docs:`) in sentence case is the whole message: no
  body, no trailers, no multi-line explanations.
- **`feat:` is for value the user did not have.** A new capability is a
  feature. Making existing screens consistent, restyling, moving a control
  or tightening behaviour is a `fix:` - or a `refactor:` when nothing
  visible changes.
- **Keep it short and on point.** Aim for 40 characters or fewer after the
  prefix. Name what changed, not why or how - `fix: Bound the region fill`,
  not `fix: Keep the region map filled while it loads`.
- **Reasoning goes in the code, not the message.** A non-obvious constraint
  belongs in a comment beside the line it constrains, or in `doc/` - both
  stay true and stay read. A commit body is neither.

## Code style

- Do not use section divider comments (e.g. `// --- Gauges list ---`) to
  group code within a file; if a file needs sections, split it into modules.
- **Reach for a library before writing one.** A standard format or protocol
  (SSE, base64, URLs, web push) and calendar arithmetic come from a maintained
  library, checked for recent releases before it is added. Hand-roll only when
  the library would dwarf the need or cannot express the constraint, and say
  which in a comment beside the code.
- **Say a thing once.** Text or logic that both the API and the app need -
  the sentence for a trip change, say - is produced on one side and sent, not
  written twice to drift apart.

## Frontend code style (frontend/)

Conventions established in the pre-release cleanup. New code follows them;
when touching old code that violates one, fix it in the same change.

### Shared modules - reuse before writing

Component files are not util modules; cross-cutting helpers live in `lib/`:

| Module | Owns |
|---|---|
| `lib/format.ts` | `formatDate`, `formatTime`, `durationLabel`, `timeAgo`, `humanize` (snake_case to label), `formatReading` |
| `lib/waterLevel.ts` | `LEVEL_ORDER`, `maxLevel`, `levelConfig`, `isCalibrated` |
| `lib/proposals.ts` | proposal labels, diffing, `proposalTitle`, `shortValue` |
| `lib/descents.ts` | `uniqueSnapshotsBySeries`, `toPseudoSection` |
| `lib/geo.ts` | geometry math plus `lineCoords`/`pointCoords` narrowing |
| `lib/mapSearch.ts` | `EMPTY_MAP_SEARCH` (the map route's full search shape) |
| `lib/icons.ts` | every icon, one export per idea; never import `@mui/icons-material` elsewhere |

Date arithmetic - parsing a day, stepping days, counting them, month grids -
goes through `date-fns` (`parseISO`, `addDays`, `differenceInCalendarDays`),
never millisecond math on `Date.parse`: that reads a calendar day as UTC and
puts it on the day before anywhere west of Greenwich. Display strings stay on
`toLocaleDateString` via `lib/format.ts`.

Shared UI: `ConfirmDialog` (every confirmation - never `window.confirm`),
`components/states/` (`LoadingBox`, `EmptyState`, `ErrorState`,
`QueryStates`, `SignInGate`, `ErrorFallback`), `WaterLevelChip`,
`LevelDots`, `search/RiverRow`, `SwipeGhost`. Do not hand-roll a spinner
box, empty or error state, confirm dialog or sign-in gate.

A screen is assembled from these, not from raw MUI - they are what make a new
feature look like the product rather than like MUI:

| Piece | Use it for |
|---|---|
| `PanelHeader` | every detail panel: back arrow, bold title, grey subtitle, action icons right, and the segmented tab bar when it has views |
| `ListPaneHeader` | the opening line of every list pane: the count, and the list's own controls at the right edge - no title, the nav already names the list |
| `DockedAction` | a pane's primary action on desktop: one filled full-width button docked at the foot of the pane, below the list; phones keep the FAB |
| `Fact` (`factLabelSx`, `valueSx`) | a labelled value in a detail header - overline label, value beneath |
| `FormSection` | every block of a form: overline heading, one hint line, its own action in the heading |
| `PanelBottomBar` + `RoundActionButton` | a form's chrome: cancel left, title and status as subtitle, one round action right |
| `VisibilityPicker` | the private/shared/public choice and its audience |
| `SectionAdder` + `SectionDraftList` | picking an ordered list of sections |
| `DescentCard` | a descent in any list (`flush` where the list owns the rule and ground) |
| `RowMenu` | everything a list row can do - one overflow control with named actions, never a row of bare icons |
| `TimelineRail` | the dot-and-connector rail of a timeline entry (`hollow` for something not yet real) |

Before writing a new list row, header, form block or dialog, read
[doc/design.md](doc/design.md) and copy the nearest existing screen. Rows are
`ListItemButton` separated by a dimmed rule, not bordered cards; page-level
lists open with an overline label and a count; a tab's primary action is the
FAB on a phone and a `DockedAction` at the foot of the pane on a desktop,
never a button above the list; a row's actions are one `RowMenu`, not a
line of icons.

**Desktop is not a wide phone.** From `md` (the theme moves it down to **768**
from MUI's 900; it is the app's one phone-versus-desktop switch) the map is the
canvas: on the geography routes (`/`, `/logs*`, `/trips*`, `/proposals*`, `/waterways/suggest-section`) one
map fills the window under the app bar and the screen floats over it as cards.
The rules, built in `components/canvas/` (plan and reasons:
[doc/plans/wide-canvas.md](doc/plans/wide-canvas.md); user-facing description in
[doc/design.md](doc/design.md)):

- **One host.** `CanvasHost` in `__root.tsx` draws the only map. A route does
  not render a map; it describes one with `useCanvasScene(scene)`, a memoised
  `MapScene` (the `WaterwayMap` props, the camera without padding, and a
  `subject` to frame). Call it unconditionally; it is harmless on a phone,
  which keeps its own screens. A screen inside a route (the log
  form) stacks its own scene over the route's, and the route's returns when it
  unmounts; its picking happens on the host map.
- **Cards.** A route renders `FloatingCard`s inside `CanvasLayout`. Kinds and
  widths live in `tokens.canvas.cards`: `detail` 26% (340-440, resizable; 360 below 1280),
  `list` 20% (300-380), `side` 25% (400-600). The cards may cover 55% of the
  window, or 70% when a list card is among them; beyond that the lowest
  priority card folds to its header. The map page alone uses a `detail` card.
  Cards stack from the left: the list, then the item opened from it
  (`side="left"`); only an extra third card goes `side="right"`.
- **Header.** A card's header is supplied by the screen: `title`, `subtitle`,
  `actions`, `onClose`, or `selfHeaded` when the content brings its own panel
  header. A screen never shows a kind label above its own header.
- **Dock.** `ChartDock` places the chart along the foot of the free area from
  1280 wide, and as the first block of the detail card below that.
- **Free area.** The map area no card or dock covers (`useFreeArea`) is the
  fit padding for the subject. Map controls (zoom, compass, layer toggle,
  attribution) are inset into it through `chrome.inset`; never position a
  control by hand over a card.
- **Lines.** `drawing.sectionStates` marks sections `highlighted` (teal) or
  `ghost` (dim, not clickable); do not fake either with a joined preview line.

`WaterwayMap` takes its optional behaviour as three grouped objects rather
than loose props: `picking` (put-in/take-out and section selection),
`drawing` (feature vertices, preview and highlight lines) and `chrome`
(labels, control placement, gestures). A new map capability joins the group
it belongs to; only data and always-on callbacks stay top-level.

The map's layer JSX lives in per-concern components, not in `Map.tsx`:
`SectionLayers`, `FeatureGeoJSONLayers` (one implementation for confirmed
and proposed features, switched by the `proposed` flag), `DraftLayers` /
`FeatureDraftLayer`, `PickModeButtons`, `MapNumberMarker`, `RangeRingLayers`
(named places with the ground they reach), with click dispatch in
`useMapClickHandler` and the GeoJSON memos in `useMapSources`.
A new layer group joins one of these or becomes a new sibling.

### Query layer

- Every query key comes from a key factory (`waterwayKeys`, `proposalKeys`,
  `gaugeKeys`, `descentKeys`, `followKeys`, `groupKeys`, `tokenKeys`). No
  inline `["..."]` keys - a new domain gets a new factory in its hook module.
- Factories nest by prefix so invalidation prefixes work; bulk cache updates
  scope to `*.lists()`, never `*.all` (detail caches hold single objects).
- Server writes go through `useMutation` hooks in `lib/hooks/` with their
  invalidations inside. Never hand-roll `submitting`/`submitError` state
  around a raw api call.
- Debounce text inputs with `useDebouncedValue` before they hit a query key.

### Error handling

- The QueryClient's `MutationCache.onError` shows a global error snackbar -
  the floor for every mutation. A mutation whose caller renders the failure
  inline sets `meta: { errorHandledLocally: true }`.
- Surface server messages with `apiErrorMessage(err, fallback)` from
  `lib/api/client.ts`; never discard an `ApiError` into a bare generic
  string, and never leave a `catch` binding unused.
- The router has a `defaultErrorComponent`; route components may throw.
- A dialog that triggers a mutation stays open on failure so the user can
  retry or cancel.

### Types

- No `as never` and no `as unknown as GeoJSON.*`: the generated `Geometry`
  type is a discriminated union - narrow with `lineCoords`/`pointCoords` or
  a `type` check.
- No `any` (the codebase has zero).

### Theme and styling

- Static `import { theme, fonts, labelSx } from "@/lib/theme"` - not
  `useTheme()`. The app has a light and a dark scheme (System / Light / Dark,
  [doc/design.md](doc/design.md#dark-mode)); `tokens` are CSS variables, so
  one value serves both.
- Colors come from tokens, never a literal hex/rgba. A new colour is a token
  with a light and a dark value in `lib/theme.ts`, checked in both schemes.
  Transparency is `withAlpha(token, step)` from `lib/alpha.ts`, not a hex
  suffix. Where a resolved colour is needed (MapLibre paint, SVG strings,
  canvas, colour maths) use `useTokens()`; a `var()` does not reach those.
  `npm run check:colours` enforces this; a documented exception carries a
  `/* mask */` marker. Map-marker legibility shadows are the other exception.
- Radii, shadows, motion and touch sizes come from `tokens.radii`,
  `tokens.elevation`, `tokens.motion` and `tokens.touch`; no literal pixel
  radius, no hand-written `box-shadow` or transition duration. A circle is
  `borderRadius: "50%"`, a pill is `tokens.radii.pill`.
- Small labels spread `labelSx` (12px, semibold, sentence case) and override
  size/color, instead of re-declaring the block. No `textTransform:
  "uppercase"` and no monospace.
- Every touch target is at least `tokens.touch.min` (44px) in both directions;
  a smaller visual gets a larger hit area. Text inputs are 16px.

### Component shape

- Early returns over nested ternaries; a three-branch conditional render is
  a sub-component (see `map-page/MapCharts.tsx`).
- Keep prop lists small: a cluster of related props passed through a layer
  becomes one grouped object (see `WaterwayBrowsePanel`'s `featureTimeline`).
- Map-page components take the single `state: MapPageState` prop; new state
  clusters go into focused hooks (`useFeaturePicker`, `useMobilePanelState`,
  `useSuggestMode` pattern) rather than growing `useMapPageState`.
- A page that owns a multi-step form keeps its state in one hook next to the
  step components (`useSectionWizardState`, `useWaterwaySearchFilters`), so
  the route file is layout plus submit.

### Tests

`bun test` runs `*.test.ts` files next to their module. Pure logic gets
tests: formatting, level math, proposal diffing, payload builders. Both
`tsc -b` and biome cover them, so tests follow the same style rules as app
code. Component rendering is not unit-tested.

Every feature has a Playwright spec in `frontend/e2e/<feature>/` that checks
what the user can do and what the browser computes (tokens, sizes, no sideways
scroll), on the `phone` and `desktop` projects, and `@small` where a layout can
break at 320px. A spec is written with the feature, not after it, and each
guard in it is checked by removing the guard and watching it fail. Specs share
the seeded fixture: read-only tests run in parallel, a test that creates,
changes or deletes data is tagged `@write` in its title (one worker, puts the
data back), and a spec that samples frames or transitions is added to `TIMING`
in `playwright.config.ts`.

## Rust code style (api/)

- Keep names readable and consistent with Rust community conventions.
- Names short and concise, but descriptive enough to convey their purpose.
- Comments should be simple and clear, and should explain the purpose of the
  code rather than how it works.
- Comments should not have non-ASCII characters, and no hard-to-type symbols.

## API design

- Design for simplicity and ease of use.
- Stay consistent with Rust community conventions.
- Design for flexibility and extensibility, allowing future changes and
  additions without breaking existing code.
- Routes should not contain implementation details - they define the API
  contract. Keep the implementation in the query layer or service layer.
- **The query layer mirrors the route layout.** A feature whose routes are
  split into `routes/<x>/{mod,a,b}.rs` splits its queries the same way, into
  `query/<x>/{mod,a,b}.rs`, with `mod.rs` re-exporting so call sites stay
  `x::do_thing`. Trips are the worked example. A new table under a feature is
  a new pair of files, not another few hundred lines in an existing one.
- **A child is looked up inside its parent.** Anything reached through a
  parent's path (`/trips/{trip_id}/candidates/{candidate_id}`) is queried by
  both ids in the SQL. Ids are sequential, so a query on the child id alone
  lets a caller reach another parent's children through their own URL - and a
  check in the handler after the query does not undo a write that already
  happened.
- **A rule about other rows is checked under a lock.** "At least one admin"
  cannot be a check constraint, so count and write in one transaction that
  first locks the parent row (`FOR NO KEY UPDATE`). Two requests can each pass
  a lock-free count and both land. Where the rule can be structural instead -
  a vote or a linked log hanging off a membership through a composite foreign
  key - make it structural, so no code path can forget it.
- **One gate per question, in one file.** A feature's permission checks live
  together (`routes/trips/access.rs`), not one copy per route module. Two
  helpers that answer the same question in different files will drift; the
  status codes they return are part of the contract, so they have to agree.
- Follow the Microsoft REST API guidelines: plural noun collections, no verbs
  in paths, standard status codes, ISO 8601 UTC timestamps. Two deliberate
  deviations: JSON stays snake_case, and paging uses
  `page`/`per_page`/`total`/`total_pages` rather than `$top`/`$skip`.
- Anything owned by or about a user hangs off `/users`, never its own root
  collection. A collection that could describe somebody else takes the id in
  the path for **all** its methods (`/users/{user_id}/followers`), with `me`
  as the alias for the caller, so opening it up for profile views is an
  authorization change in `resolve_self` rather than a new route. Writes
  there stay the caller's own (403 otherwise). Data that can never describe
  another user says `me` outright - API tokens are credentials, so
  `/users/me/tokens` has no id form at all.
- Only data that exists *as* a user's possession or relationship moves under
  `/users` (follows, stars, tokens - no standalone id, no detail route). A
  first-class record that merely has an owner (a descent, a proposal) keeps
  its own collection and takes the owner as a filter instead
  (`/descents?user_id=`), so one listing owns pagination and every other
  filter. Such a filter narrows on top of the visibility rules, never
  around them.
- Every failure returns the envelope from `models`/`error.rs`:
  `{"error": {"code", "message", "target"}}`. Build one with `ApiError` and
  never return a bare status or a plain string.
- Validation failures are **400**, not 422. `ApiError::validation` is the only
  way to report one, so clients have a single status to handle.
- Internal faults use `ApiError::from_db`, which logs the cause and returns an
  opaque message. Do not put database errors in a response.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `RUN_MIGRATIONS` | `true` | Set to `false` to apply migrations as a separate step instead of on boot |
| `CORS_ALLOWED_ORIGINS` | any origin | Comma separated allowlist. Production leaves it unset: the API is public, usable by any site or script (decided 2026-10-24) |
| `RATE_LIMIT_PER_SECOND` | `20` | Per-address budget for every request, burst is five times this; `0` disables |
| `WRITE_RATE_LIMIT_PER_SECOND` | `1` | POST, PUT, PATCH and DELETE per signed-in user (per address when anonymous), burst 10; `0` disables |
| `EXPENSIVE_RATE_LIMIT_PER_SECOND` | `2` | Reads that can call Overpass, fill regions or sum long spans of readings, per address on top of the general budget, burst 10; `0` disables |
| `TRUSTED_PROXIES` | private ranges | Comma separated CIDRs of reverse proxies whose `X-Forwarded-For` / `X-Real-IP` are believed. Default: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1/128`, `fc00::/7`. From any other peer the headers are ignored |
| `MEDIA_DIR` | `media` | Where uploaded photos are written; production mounts a volume there. The directory is **not** covered by `pg_dump` - back it up separately |
| `OVERPASS_URLS` | public instances | Comma-separated Overpass endpoints tried in order; production puts the self-hosted instance (`deploy/overpass/`) first |
| `SEARCH_WORD_SIMILARITY_THRESHOLD` | `0.5` | How close a misspelling must be to still match a name |
| `VAPID_PRIVATE_KEY` | unset | Raw P-256 private key, base64url, for web push; the public key is derived from it. Unset (or `VAPID_SUBJECT` unset) turns push off, nothing else |
| `VAPID_SUBJECT` | unset | `mailto:` or `https:` contact that push services may reach about this server |

### Search

See [doc/search.md](doc/search.md) for the full reference. The two rules that
bite when editing:

- Add new searchable sources to the `searchable_names` view, not to the query.
- A migration that changes `public.search_key` must `REINDEX` the four
  `*_name_trgm` indexes in the same migration (enforced by
  `api/tests/migration_rules.rs`).

## Tests

- Write tests for all public functions and methods.
- Organize tests so they are easy to find and run.
- Write tests so they are easy to understand and maintain.

