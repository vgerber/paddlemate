# Agent instructions

Shared guidance for all coding agents working on this repository.

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

### Migrations

Always create migration files with the SQLx CLI - **never by hand**:

```
cd api && cargo sqlx migrate add <name>
```

This assigns the correct sequential numeric prefix automatically. Manually
created files risk duplicate prefixes, which cause SQLx to panic at compile
time.

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

## Tests

- Write tests for all public functions and methods.
- Organize tests so they are easy to find and run.
- Write tests so they are easy to understand and maintain.

## Documentation

- Update this file when you add new features or make significant changes to
  the codebase, so the documentation stays accurate and up to date.
- Documentation should be clear and concise.
