# Search

Find a river by any name it goes by — its own name, a section, a translated
name, or a famous rapid — spelled the way you remember it.

## What you can type

| You type       | You find        | Because                                     |
| -------------- | --------------- | ------------------------------------------- |
| `soca`         | Soča            | Accents are optional                        |
| `oetztaler`    | Ötztaler Ache   | Digraph spellings (`oe`, `ue`, `ae`, `ss`) count as the letter |
| `weissenbach`  | Weißenbach      | Same rule for ß                             |
| `wellerbr`     | Ötztaler Ache   | Section names are searched too              |
| `riesenschl`   | Ötztaler Ache   | Rapid names are searched too                |
| `teufelsstrom` | Vltava          | Translated names are searched too           |
| `salzah`       | Salzach         | Typos are tolerated from 4 characters up    |

Names in non-Latin scripts (e.g. Cyrillic) are matched as written, ignoring
case.

## How results are presented

- Results are ordered by how well they match: an exact name first, then names
  starting with the term, then names containing it, then approximate matches.
- Approximate matches appear under a **Similar names** divider, so a typo
  correction is never mistaken for an exact hit.
- Under each name is where it is — country, then the most telling regions it
  lies in, e.g. `AT · Bezirk Imst · Ötztal`. A river name on its own rarely
  says which of the world's rivers it is. Sections read the same way, so both
  tabs answer "where" the same.
- When a river matched through something other than its own name, the row also
  says why — e.g. `Rapid: Wellerbrücke - Riesenschlucht` or
  `DE name: Teufelsstrom`.
- The **Sections** tab lists the sections that matched; if a river matched by
  its own name, all of its sections are shown. A section that matched through
  a rapid names it beneath its location rather than in place of it.

Search starts at 2 characters. Typo tolerance starts at 4, so very short terms
only match exactly.

## Filters and tabs

The search screen has three tabs: **Name**, **Area** and **Region**. A
**Filters** sheet holds country, grade and **Water now** (low, medium, high).
The chosen water levels are kept in the URL (`water`), so a filtered search can
be linked or reloaded.

## Searching by place

Area and Region are the two ways to search without typing a name:

- **Area** — click the map to drop a centre, then set a radius. Rivers with a
  section inside the circle are listed.
- **Region** — switch to region mode and the map becomes the picker: every
  valley, district, state and mountain range in view is outlined and
  labelled, and clicking one lists the rivers reaching into it. You see one
  kind at a time, following the zoom - states when you are looking at a
  country, then mountain ranges and districts, then valleys once you are
  down at river level. The map stays quiet so the picked region is the only
  thing that stands out: every boundary is one thin grey line, so an edge two
  regions share reads once, with a faint fill inside that only has to catch
  your click. Picking a region opens a sheet with its name, the kind of region, the rivers
in it and, under "Part of", the larger regions it sits in; before a pick the
sheet holds chips to limit the map to one kind of region. In region mode the
base map's roads fade to 40% and their names, shields and one-way arrows are hidden, until you leave region mode. Each region has one name, set at its visual centre - the
  point deepest inside its shape, not the middle of its bounding box. A
  valley has no outline, so it is a soft band along the valley floor. Clicking
  ground that several regions share lists them and lets you say which you
  meant; each row names the country and the kind of region. The region you
  picked is the only thing drawn in teal, with its name; the rest stay grey.
  Two rules keep the map readable. A mountain range that holds two or more
  other ranges is left out, since they already show the same ground. And a
  region much smaller than the view (under about 0.3% of it) waits until you
  zoom in, because it is a speck you could neither read nor hit.
  Searching by name works too, and tolerates the same misspellings as river
  names, so `otztal` finds `Ötztal` and `Tirool` finds `Tirol`. An English
  country name (`Austria`, `Switzerland`) lists that country's regions, states
  first, after any region whose own name matches. The picker names each
  region's country first, so a list of valley names still tells you where you
  are. A range that straddles a border is labelled with the country holding
  most of its area.

Country borders stay drawn over everything else at every zoom, so the map
always says which country you are looking at. They are a dash-dot line over a
white edge, so they are never taken for a region's solid grey line, and the
country's code (`AT`, `DE`) is printed along the line.

On a phone the panel covers the map, so choosing **Area** or **Region** steps
it aside and leaves a strip along the bottom: what is picked so far, and the
button back to the results.

Region membership is geometric, not by label: a river inside the Ötztal is
found whether or not its sections happen to carry that region name. A valley
has no outline in OpenStreetMap - it is a line along the valley floor - so
the map draws a corridor along that line. The filter is more forgiving than
the corridor looks, because OSM often traces one side of a valley rather
than its middle, so a river can count as being in a valley while sitting a
little outside the shape drawn for it.

You are not limited to regions somebody has already used. The first time the
map shows a stretch of ground, its regions are fetched from OpenStreetMap in
the background and kept, so they appear a moment later and instantly on every
later visit.

## Configuration

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `SEARCH_WORD_SIMILARITY_THRESHOLD` | `0.5` | How close a misspelling must be to count, 0–1. Lower finds more, with more noise. |

Set on the API; no deploy needed to change it.
`scripts/tune_search_threshold.sql` measures recall and noise across candidate
thresholds against a restored database dump.

