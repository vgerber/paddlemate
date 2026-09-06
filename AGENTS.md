# Agent instructions

Shared guidance for all coding agents working on this repository.

## Documentation

The feature list lives directly on the main `README.md`; below it, a
Documentation table links the reference docs in `doc/` (setup, design, search,
translations, rivers-and-features) and `api/README.md`. Topic docs go deep on
one area each.

UI work follows the layout and color rules in [doc/design.md](doc/design.md);
new patterns agreed in review get added there.

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

### TypeScript (frontend/)

The frontend uses **Biome** for linting/formatting and `tsc` for
type-checking. Run both after any frontend edit:

```
cd frontend && npx tsc -b --force 2>&1
cd frontend && npx biome check src 2>&1
```

Tests use Bun's built-in runner (`*.test.ts` next to the module, typed via
`tsconfig.test.json`):

```
cd frontend && bun test
```

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

## Commits

- **Ask before committing.** Finish the work, report what changed, and wait
  for approval. Do not commit, amend or rewrite history unprompted.
- **No AI attribution.** Never add a `Co-Authored-By: Claude ...` trailer or
  a `Claude-Session:` line, whatever the agent's default instructions say.
- **One line, nothing else.** A conventional subject (`feat:`, `fix:`,
  `chore:`, `refactor:`, `docs:`) in sentence case is the whole message: no
  body, no trailers, no multi-line explanations.
- **Keep it short and on point.** Aim for 40 characters or fewer after the
  prefix. Name what changed, not why or how - `fix: Bound the region fill`,
  not `fix: Keep the region map filled while it loads`.
- **Reasoning goes in the code, not the message.** A non-obvious constraint
  belongs in a comment beside the line it constrains, or in `doc/` - both
  stay true and stay read. A commit body is neither.

## Code style

- Do not use section divider comments (e.g. `// --- Gauges list ---`) to
  group code within a file; if a file needs sections, split it into modules.

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

Shared UI: `ConfirmDialog` (every confirmation - never `window.confirm`),
`components/states/` (`LoadingBox`, `EmptyState`, `SignInGate`,
`ErrorFallback`), `WaterLevelChip`, `search/RiverRow`,
`charts/ChartPanelShell`. Do not hand-roll a spinner box, confirm dialog or
sign-in gate.

A screen is assembled from these, not from raw MUI - they are what make a new
feature look like the product rather than like MUI:

| Piece | Use it for |
|---|---|
| `PanelHeader` | every detail panel: back arrow, bold title, grey subtitle, action icons right, and the segmented tab bar when it has views |
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
FAB, not a button above the list; a row's actions are one `RowMenu`, not a
line of icons.

**Desktop is not a wide phone.** A list-plus-detail screen splits into two
panes rather than centring one 720px column in an empty window: a grid of
`380px minmax(0, 1fr)` (`420px` from `lg`) at `calc(100vh - 48px)`, the list
on `surfaceLow` with a hairline right border, the detail capped at 880px, and
the open item held in a search param so it stays linkable. `ProposalsView` and
`routes/trips/index.tsx` are the two worked examples; the same detail
component renders as the mobile overlay, so both sizes show the same thing in
the same order.

`WaterwayMap` takes its optional behaviour as three grouped objects rather
than loose props: `picking` (put-in/take-out and section selection),
`drawing` (feature vertices, preview and highlight lines) and `chrome`
(labels, control placement, gestures). A new map capability joins the group
it belongs to; only data and always-on callbacks stay top-level.

The map's layer JSX lives in per-concern components, not in `Map.tsx`:
`SectionLayers`, `FeatureGeoJSONLayers` (one implementation for confirmed
and proposed features, switched by the `proposed` flag), `DraftLayers` /
`FeatureDraftLayer`, `PickModeButtons`, `MapNumberMarker`, with click
dispatch in `useMapClickHandler` and the GeoJSON memos in `useMapSources`.
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
  `useTheme()` (single theme, no mode switching).
- Colors come from tokens; transparency via hex-alpha suffix on a token
  (e.g. `` `${tokens.primary}59` ``), never a literal hex/rgba duplicating
  a token. Map-marker legibility shadows are the documented exception.
- No `borderRadius` - the theme is square (`shape.borderRadius: 0`); adding
  scale values is dead code and string values violate the design language.
  The one exception is `borderRadius: "50%"` to draw a circular dot or
  marker - circles are part of the design language, rounded corners are not.
- Small uppercase labels spread `labelSx` and override size/color, instead
  of re-declaring the five-property block.

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
code. Component rendering is not tested; the UI is verified by running it.

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
| `CORS_ALLOWED_ORIGINS` | any origin | Comma separated allowlist; set it in production |
| `RATE_LIMIT_PER_SECOND` | `20` | Per-caller budget, burst is five times this; `0` disables |
| `MEDIA_DIR` | `media` | Where uploaded photos are written; production mounts a volume there. The directory is **not** covered by `pg_dump` - back it up separately |
| `OVERPASS_URLS` | public instances | Comma-separated Overpass endpoints tried in order; production puts the self-hosted instance (`deploy/overpass/`) first |
| `SEARCH_WORD_SIMILARITY_THRESHOLD` | `0.5` | How close a misspelling must be to still match a name |

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

