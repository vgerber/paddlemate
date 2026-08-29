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

### Choosing a gauge, and the catalog

When adding a section, the gauge picker searches **all available gauges across
every provider**, not just the ones already fetched. That works via a
`gauge_catalog` table — one lightweight row per station (name, river, params,
PostGIS point) synced from each reader's `list_stations()` by the
`sync_gauge_catalog` binary (run on a schedule; shipped in the API image).
The catalog holds no readings and is not polled.

Only when a catalog station is **linked to a feature** does it become a real
gauge: the water-range body carries either an existing `series_id` or a
catalog reference (`gauge_ref` = provider + station_id + param), and the apply
path (`resolve_or_create_series_for_ref`, hit by both direct creates and
proposal approvals) creates the `gauges` + `gauge_series` rows and marks the
gauge active. A background supervisor in `readers/mod.rs` then starts fetching
it **without an app restart** — each provider loop re-reads its active gauges
every cycle, the supervisor spawns a loop for a provider that gains its first
gauge, and a `Notify` cuts the inter-cycle sleep short so a freshly linked
gauge is polled within seconds. The picker recommends gauges already used on
the same river first (`GET /waterways/{id}/gauges`).

### Data sources and licenses

Every gauge is credited to the authority that publishes it, with a link to
the license or terms, wherever readings appear (gauges tab, gauge chart,
section chart). The pieces:

- `sources` holds one row per authority: name, website, the provider's
  verbatim `licensing_terms`, and a derived `license_name`/`license_url`
  pair. The derivation (`api/river-gauge/src/license.rs`) only names a
  license when the terms verifiably state one; most authorities state none,
  and then only their terms page is linked. `licensing_terms` remains the
  authoritative text and is shown as a tooltip.
- Rivermap gauges link per station via `gauges.data_source_id`, written by
  `import_rivermap` (re-run with `--only sources,stations` to refresh
  attribution without touching sections or readings).
- Directly-polled providers (`nve`, `bafu`, ...) have no per-station source;
  `provider_sources` maps each provider key to its authority, and source
  resolution falls back to it whenever `data_source_id` is NULL. New gauges
  therefore need no per-row bookkeeping.
- Hand-authored source rows use `provider:*` ids so a Rivermap import can
  never overwrite them. Re-check their terms occasionally; nothing refreshes
  them automatically. A `Reviewed <date>` comment in the migration records
  the last check - three rows (`provider:po/ehyd/rz`), so a manual re-read is
  proportionate.

Standing decisions on attribution, so they are not re-litigated:

- **Restricted licenses are displayed, not filtered.** Some authorities
  release under NonCommercial / NoDerivatives terms (CHMI is CC BY-NC-ND).
  paddlemate shows their current readings with the license named and linked,
  the same treatment every source gets. Rationale: the data is publicly
  released for public use, naming the license correctly is the compliant
  thing to do, and this is a non-commercial tool. If a provider's terms ever
  forbid display outright, drop it by removing its `provider_sources` row (or
  the gauges); the attribution makes such cases visible.
- **Redistributors are credited as the distributor.** Riverzone (`rz`) and
  eHYD aggregate other authorities' data; we credit the aggregator we
  actually fetch from, because the per-gauge underlying authority is not
  reliably known. Splitting `rz` per region is a future data-enrichment task,
  not a correctness fix.

## Who can change what

