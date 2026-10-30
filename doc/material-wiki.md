# Material wiki

The gear catalog paddlers keep between them: one entry per boat, searchable
by name, and comparable side by side. It ships with a researched catalogue of
whitewater kayaks and paddles (see Catalogue below); canoes, packrafts and
SUPs share the kayak fields.

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

## Catalogue

About 530 whitewater kayaks and 170 paddles come pre-filled, each size and
shaft type as its own entry. They carry colourways as the maker names them,
and a link to the page each value came from. Where a year rests on a weak
source (an archive's first capture, a listing year, a search snippet) the
entry says so, and the app shows "about <year>" instead of a hard date.

Product photos are mirrored: the server downloads them from the maker's page
into its own storage, never into the source repository, and every photo keeps
the maker's name and a link back to the page it came from. An admin can take
down one photo, or every photo of a brand; a taken-down photo is deleted and
never fetched again. The photos arrive gradually after an update (one request
per site every two seconds), so a fresh install shows entries without photos
for a while.

An entry a user has corrected is never overwritten by a later import of the
catalogue.

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
anything. The app converts for display and input only (`lib/prefs/units.ts`).

| Constraint | Enforces |
| --- | --- |
| `materials_identity_key` | One entry per brand/model/variant, case- and space-insensitive |
| `chk_materials_extra_text`, `chk_materials_paddle` | Colour, notes and source sizes; paddle sizes, pieces, lengths and feather angles |
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

### Catalogue storage

Migration `0056_materials_catalogue.sql` adds the `paddle` category, the
`crossover`, `freestyle` and `other` disciplines, the paddle spec columns
(`blade_area_cm2`, `lengths_cm`, `shaft`, `shaft_material`, `feather_deg` and
so on, filled only for paddles; a boat that sends one gets a 400), `colors`,
`year_approximate`, `sources` (field name to URL) and `notes`. The identity
key now includes the category. `PUT` replaces every field, the new ones
included; a client that omits `colors` clears them.

`0057_materials_catalogue_seed.sql` is generated, never edited: run
`python3 -I scripts/materials/build_seed.py` on `data/materials/{kayaks,paddles}.json`
(facts and links only, no images). It upserts by category, brand, model and
variant, owned by the `system-catalogue` user, and only touches rows where
`updated_by` is NULL, so a re-run changes nothing and keeps user edits. Values
the schema refuses become NULL with the original in `notes`; a paddle sold with
a straight and a bent shaft becomes one entry per shaft (the second without
weight). `year_approximate` is set when the year source is Playak or the
archive, or the notes call the year weak. `system-catalogue` is hidden from the
user list.

`material_images` holds one row per link: `status` is `pending`, `fetched`,
`failed` or `removed`, `host` is the link's host, `file` the stored key.
`material_image_hosts` holds hosts on a 24 hour cooldown.

### Photo mirror

`api/src/jobs/material_images.rs`, started with the other background jobs
unless `DISABLE_MATERIAL_MIRROR=true`. Each round takes the oldest pending
photo of up to eight hosts that are not on cooldown and fetches them in
parallel; rounds are two seconds apart, so a host sees one request per two
seconds. Rules, each tested in `api/tests/material_images.rs`:

| Rule | Detail |
| --- | --- |
| Allowlist | Only hosts of the seeded links; the link's host must equal the row's host; https only; redirects (at most 3) are followed only to allowed hosts |
| Limits | 10 s timeout, 5 MB (streamed, then checked), `image/*` except SVG |
| Storage | `media::store_image` decodes and re-encodes (JPEG, at most 1600 px, plus a 400 px thumbnail), which strips metadata |
| Refusal | A 403 or 429 puts the host on cooldown for 24 hours; the rest of its photos stay pending. `robots.txt` is not read |
| Failure | 4xx other than 403/429, a non-image, an oversized or undecodable body fail the photo; timeouts and 5xx retry up to 3 times |
| Takedown | Sets `removed`, deletes the files; a takedown during a download deletes the new file again |

`media::sweep_orphans` counts `material_images.file` as known, so the daily
sweep keeps the mirrored files. PNG transparency is flattened to black by the
shared re-encoder.

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
| DELETE | `/materials/{material_id}/images/{image_id}` | Take down one photo (admin); 404 if the photo belongs to another entry |
| DELETE | `/materials/images?brand=` | Take down every photo of a brand (admin); 400 without `brand`; `{removed: n}` |

Every entry carries `images[{id, url, thumb_url, page_url, credit}]`, fetched
photos only.

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
| `lib/materials/materials.ts` | `MATERIAL_SPECS` (the one list of comparable measurements), labels, `specSpread`, the comparison's id list, the URL search shape, and the entry form's value conversion |
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
