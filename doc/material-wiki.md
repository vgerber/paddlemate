# Material wiki

The gear catalog paddlers keep between them: one row per model, each with its
sizes, searchable by name, and comparable side by side. It ships with a researched catalogue of
whitewater kayaks and paddles (see Catalogue below); canoes, packrafts and
SUPs share the kayak fields.

Open it from **Tools → Material wiki**, or go straight to `/materials`.

Measurements show, and are typed, in the units chosen under Settings > Units
(cm or in, litres or US gallons, kg or lb); they are saved in metric.

## Finding a boat

The list shows models, not single entries: the Pyranha Scorch is one card (on
a phone, one row) however many sizes it has. Every card has the same parts in
the same order: the photo (or a quiet icon in the same box when there is
none), the brand, the model name, one line of what it is ("Creek - River runner -
Plastic - since 2021", the groups first", "about 2021" when the year is weak), the key specs, then small
tags for the sizes (S, M, L) and "Discontinued". A boat shows length, volume
and weight; a paddle shows length and weight. A model sold in several sizes
shows the range they span, in your units, and a figure the model does not state
leaves its place empty. The compare checkbox sits in the photo's corner and
appears when you point at a card (always on a touch screen). The count above
the list counts models. Tapping a row opens the model; the **Size** chips
there switch between its sizes, and the address holds the size you picked.

Type a brand or a model into the search field. Spelling is forgiving the same
way the river search is - `pyrhana` finds Pyranha - and typo tolerance starts
at four characters.

**Browse by category.** On a desktop the left side of the page is a tree:
Kayaks, Canoes, Packrafts, SUPs, Paddles; under each the types (creek, river
runner, ...; paddles are grouped by use instead: whitewater, freestyle, slalom,
wildwater, touring and sea, canoe, polo, other); under each type the brands, each with its number of models.
A model filed under several groups (a boat its maker calls both a creeker and a
river runner) shows under each of them; a note under the tree says so, and a
category counts every model once.
Pick a brand and its models list under it, with their sizes; Kayaks, Creek,
Pyranha shows the nine Pyranha creek boats. The trail above the list
(Tools, Material wiki, Kayaks, Creek, Pyranha) goes back up a step, the
heading says where you are with "9 models, 21 sizes", and the address holds
the path, so the back button undoes a pick and a path is a link. The tree
follows the keyboard like a file browser: Up and Down move, Right opens, Left
closes or goes up, Home and End jump, a letter jumps to the next name starting
with it, Enter picks. The search text and the filters below narrow the tree's
counts too. The page uses the window's width: the models are a grid of cards,
two to four across, under a header card with the heading, the counts and the
sort.

On a phone the **Browse** button beside the search opens the tree one level at
a time: tap Kayaks to see its types, a type to see its brands; the top row
("All Kayaks") picks the whole level, a brand picks itself, and the sheet
closes. The path shows as chips under the search, each a way back up.

The **Filters** chip on a phone, and the sidebar under the tree on a desktop,
hold the dimensions that narrow a list of boats (a desktop puts the sort
beside the heading); each one set shows as a chip that takes itself away:

| Filter | Keeps |
| --- | --- |
| Construction | Plastic, composite, inflatable, folding or wood |
| Availability | "Still made": only the models the maker still sells |
| Fits paddler | Your body weight in your weight unit (Settings > Units), keeping the boats whose paddler range covers it |
| Sort | Name; newest model (by model year, newest first, no year last, ties by name); recently added (when the entry was filed); shortest, smallest volume or lightest first |

**Still made.** A row of a model the maker no longer sells says
"Discontinued" at the end of its second line; a model still made, or one whose
status is not known, says nothing. The model's page states it under the
facts: "Still made", "Discontinued (last model year 2008)" or "Availability
unknown", with "Checked 01 Nov 2026" and a link to the page it was read from.
It is a snapshot, not a live feed: the date is the day somebody looked at the
maker's current lineup, and a model can have been added or dropped since. The
**Still made** filter keeps only the models known to be current, and the tree's
counts follow it. A model with several sizes counts as still made when any of
its sizes is. Anyone can correct the status in the entry form (a proposal like
any other change): the choice, the page it was read from and the day.

A boat that states no paddler range is kept by the **fits paddler** filter:
saying nothing is not the same as saying it does not fit.

While the **fits paddler** filter is set, a row lists only the sizes that fit.
The filters and the search live in the address bar, so a narrowed list is a
link you can send.