All community edits — new rivers, sections, features, translations — go
through **proposals**: submitted, reviewed and voted on before they are
applied. A proposal is reviewed on the map against what already exists: a
proposed feature is drawn on its section alongside that section's other
features, and a proposed section alongside the river's other sections, so
a reviewer can see that it fits and is not a duplicate. Admins can edit directly; the same endpoints turn a non-admin request
into a pending proposal where that flow exists (e.g. new rivers via "Can't
find your river? Add it").

## Internals

### Tables

| Table | Notes |
| ----- | ----- |
| `waterways` | `name` UNIQUE; `waterway_type` currently only `river` |
| `water_sections` | PostGIS LineString `location`, country, `regions` TEXT[] (valley, district, state - most specific first, derived from OSM), `river_km_start/end`; name UNIQUE per waterway |
| `features` | Point/LineString/Polygon `location`, `feature_type` enum (13 values, `api/src/models/feature.rs`), free-shape JSONB `metadata` |
| `feature_water_ranges` | feature × gauge series → `range_low/medium/high` cutoffs |
| `gauges` → `gauge_series` → `gauge_readings` | station → measurement type (level/discharge) → time series |
| `descents`, `descent_sections` | a log entry and the sections it covers (one descent can span several) |
| `proposals`, `proposal_votes` | community edit queue |
| `comments` | notes keyed by `(entity_type, entity_id)` - rivers, sections and features - with a `category` and a moderation `status` |
| `media` | photos, videos and linked write-ups keyed the same way (rivers today); an uploaded photo is a file under `MEDIA_DIR` addressed by `storage_key`, a video or blog is just an `external_url` |
| `waterway_osm_elements` | cached OSM elements per waterway (centerline way fragments today, bank polygons later); serves `GET .../waterways/{id}/geometry` so river snapping skips live Overpass |

### Conventions

- `metadata` is deliberately schema-free; the one key the UI reads today is
  `difficulty` (e.g. `"III+"`). New per-type attributes go into `metadata`
  first and get promoted to columns only when queried.
- The map falls back to the section line's endpoints when no `put_in` /
  `take_out` features exist (`frontend/src/components/map/mapLayers.ts`).
- Section water status endpoint: `.../sections/{id}/water-status`.
- Section regions and country come from OSM: the wizard's last step fetches
  a suggestion (`GET /geo/regions?line=`, which returns valley, district,
  state, range and country entries most specific first) into editable fields, and a
  background worker in the API (`api/src/regions.rs`, woken after a section
  create or proposal approval, newest sections first) fills both wherever
  they are still empty. Hand-edited values are never overwritten.
  `cargo run --bin derive_section_regions` remains for bulk backfills.
  Valleys are OSM lines, not polygons, so derivation uses proximity (2 km)
  for valley names and area containment for districts/states/mountain ranges
  and the country (admin_level 2 ISO code); with several sample points a
  valley needs at least two of them to agree, so side gorges near a single
  point don't flood the list.
- The browser never queries Overpass; all OSM geometry goes through the
  API. The API itself prefers the self-hosted rivers-only Overpass instance
  (`deploy/overpass/` - the OSM planet filtered to waterways, river areas,
  admin boundaries, valleys and mountain regions, served by
  `wiktorn/overpass-api` on the NAS), configured via `OVERPASS_URLS`; the
  public instances remain fallbacks. River centerlines are cached server-side per waterway:
  `GET .../waterways/{id}/geometry` fills a miss on demand with one
  server-side Overpass fetch (serialized, mirror fallbacks, IPv4-bound) -
  bounded by the sections' bbox, or by the request's `bbox` param for a
  waterway without sections - and extends the cache when a requested area
  falls outside what is stored. `cargo run --bin fetch_osm_geometry` bulk
  backfills; `DELETE` on the endpoint (admin) invalidates one river.
  Confluence routing uses `GET /geo/river-segments?line=&radius_m=` (a live
  server-side lookup for river segments around a corridor, not cached).
### Notes and media

A comment is a **note with a category**, following the vocabulary
[Riverzone](https://api.riverzone.eu/doc/v2/) uses for the same job: a tree
across the channel (`danger_temporary`) is not a trip report (`info`), and
the two must not read alike. The set is `urgent`, `danger_temporary`,
`danger_cleared`, `danger_permanent`, `calibration`, `difficulty`,
`current_conditions`, `regulations`, `logistics`, `info`.

Notes also carry a moderation `status`: `ok`, `merged`, `outdated`, `spam`.
`merged` is the useful one - an editor folded the note into curated data (a
feature, a description), so it can leave the thread without being deleted.
`spam` is filtered from every response; the others are returned so a client
can fold them away. Only an admin can set it, via
`PUT .../comments/{id}/status`.

One media list covers uploads and links, as whitewater.guide's does:
`kind` is `photo`, `video` or `blog`. A photo is a file we store; a video
or blog is somebody else's URL. Items carry `copyright`, `license_name` and
`license_url` - the same duty we already take for gauge sources - plus a
`weight` for gallery order.

`POST /waterways/{id}/media` takes multipart: `kind`, then either a `file`
(photo) or a `url` (video, blog), with optional `caption`, `copyright`,
`license_name`, `license_url` and `weight`. An uploaded photo is decoded and
re-encoded, which strips EXIF (phone photos carry GPS), caps the long edge
at 1600px and writes a 400px thumbnail beside it; decoding is also the
validation, so a file that is not really an image is rejected whatever its
`Content-Type` claimed. Files are served from `/media/{key}` with immutable
cache headers.

Photos can be posted **inside a note**: upload first, then create the
comment with the resulting ids in `media_ids` (whitewater.guide's two-step,
applied to notes). A note only adopts media the caller uploaded, that
nobody has claimed, and that belongs to the same river. Deleting the note
deletes those files with it.

The gallery is curated and a note is somebody's field report, so
`GET .../media` returns only items added straight to the river;
`?include_from_notes=true` adds the ones posted in notes.

Two things keep the pieces from drifting apart, because `comments` and
`media` are keyed by `(entity_type, entity_id)` and no foreign key can
express that:

- **Delete triggers** on `waterways`, `water_sections` and `features`
  remove the notes and media attached to a row as it goes, whatever deleted
  it - the admin endpoint, a proposal approval, or a hand-written statement.
- **A daily sweeper** (`media::sweep_orphans`) deletes files under
  `MEDIA_DIR` that no row points at. The database is the source of truth
  and the filesystem is reconciled to it, which also covers a crash between
  writing a file and inserting its row. Files younger than 15 minutes are
  left alone so an upload in flight is never swept out from under itself.

Because the bytes live outside Postgres, `pg_dump` is no longer a complete
backup - `MEDIA_DIR` needs its own.
- Full ER diagram: [api/README.md](../api/README.md).
