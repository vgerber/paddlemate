# Paddlemate frontend

The React + TypeScript + Vite single-page app (TanStack Router and Query, MUI,
MapLibre). It talks to the API in `../api` (default `http://localhost:3000`).

```sh
bun install
bun run dev        # http://localhost:5173
```

Type-check, lint and test with the gates in [AGENTS.md](../AGENTS.md) (`npx tsc -b --force`, `npx biome check src e2e`, `bun test`).

- [AGENTS.md](../AGENTS.md) - conventions for the frontend code and the gates
- [doc/setup.md](../doc/setup.md) - running the whole stack (database, auth, API)
- [e2e/README.md](e2e/README.md) - the Playwright specs and how to run them