## Comparing

Tick the models you want on the list - up to eight. A model of one size is
picked at once; a model of several sizes opens a small choice of its sizes
(tick one or more), so no size is ever picked without you seeing it. The bar
pinned to the foot of the list names every pick with its size, with the count,
the cap, **Clear** and **Compare** (two are the least that compare). To compare
every size of one model, open it and press **Compare sizes**.

The comparison puts one entry per column and one property per row, each row
labelled with its unit ("Length (cm)", in your units). Up to four entries
share the width, on a phone as well, each row's label on its own line above its
values; more than four scroll sideways under a sticky head, with a hint. Each
head names brand, model and size (a select of the model's sizes changes it in
place) and has a remove button.

Values every entry shares - the category, the groups, a width that is the
same - sit once in an "Alike in all N" strip of chips, and the table keeps only
the rows that tell the entries apart. A row shows only when two entries state
it, so a kayak and a paddle compare the rows both have (a one-line note says
so). Paddles
add blade, shaft and length rows; a paddle's weight reads in grams (ounces in
imperial). **Add to comparison** in the card above the table opens the list
with the picks kept.

The comparison is its own link too (`/materials/compare?ids=...`), and a
column can be dropped from the table without going back to the list.

## Adding and correcting

Any signed-in paddler can add an entry, correct one or ask for one to go. It
is a wiki, not a catalog of one person's boats, but a change from anyone but
an admin is a **proposal**: it waits on the proposals screen, other paddlers
can vote on it, and an admin approves or rejects it. The wiki changes only on
approval; the form says "Sent for review" until then. An admin's own change
applies at once. Brand, model and at least one group are required; every measurement
is optional, and the next reader can fill in what is missing. The entry keeps
who added it and who last edited it - for an approved proposal, the
paddler who proposed it, not the admin who approved it.

