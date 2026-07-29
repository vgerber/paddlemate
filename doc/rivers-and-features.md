# Rivers, sections and features

Everything on the map hangs off one hierarchy:

```
River (waterway)
└── Sections        the stretches you actually paddle
    └── Features    what's on them: rapids, hazards, access points
```

A **river** is the whole waterway. A **section** is a named, paddleable stretch
of it — "Wellerbrücke", "Ötz Stadtstrecke" — with its own difficulty, water
status and logbook. A **feature** is a point, line or area on a section: a
rapid, a weir to portage, the put-in.

## Sections

Each section is a line on the map with a put-in and a take-out. Sections carry:

- **Difficulty** — the whitewater grade (I–VI), shown in map labels and
  filterable in search.
- **Water status** — `empty | low | medium | high`, derived from a live gauge
  (below). Colors the access markers and the chip in the section list.
- **Translations** — names and descriptions per language, see
  [translations](translations.md).
- **Logs (descents)** — who paddled it and when; shown as a count badge, a list
  in the section view, and shaded bands on the gauge chart.
- Comments and favorites.

## Features

| Type | Meaning |
| ---- | ------- |
| `whitewater` | A rated stretch; its `difficulty` is the section's grade |
| `put_in`, `take_out` | Access points; without them the section line's endpoints are used |
| `hole`, `siphon`, `strainer`, `waterfall`, `obstacle` | Hazards |
| `weir`, `dam`, `bridge` | Structures |
| `portage` | Carry around |
| `freestyle_spot` | Play spot |

Features are named per language, and rapid names are searchable — typing a
famous rapid finds its river (see [search](search.md)).

## Water levels

Gauges are measurement stations fetched from the agencies' public services
(one reader per agency in `api/river-gauge/`). A feature can define per-gauge
**water ranges** — the readings at which it is low, medium or high — and the
latest reading classified against those ranges is the section's water status.
The section view charts the readings and overlays your descents, so you can
see the level you paddled at.

## Who can change what

All community edits — new rivers, sections, features, translations — go
through **proposals**: submitted, reviewed and voted on before they are
applied. Admins can edit directly; the same endpoints turn a non-admin request
into a pending proposal where that flow exists (e.g. new rivers via "Can't
find your river? Add it").

## Internals

### Tables

| Table | Notes |
| ----- | ----- |
| `waterways` | `name` UNIQUE; `waterway_type` currently only `river` |
| `water_sections` | PostGIS LineString `location`, country/region, `river_km_start/end`; name UNIQUE per waterway |
| `features` | Point/LineString/Polygon `location`, `feature_type` enum (13 values, `api/src/models/feature.rs`), free-shape JSONB `metadata` |
| `feature_water_ranges` | feature × gauge series → `range_low/medium/high` cutoffs |
| `gauges` → `gauge_series` → `gauge_readings` | station → measurement type (level/discharge) → time series |
| `descents`, `descent_sections` | a log entry and the sections it covers (one descent can span several) |
| `proposals`, `proposal_votes` | community edit queue |

### Conventions

- `metadata` is deliberately schema-free; the one key the UI reads today is
  `difficulty` (e.g. `"III+"`). New per-type attributes go into `metadata`
  first and get promoted to columns only when queried.
- The map falls back to the section line's endpoints when no `put_in` /
  `take_out` features exist (`frontend/src/components/map/mapLayers.ts`).
- Section water status endpoint: `.../sections/{id}/water-status`.
- Full ER diagram: [api/README.md](../api/README.md).
