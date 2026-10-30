# Material wiki

The gear catalog paddlers keep between them: one entry per boat, searchable
by name, and comparable side by side. Kayaks are what it holds today; canoes,
packrafts and SUPs share the same fields.

Open it from **Tools → Material wiki**, or go straight to `/materials`.

Measurements show, and are typed, in the units chosen under Settings > Units
(cm or in, litres or US gallons, kg or lb); they are saved in metric.

## Finding a boat

Type a brand or a model into the search field. Spelling is forgiving the same
way the river search is - `pyrhana` finds Pyranha - and typo tolerance starts
at four characters.

The **Filters** chip opens a sheet with the dimensions that narrow a list of
boats; each one set shows as a chip under the search field that takes itself
away:

| Filter | Keeps |
| --- | --- |
| Category | Kayaks, canoes, packrafts or SUPs |
| Discipline | What the boat is built for - creek, river runner, half slice, playboat, slalom, downriver, touring, sea, expedition, recreational |
| Construction | Plastic, composite, inflatable, folding or wood |
| Brand | One brand, with the number of entries it has |
| Fits paddler | Your body weight in your weight unit (Settings > Units), keeping the boats whose paddler range covers it |
| Sort | Name, newest, or by length, volume or weight |

A boat that states no paddler range is kept by the **fits paddler** filter:
saying nothing is not the same as saying it does not fit.

The filters and the search live in the address bar, so a narrowed list is a
link you can send.

## Comparing

Tick the boats you want on the list - up to eight - and press **Compare**
(two are the least that compare).
The comparison puts one boat per column and one property per row, grouped
into overview, hull, cockpit and paddler.

Rows where the boats actually differ carry the value color; rows where they
all say the same thing stay plain, and a row no boat states at all is left
out. The three sizes of one model, side by side, are the case this is built
for: what changes between S, M and L is exactly what stands out.

The comparison is its own link too (`/materials/compare?ids=...`), and a
column can be dropped from the table without going back to the list.

## Adding and correcting

Any signed-in paddler can add an entry and correct any entry - it is a wiki,
not a catalog of one person's boats. Brand and model are all that is
required; every measurement is optional, and the next reader can fill in
what is missing. The entry keeps who added it and who last edited it.

Input is bounded: names 80 characters, the description 4000, the link 500
and a web link only (`http://` or `https://`), years 1900 to 2100, and every
measurement positive and below a ceiling no real boat reaches (a 2000 cm
length, a 500 kg weight). One user can add 30 entries a day; corrections are
not counted.

Only an admin can delete an entry: an edit the next reader can correct
again, a deletion takes the entry away from everyone.

The same brand, model and variant can only exist once. Case and spacing do
not create a second entry - "pyranha firecracker" and "Pyranha Firecracker"
are the same boat.

## Internals

### Storage

One table, `materials` (migration `0055_material_wiki.sql`). Every category
in it is a boat, so they share one set of hull columns; a category whose
specs have nothing in common with these - a paddle, a drysuit - gets its own
extension table keyed on `material_id` rather than more nullable columns.

Three Postgres enums type an entry: `material_category`,
`material_discipline` and `material_construction`. Measurements are
`DOUBLE PRECISION`, one unit per column and the unit in the column name
(`length_cm`, `volume_l`, `weight_kg`), so a comparison never converts
anything. The app converts for display and input only (`lib/units.ts`).

| Constraint | Enforces |
| --- | --- |
| `materials_identity_key` | One entry per brand/model/variant, case- and space-insensitive |
| `chk_materials_years` | `year_to >= year_from` |
| `chk_materials_paddler` | `paddler_weight_max_kg >= paddler_weight_min_kg` |
| `chk_materials_positive`, `chk_materials_ceiling` | Every stated measurement is greater than zero and below its ceiling |
| `chk_materials_brand`, `_model`, `_text` | Name and text lengths |
| `chk_materials_year_range` | Years 1900 to 2100 |

`MaterialBody::validation_error` (`api/src/models/material.rs`) checks the
same rules before the insert, so a bad entry comes back as a 400 naming the
field rather than as an opaque constraint failure.

`idx_materials_name_trgm` is a GIN trigram index on
`public.search_key(brand || ' ' || model)` - the same expression the query
uses, and the same normalization the river search runs on. It is therefore
one of the `*_name_trgm` indexes that a migration changing `search_key` must
`REINDEX`; see [search.md](search.md).

### API

All under `/api/v1/materials`. Reads are public; writes need a signed-in
caller.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/materials` | Paginated search - see the filters below |
| GET | `/materials/brands` | Brands with entry counts, `category` narrows them |
| GET | `/materials/{material_id}` | One entry |
| POST | `/materials` | Add an entry (any signed-in user); 409 on a duplicate |
| PUT | `/materials/{material_id}` | Replace an entry (any signed-in user) |
| DELETE | `/materials/{material_id}` | Admin only |

The list takes `q`, `category`, `discipline`, `construction`, `brand`,
`min_length_cm`/`max_length_cm`, `min_volume_l`/`max_volume_l`,
`min_weight_kg`/`max_weight_kg`, `fits_paddler_kg`, `sort` and the usual
`page`/`per_page`.

`ids` is the comparison's own filter: a comma separated list that returns
exactly those entries, in the order given, ignoring every other filter and
paging; a malformed list or more than `MAX_COMPARE_IDS` (8) ids is a 400.
`q` and `brand` longer than 100 characters are a 400, `page` is clamped to
10000 and `per_page` to 100. The daily cap on new entries is
`MAX_NEW_PER_DAY` in `api/src/query/materials.rs`; the count and the insert
run under a per-user advisory lock, and the 31st is a 429.

With a query text and the default name sort, results are ranked the way the
river search ranks them - exact, prefix, substring, fuzzy, then trigram
similarity, with fuzzy matching from four characters up. Asking for a
measurement sort overrides that; measurement sorts put the entries that do
not state the measurement last.

### Frontend

| Module | Owns |
| --- | --- |
| `lib/materials.ts` | `MATERIAL_SPECS` (the one list of comparable measurements), labels, `specSpread`, the comparison's id list, the URL search shape, and the entry form's value conversion |
| `lib/hooks/useMaterials.ts` | `materialKeys` and every query and mutation |
| `components/materials/` | `MaterialsView` (list), `MaterialRow`, `MaterialFiltersSheet`, `MaterialDetailView`, `ComparisonTable`, `MaterialForm`, `WikiPage` (the frame) |
| `routes/materials/` | `index` (list), `$materialId` (detail, `?edit=true` for the form), `compare`, `new` |

The wiki is a normal page, not a map screen: a centred column on a desktop,
edge to edge on a phone, reached from Tools. The list pages 24 at a time
("Show more"). Specs: `frontend/e2e/materials/`.

Adding a measurement is one row in `MATERIAL_SPECS` plus its column: the
list row, the detail view, the comparison and the entry form all read that
list.

The dev fixture in `.claude/skills/test-data/` seeds ten entries (ids
9851-9860), including one model in three sizes for exercising the
comparison.