## Internals

### One view lists everything searchable

`searchable_names` (introduced in `api/migrations/00023_search_normalization.sql`,
current definition in `00026`) unions every name a waterway can be found by and
resolves each to its waterway:

| Source         | Meaning                          |
| -------------- | -------------------------------- |
| `waterway`     | The river's own name             |
| `section`      | A section's own name             |
| `section_name` | A translated section name        |
| `feature_name` | A rapid/feature name             |

New searchable sources are added to this view, not to the query.

### Normalization: `search_key`

Stored names and the query both pass through `public.search_key`: lowercase,
diacritics removed (`unaccent`), German digraphs folded (`ss`→`s`, `oe`→`o`,
`ue`→`u`, `ae`→`a`). Applied to both sides it can only merge spellings, never
hide a match. Punctuation and non-Latin characters are left alone — a
`[^a-z0-9]` whitelist would erase Cyrillic names.

The normalization exists three times and must agree:

| Where | File | Guarded by |
| ----- | ---- | ---------- |
| SQL   | `public.search_key` (migration `00023`) | `api/tests/sql/search_key_assertions.sql`, run in CI |
| TypeScript | `frontend/src/lib/text.ts` `searchKey()` | `frontend/src/lib/text.test.ts` (same cases as the SQL side), run in CI |
| Rust  | `api/src/models/lang.rs` (language codes only) | unit tests |

### Ranking

`api/src/query/waterways.rs::search` ranks each waterway's best match by tier —
exact (0), prefix (1), substring (2), fuzzy (3) — then by source specificity
(waterway > section > translation > rapid), then trigram similarity. Rows carry
`matched_name`, `matched_source`, `matched_lang`, `matched_section_name` and
`fuzzy` for the frontend. Each row also carries `place`: the country of its
sections plus up to two region names, picked most specific first (a valley
identifies a river, the state it is in barely narrows anything) but returned
least specific first so the client can print them as an address. Fuzzy matching engages at `FUZZY_MIN_CHARS = 4`; the
similarity cutoff is set per database connection in `api/src/main.rs`.

### Indexes, and the one rule

Four GIN trigram indexes back the search (`00024_search_name_indexes.sql`),
one per name source. They are *expression* indexes on `search_key(name)`: the
index stores the function's **output at write time**, not the formula.

Therefore **a migration that changes `search_key` must `REINDEX` those four
indexes in the same migration** — otherwise existing rows keep the old
normalization while new rows get the new one, and searches silently miss
results. Only long-lived databases are affected; a fresh database (CI, new dev
checkout) rebuilds its indexes from the current function and looks healthy,
which is why no runtime check can catch it. `api/tests/migration_rules.rs`
enforces the rule in `cargo test`.

### Region search and borders

Regions are not waterways, so they are searched in `query::regions::search`
rather than through `searchable_names`: `idx_regions_name_trgm` is a trigram
index on `search_key(name)` (`%>` with the same threshold as river names,
from 4 characters), and `country_names` holds English names and aliases per
ISO code. The migration does not change `search_key`, so no `REINDEX`.

The country borders in `/geo/region-outlines` clip the boundary line to the
viewport; the neighbour on the far side comes from `country_borders`, one row
per country pair holding the stretch of border between them. A trigger on
`regions` keeps it current whenever a country row is inserted, changed or
deleted (`refresh_country_borders`). A distance test against whole country
polygons took about a minute at Europe scale; the lookup answers in well
under a second at any span.

### How the region map is drawn

The rules live in `frontend/src/components/map/regionGeometry.ts` (pure, tested
in `regionGeometry.test.ts`) and the layers in `RegionLayers.tsx` and
`CountryBorderLayer.tsx`; `useMapSources.ts` ties them to the viewport.

| Rule | Where |
| ---- | ----- |
| A range holding `MAX_NESTED_RANGES` (2) or more other ranges is not drawn; bounding boxes stand in until the API answers containment | `visibleRegions` |
| A region under `MIN_VIEW_SHARE` (0.003) of the view area is not drawn | `visibleRegions` |
| The picked region is never hidden by either rule, and has its own source so panning it out of the viewport does not remove it | `visibleRegions`, `RegionLayers` |
| Road lines (not rail) fade to `MUTED_ROAD_OPACITY` (0.4), road names, shields and one-way arrows are hidden, only while region mode is on; restored after, reapplied after a style swap | `useMutedBaseMap.ts` |
| One label per region at the pole of inaccessibility of its biggest part, or the middle of its longest line; computed with the `polylabel` library, cached per geometry; 12px `onSurfaceVariant` on a white halo, the picked one 13px bold teal | `labelPoint` |
| Every boundary: 1px `onSurfaceVariant` line, fill at 4% opacity (not for valleys) | `region-browse-line`, `region-browse-fill` |
| Valleys: a 14px blurred line band at 14% opacity, no outline | `region-valley-band` |
| Picked region: `mapSelectedLine` fill at 12% and a 2.5px line, label in the same colour; a region whose row has focus in the choice card is lit the same way | `region-picked-*`, `region-lit-*` |
| Country borders: dash-dot `mapCountryBorder` line over a white casing, `country` property as a line label | `CountryBorderLayer` |
