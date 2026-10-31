# Material wiki

The gear catalog paddlers keep between them: one row per model, each with its
sizes, searchable by name, and comparable side by side. It ships with a researched catalogue of
whitewater kayaks and paddles (see Catalogue below); canoes, packrafts and
SUPs share the kayak fields.

Open it from **Tools → Material wiki**, or go straight to `/materials`.

Measurements show, and are typed, in the units chosen under Settings > Units
(cm or in, litres or US gallons, kg or lb); they are saved in metric.

## Finding a boat

The list shows models, not single entries: the Pyranha Scorch is one row with
its sizes (S, M, L) under it, the length, volume and weight it spans, and
"Since 2021" (or "Since about 2021" when the year is weak). The count above
the list counts models. Tapping a row opens the model; the **Size** chips
there switch between its sizes, and the address holds the size you picked.

Type a brand or a model into the search field. Spelling is forgiving the same
way the river search is - `pyrhana` finds Pyranha - and typo tolerance starts
at four characters.

The **Filters** chip opens a sheet with the dimensions that narrow a list of
boats; each one set shows as a chip under the search field that takes itself
away:

| Filter | Keeps |
| --- | --- |
| Category | Kayaks, canoes, packrafts, SUPs or paddles |
| Discipline | What the boat is built for - creek, river runner, half slice, playboat, slalom, downriver, touring, sea, expedition, recreational, crossover, freestyle, other |
| Construction | Plastic, composite, inflatable, folding or wood |
| Brand | One brand, with the number of entries it has |
| Fits paddler | Your body weight in your weight unit (Settings > Units), keeping the boats whose paddler range covers it |
| Sort | Name, newest, or by length, volume or weight |

A boat that states no paddler range is kept by the **fits paddler** filter:
saying nothing is not the same as saying it does not fit.

While the **fits paddler** filter is set, a row lists only the sizes that fit.
The filters and the search live in the address bar, so a narrowed list is a
link you can send.

## Comparing

Tick the models you want on the list - up to eight - and press **Compare** in
the bar above the list (two are the least that compare). A ticked model
brings its first size; to compare other sizes, open the model and press
**Compare sizes** under its All sizes table, which compares every size of it.
The comparison puts one boat per column and one property per row, grouped
into overview, hull, cockpit and paddler.

Rows where the boats actually differ carry the value color; rows where they
all say the same thing stay plain, and a row no boat states at all is left
out. The three sizes of one model, side by side, are the case this is built
for: what changes between S, M and L is exactly what stands out.

The comparison is its own link too (`/materials/compare?ids=...`), and a
column can be dropped from the table without going back to the list.

## Adding and correcting

Any signed-in paddler can add an entry, correct one or ask for one to go. It
is a wiki, not a catalog of one person's boats, but a change from anyone but
an admin is a **proposal**: it waits on the proposals screen, other paddlers
can vote on it, and an admin approves or rejects it. The wiki changes only on
approval; the form says "Sent for review" until then. An admin's own change
applies at once. Brand and model are all that is required; every measurement
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
to the page it came from, then its facts, colourways as chips, and the
notes. An approximate year reads "about 2021". A paddle shows its own facts
(blade area, lengths, shaft, angles, weight) in your units. A Sources list
links every page a value came from. Rows in the list carry a small
thumbnail. An admin sees "Remove photo" and "Remove all <brand> photos" in
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

`0057_materials_catalogue_seed.sql` is generated, never edited; so is its
re-run `0059_materials_catalogue_reseed.sql`: run
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
caller. An admin's write applies (201, 200, 204); anyone else's is stored as a
`Proposal` and answers 202 with it, the entry untouched (see Proposals below).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/materials` | Paginated search - see the filters below |
| GET | `/materials/models` | Paginated models (category, brand, model, variant) with their sizes - the filters below; `total` counts models, a model lists only the sizes that match; `ids` is ignored |
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
`min_weight_kg`/`max_weight_kg`, `fits_paddler_kg`, `sort` and the usual
`page`/`per_page`.

A model item carries `discipline`, `construction`, the years across its sizes,
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
operation) proposals in a day or `MAX_PENDING` (50) waiting. The proposal is
`entity_type = material` (migration `0060`); listing, filtering (`?entity_type=material`),
votes and withdrawal are the shared proposal routes.

Approval (`routes/proposals/review.rs`) calls `proposals::material::apply`
inside the review transaction, which runs `create_in`, `update_in` and
`delete_in`, the same writes as the admin path, with the submitter as
`created_by` / `updated_by`. Like waterway proposals there is no stale-update
check and no one-pending-per-entry rule; an update or delete whose entry is
gone is a no-op. Tests: `api/tests/material_proposals.rs`, `api/tests/materials.rs`.

### Frontend

| Module | Owns |
| --- | --- |
| `lib/materials/materials.ts` | `MATERIAL_SPECS` (the one list of comparable measurements), labels, `specSpread`, the comparison's id list, the URL search shape, and the entry form's value conversion |
| `lib/hooks/useMaterials.ts` | `materialKeys` and every query and mutation; a write answered 202 (`isProposal`) announces "Sent for review" through `announceIfProposal` and leaves the entry caches alone |
| `lib/materials/materials.ts` | also `materialFieldLabel` / `materialFieldValue`, the wording of a changed field for the proposal diff |
| `components/materials/` | `MaterialsView` (list), `ModelRow`, `SizePicker`, `AllSizesTable`, `MaterialFiltersSheet`, `MaterialDetailView`, `ComparisonTable`, `MaterialForm`, `MaterialGallery` (photos and credits), `WikiPage` (the frame) |
| `routes/materials/` | `index` (list), `$materialId` (detail, `?edit=true` for the form), `compare`, `new` |

The wiki is a normal page, not a map screen: a centred column on a desktop,
edge to edge on a phone, reached from Tools. The list reads
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
