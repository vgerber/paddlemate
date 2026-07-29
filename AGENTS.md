# Agent instructions

Shared guidance for all coding agents working on this repository.

## Documentation

The feature list lives directly on the main `README.md`; below it, a
Documentation table links the reference docs in `doc/` (setup, search,
translations, rivers-and-features) and `api/README.md`. Topic docs go deep on
one area each.

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

## Code style

- Do not use section divider comments (e.g. `// --- Gauges list ---`) to
  group code within a file; if a file needs sections, split it into modules.

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