You can leave the admin a note with a proposal (500 characters); the entry
form asks for it when you are not an admin. A delete request has no note. An
entry you have a proposal on says so under its header ("Your change is waiting
for review", with a link to it). On the proposals screen the filter "Wiki"
lists them: the title is the entry's brand, model and size, an edit shows the
changed fields as Before and After in your units, a new entry its values, a
removal the entry being removed.

Input is bounded: names 80 characters, the description 4000, the link 500
and a web link only (`http://` or `https://`), years 1900 to 2100, and every
measurement positive and below a ceiling no real boat reaches (a 2000 cm
length, a 500 kg weight). One user can send 30 proposals a day (an admin adds 30 entries a day), and
50 can wait for review at once.

Deleting an entry is a proposal too, and only an admin deletes outright.
Photo takedown stays with admins and is not a proposal.

A proposal is applied exactly as written: if the entry was edited after it
was proposed, approving replaces those edits, so the reviewer compares the
proposal with the entry as it stands. A proposal for an entry that has been
removed since changes nothing. A name another entry took meanwhile makes the
approval fail with a conflict and the proposal stays pending to be rejected.

A model such as the Pyranha Scorch comes in sizes (S, M, L); each size is its
own entry, and an entry shows the other sizes of its model. An edition ("PR-X")
or, for a paddle, a build ("1 piece, bent shaft") is a separate model, not a
size. The same brand, model, variant and size can only exist once. Case and spacing do
not create a second entry - "pyranha firecracker" and "Pyranha Firecracker"
are the same boat.

## Catalogue

A model with sizes shows its Size chips and the facts of the picked size
(length, volume, weight, paddler), then an **All sizes** table with the
picked size marked. An entry opens with its photos, each captioned "Photo: <maker>" and linking
to the page it came from; a click on a photo opens it full size in the photo
viewer (arrow keys, buttons or a swipe step through the photos, Esc closes),
then its facts, colourways as chips, and the
notes. An approximate year reads "about 2021". A paddle shows its own facts
(blade area, lengths, shaft, angles, weight) in your units. A Sources list
links every page a value came from. Rows in the list carry a small
thumbnail that opens the model, not the viewer. An admin sees "Remove photo" and "Remove all <brand> photos" in
the entry menu; both ask first.

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
| `materials_identity_key` | One entry per brand/model/variant/size, case- and space-insensitive |
| `chk_materials_size` | `size` is 1 to 40 characters when set |
| `chk_materials_extra_text`, `chk_materials_paddle` | Colour, notes and source sizes; paddle sizes, pieces, lengths and feather angles |
| `chk_materials_years` | `year_to >= year_from` |
| `chk_materials_paddler` | `paddler_weight_max_kg >= paddler_weight_min_kg` |
| `chk_materials_positive`, `chk_materials_ceiling` | Every stated measurement is greater than zero and below its ceiling |
| `chk_materials_brand`, `_model`, `_text` | Name and text lengths |
| `chk_materials_year_range` | Years 1900 to 2100 |
| `chk_materials_availability_source` | The source is at most 500 characters and starts with `http://` or `https://` |

`MaterialBody::validation_error` (`api/src/models/material.rs`) checks the
same rules before the insert, so a bad entry comes back as a 400 naming the
field rather than as an opaque constraint failure.

`idx_materials_name_trgm` is a GIN trigram index on
`public.search_key(brand || ' ' || model)` - the same expression the query
uses, and the same normalization the river search runs on. It is therefore
one of the `*_name_trgm` indexes that a migration changing `search_key` must
`REINDEX`; see [search.md](search.md).

### Paddle classes

A paddle's groups (`disciplines`) are the uses it is built for: `whitewater`, `freestyle`,
`slalom`, `wildwater`, `touring` (shown as "Touring and sea"), `canoe` (single
blade), `polo` or `other`. `whitewater`, `wildwater`, `canoe` and `polo` are
paddle-only; every other class belongs to boats. The rule is the check
`chk_materials_disciplines`, applied to every element, and, ahead of it, a 400 naming `disciplines` from
`MaterialBody::validation_error`. `0063_paddle_use_remap.sql` moved the old
paddle rows (creek and river runner to whitewater, downriver to wildwater;
freestyle, slalom, other kept) and the stored bodies of material proposals.
The form offers `disciplinesFor(category)` and clears a class the new category
does not have.

### Groups

An entry can be filed under one to three groups: `materials.disciplines` is a
`material_discipline[]`, NOT NULL, primary group first (migration 0069 replaced
the single `discipline` column; every row started with its one old group, a row
with none became `other`). One array column rather than a primary column plus a
list keeps one source of truth with no way for the two to disagree; the order
carries "primary". `chk_materials_disciplines` bounds the length (1 to 3), refuses
NULL elements and applies the category rule to every element; duplicates are
refused in `MaterialBody::validation_error` (400, target `disciplines`), since
a CHECK cannot compare elements. A GIN index serves the filter.

`discipline=` on the list, models and tree matches any group of the entry. The
tree puts a model under each of its groups and counts it once in its category
(`COUNT(DISTINCT)` over the unnested groups), so group counts can add up to
more than the category's; the web tree and the phone sheet say so
(`GROUP_COUNT_NOTE`). A model item's groups are those of its first size; the
catalogue gives all sizes of a model the same list. Create, update and proposal
bodies take `disciplines` (stored proposal bodies were rewritten by 0069).
Cards and the model page show the groups joined with "·"; the form has a Groups
field (chips, at most three, the first picked is primary).

The groups of the catalogue come from the makers' own category pages
(`.claude/handoffs/materials-data/groups/*.json`, one file per brand, weak
sources marked "Weak" in the row's note, which is kept in `notes`):
`GROUPS_DIR=<dir> python3 -I scripts/materials/build_seed.py --merge-groups`
copies them into `kayaks.json` (a model's sizes get the union), and
`--groups-migration` writes the migration (0070 and its completion 0071). They
touch only rows with `updated_by` NULL.

### Brand names

A brand is its name without the product suffix: Spade, Waka, Fluid, EXO, Zet,
Jackson, AT, VE, Lendal (migration 0068, which renamed materials, photo
credits and stored proposal bodies; the brand is a name, so edited rows changed
too - none had been edited). The data files and the seed use the new names. An
old link with `?brand=Spade%20Kayaks` still opens the brand
(`RENAMED_BRANDS` in `lib/materials/search.ts`); the API filter takes the
current spelling only. `api/tests/sql/catalogue_seed.sql` is the full seed
(`python3 -I scripts/materials/build_seed.py` with no argument writes it);
`catalogue_seed.rs` runs it against the migrated database and expects no row
to change, so data and migrations cannot drift apart.

### Catalogue storage

Migration `0056_materials_catalogue.sql` adds the `paddle` category, the
`crossover`, `freestyle` and `other` disciplines, the paddle spec columns
(`blade_area_cm2`, `lengths_cm`, `shaft`, `shaft_material`, `feather_deg` and
so on, filled only for paddles; a boat that sends one gets a 400), `colors`,
`year_approximate`, `sources` (field name to URL) and `notes`. The identity
key now includes the category. `PUT` replaces every field, the new ones
included; a client that omits `colors` clears them.

`0057_materials_catalogue_seed.sql` is generated, never edited; so is its
re-run `0064_materials_paddle_use_reseed.sql` (the current seed, with the
new columns, is `api/tests/sql/catalogue_seed.sql`): run
`python3 -I scripts/materials/build_seed.py` on `data/materials/{kayaks,paddles}.json`
(facts and links only, no images). It upserts by category, brand, model,
variant and size, owned by the `system-catalogue` user, and only touches rows where
`updated_by` is NULL, so a re-run changes nothing and keeps user edits. Values
the schema refuses become NULL with the original in `notes`; a paddle sold with
a straight and a bent shaft becomes one entry per shaft (the second without
weight). `year_approximate` is set when the year source is Playak or the
archive, or the notes call the year weak. `system-catalogue` is hidden from the
user list.

Migration `0058_material_size.sql` adds `materials.size` and moves the size
out of `variant` on untouched catalogue rows (`updated_by IS NULL`, matched by
the old label; a user's edit keeps its variant). The split is
`split_variant()` in `build_seed.py` (doctests: `python3 -I -m doctest
scripts/materials/build_seed.py`), which also writes that migration's UPDATE
(`--size-migration`), so the seed and the migration cannot disagree. Rules:
S/Small/SM -> S, M/Medium/MD -> M, L/Large/LG -> L, XS, XL; ranges SM/MD, S/M,
M/L, MD/LG, M|L, Medium/Large -> S/M or M/L; numbers up to three digits
(65, 8.5) stay as the size; "8.5 (2005)" -> size 8.5, variant 2005. Anything
else stays a variant, including "L creek", "L club", "M creek" and paddle
builds or "Medium 648". Only single sizes (S, M, L) move for paddles. A
catalogue row a user edited keeps its old variant, so a later re-import would
add the size-keyed row beside it.

Migration `0065_materials_availability.sql` adds the `material_availability`
enum (`current`, `discontinued`, `unknown`) and the columns `availability`
(not null, default `unknown`), `availability_source` and `availability_checked`
(a date), with `idx_materials_availability`. It is generated by
`python3 -I scripts/materials/build_seed.py --availability-migration` from
`data/materials/availability.json`: one research row per model and variant as
`kayaks.json` and `paddles.json` spell them (686 rows, a snapshot of
2026-11-01, one file per brand merged). The script applies the split of
`split_variant()` and the straight/bent paddle split, then gives each model of
the seed one status - current if any research row is, discontinued if all are,
otherwise unknown - and every size of it that status; the migration updates
catalogue rows by category, brand, model and variant, only where `updated_by`
is NULL, and fills `year_to` where the row has none and the research dates the
end (never below `year_from`). Re-running it changes nothing, and it ends with
a notice counting research rows that matched no entry (none at the time of
writing).

`material_images` holds one row per link: `status` is `pending`, `fetched`,
`failed` or `removed`, `host` is the link's host, `file` the stored key.
`material_image_hosts` holds hosts on a 24 hour cooldown.

### Photo links added later

Links added after the first seed carry a `"batch"` tag in the data files and
ship in their own migration, made with `python3 -I scripts/materials/build_seed.py
--photo-migration <batch> <out.sql>` (0066, 0067; the default seed leaves tagged
links out). It queues every size row of a model that has no image yet, so a
re-run inserts nothing, and the new hosts join the allowlist with those rows
(the running job rereads it each round, no restart). Tests:
`api/tests/material_photo_links.rs`.

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
caller. An admin's write applies (201, 200, 204); anyone else's is stored as a
`Proposal` and answers 202 with it, the entry untouched (see Proposals below).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/materials` | Paginated search - see the filters below |
| GET | `/materials/models` | Paginated models (category, brand, model, variant) with their sizes - the filters below; `total` counts models, a model lists only the sizes that match; `ids` is ignored |
| GET | `/materials/tree` | The browse tree: categories, their groups (a model counts under each of its groups), their brands, each with `models` and `entries`; takes the model filters except category, discipline and brand (and ignores paging and sort) |
| GET | `/materials/brands` | Brands with entry counts, `category` narrows them |
| GET | `/materials/{material_id}` | One entry |
| POST | `/materials` | Add an entry: admin 201, others 202; 409 on a duplicate, 429 over the caps |
| PUT | `/materials/{material_id}` | Replace an entry: admin 200, others 202; 404 if gone, 409 if the new name is taken |
| DELETE | `/materials/{material_id}` | Delete an entry: admin 204, others 202 |
| DELETE | `/materials/{material_id}/images/{image_id}` | Take down one photo (admin); 404 if the photo belongs to another entry |
| DELETE | `/materials/images?brand=` | Take down every photo of a brand (admin); 400 without `brand`; `{removed: n}` |

Every entry carries `images[{id, url, thumb_url, page_url, credit}]`, fetched
photos only.

The list takes `q`, `category`, `discipline`, `construction`, `brand`,
`min_length_cm`/`max_length_cm`, `min_volume_l`/`max_volume_l`,
`min_weight_kg`/`max_weight_kg`, `fits_paddler_kg`, `availability`
(`current`, `discontinued` or `unknown`; also on `/materials/models` and
`/materials/tree`), `sort` and the usual
`page`/`per_page`.

Every entry carries `availability`, `availability_source` and
`availability_checked`; they are part of the create/update body too (`PUT`
replaces them, so a client that omits `availability` resets it to `unknown`).
A model item carries `disciplines` (the groups, primary first), `construction`, the years across its sizes,
`availability` (current if any size is, then unknown, discontinued only when
every size is) with the source and day of the size that decided it,
`thumb_url` (first fetched photo of any size) and `sizes[{id, size, length_cm,
weight_kg, volume_l, paddler_weight_min_kg, paddler_weight_max_kg,
lengths_cm}]`, ordered XS, S, S/M, M, M/L, L, XL, then numbers, then the rest.
`GET /materials/{id}` adds `siblings[{id, size}]`, the other sizes of its model
looked up by the model key in SQL; the list and compare endpoints leave it
empty. `size` is part of the create/update body (`PUT` replaces it too, so a
client that omits it clears it).

`ids` is the comparison's own filter: a comma separated list that returns
exactly those entries, in the order given, ignoring every other filter and
paging; a malformed list or more than `MAX_COMPARE_IDS` (8) ids is a 400.
`q` and `brand` longer than 100 characters are a 400, `page` is clamped to
10000 and `per_page` to 100. The daily cap on new entries is
`MAX_NEW_PER_DAY` in `api/src/query/materials/write.rs`; the count and the insert
run under a per-user advisory lock, and the 31st is a 429.

`sort` takes `name`, `newest` (model year, newest first), `added` (latest
filing first), `length`, `volume` and `weight` (ascending). On the model list a
model's value is the smallest across its sizes (the year: the latest of its
sizes, so a re-released model counts as new); a model or entry that does not state it comes last, and every order ends
on the id so pages never repeat or skip a row. A page past the last still
reports the true `total`. `q` matches brand, model and variant ("drip pr-x").

With a query text and the default name sort, results are ranked the way the
river search ranks them - exact, prefix, substring, fuzzy, then trigram
similarity, with fuzzy matching from four characters up. Asking for a
measurement sort overrides that; measurement sorts put the entries that do
not state the measurement last.

### Proposals

Bodies of POST and PUT are `Proposable<MaterialBody>`: the entry fields plus
an optional `proposal_note`. Both paths clean and validate the body first (400)
and refuse a name another entry holds (409, `query::materials::key_taken`), so
a pending proposal always holds a body an admin could apply as is. Non-admins
then go to `query::proposals::material::submit`, which snapshots the entry for
update and delete (`original_data`, in `MaterialBody` shape plus `id`; 404 if
it does not exist), and under the user's advisory lock (the one
`materials::create` takes) refuses with 429 at `MAX_PER_DAY` (30, any
operation) proposals in a day or `MAX_PENDING` (50) waiting. A user may hold one
pending update or delete per entry: the partial unique index
`uniq_proposals_material_pending_change` (migration `0061`) enforces it and the
violation answers 409 "You already have a change waiting for review on this
entry" (target `id`); creates, other users and admins are not affected, and a
decided or withdrawn proposal frees the slot. The proposal is
`entity_type = material` (migration `0060`); listing, filtering (`?entity_type=material`),
votes and withdrawal are the shared proposal routes.

Approval (`routes/proposals/review.rs`) calls `proposals::material::apply`
inside the review transaction, which runs `create_in`, `update_in` and
`delete_in`, the same writes as the admin path, with the submitter as
`created_by` / `updated_by`. Like waterway proposals there is no stale-update
check; an update or delete whose entry is
gone is a no-op. Tests: `api/tests/material_proposals.rs`, `api/tests/materials.rs`.

### Frontend

| Module | Owns |
| --- | --- |
| `lib/materials/specs.ts` | `MATERIAL_SPECS` / `PADDLE_SPECS`, the enum lists and `CATEGORY_LABELS`, `formatSpec` |
| `lib/materials/facts.ts` | titles, years, sizes and ranges as text, `sizeFacts` / `paddleFacts`, `sourceLinks`, `materialFieldLabel` / `materialFieldValue` (the wording of a changed field for the proposal diff) |
| `lib/materials/search.ts` | the list route's URL search shape, its parsing and the API filters |
| `lib/materials/form.ts` | the entry form's values and their conversion to and from an entry |
| `lib/hooks/useMaterials.ts` | `materialKeys` and every query and mutation; a write answered 202 (`isProposal`) announces "Sent for review" through `announceIfProposal` and leaves the entry caches alone |
| `lib/materials/compare.ts` | `buildComparison`: the comparable rows (`FIELDS`), the alike chips; also `specSpread` and the comparison's id list |
| `components/materials/` | `MaterialsView` (list and its compare bar), `ModelRow`, `SizePicker`, `AllSizesTable`, `MaterialFiltersSheet`, `MaterialDetailView` (on the shared `DetailCard` and `FactRow`, `SourceList`), `ComparisonTable` (with `ComparisonHead`, `ComparisonRow`, `ComparisonSummary`, sizes in `comparisonLayout.ts`), `MaterialForm`, `MaterialGallery` (photos and credits), `MaterialTree` and `wikiTrail` (wiki wrappers on the shared `TreeView` and `Breadcrumb`); the frame is the shared `PageFrame` |
| `routes/materials/` | `index` (list), `$materialId` (detail, `?edit=true` for the form), `compare`, `new` |

The wiki is a normal page, not a map screen: from `md` one column (`WIKI_WIDTH`,
1440, shared by the list, the entry, the comparison and the form) with a header
card (`SortSelect` at its right), a 300 sidebar (`MaterialsDesktop`: `SearchField`,
`MaterialTree`, `FilterFields sidebar`, the docked Add entry) and a card grid.
The size choice of a row is the shared `ActionMenu` of `RowMenu`. On a phone it is edge to edge, with `BrowseSheet`
for the tree, reached from Tools. `MaterialTree` is a real ARIA tree
(`role=tree/treeitem`, `aria-level/expanded/selected`, roving tabindex; the
key logic is `treeKey` in `components/tree/treeKeys.ts`); it loads the brand's models
lazily with `useBrandModels`, and its counts come from `useMaterialTree`
(`materialKeys.tree`). The list reads
`GET /materials/models` (`materialKeys.models`, 24 models a page, "Show more");
a row opens the model's first size, and the size chips navigate to the sibling
entry's id. The model page asks for its sizes with the `ids` list to fill the
All sizes table. The entry form holds `size` beside `variant`, and an
untouched edit sends the stored value back (PUT replaces every field). Specs: `frontend/e2e/materials/`.

Proposals: `MaterialForm` shows `ProposalNoteField` to non-admins and sends
`proposal_note` with the body. The proposals API cannot filter by entry, so
`useOwnPendingMaterialProposals` lists the user's pending wiki proposals and
picks the entry's; `PendingProposalNote` draws them. `ProposalDiffTable` and
`ProposalCreateSummary` take `entityType` and switch to the wiki wording.
Specs: `frontend/e2e/material-proposals/` (signs in as `jonas` through
`e2e/support/signIn.ts`).

Adding a measurement is one row in `MATERIAL_SPECS` plus its column: the
list row, the detail view, the comparison and the entry form all read that
list.

The dev fixture in `.claude/skills/test-data/` seeds thirteen entries (ids
9851-9863): one model in three sizes for the comparison, and a kayak with a
photo, a paddle and a brand with two photos for the catalogue specs.
