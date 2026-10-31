# Material wiki by model (plan, delete when landed)

Show the wiki as models, each with its sizes or versions, instead of one row
per entry. Design: the "Style review" boards of the canvas "Material wiki as a
shop" (centred 880 column, `PanelHeader`, rows in one card, chips plus the
Filters sheet, `Add entry` as the one primary action) with the UX review's
grouping. Decided with the user 2026-10-31: no sidebar tree, no "fits"
highlighting yet; Compare is a text button in the compare bar.

## Data

An entry's `variant` today mixes a size (S, Medium, 65), an edition (PR-X,
SPORT, Carbolight, 2005) and, for paddles, a build (1 piece, bent shaft).

- New nullable column `materials.size TEXT`: the size within a model, short and
  normalised (XS, S, M, L, XL; Small -> S, Medium -> M, Large -> L, SM -> S/M
  as written; numeric sizes such as 65 or 8.5 stay). `variant` keeps what is
  left (the edition), or null.
- A model is `(category, brand, model, variant)`; its entries are its sizes.
  Paddles have no sizes: their builds stay in `variant`, so each build is its
  own model row with its lengths (`lengths_cm`).
- The normalisation runs in `scripts/materials/build_seed.py` (data JSON
  updated) and a migration that sets `size`/`variant` on catalogue rows the
  same way, by id, only where `updated_by IS NULL` (never a user's edit), so
  the identity key change does not duplicate rows on a later re-import. The
  seed's identity key becomes `(category, brand, model, variant, size)`.
- Unclear labels (L creek, 2005) are listed in the report, not guessed.

## API

- `GET /materials/models`: paged models (same filters as `GET /materials`,
  `page`/`per_page`/`total`/`total_pages` counting models), each
  `{category, brand, model, variant, discipline, construction, year_from,
  year_to, year_approximate, thumb_url, sizes: [{id, size, length_cm,
  weight_kg, volume_l, paddler_weight_min_kg, paddler_weight_max_kg}]}`, sizes
  in a fixed order (XS..XL, then numeric).
- Entry detail adds `siblings: [{id, size}]` (the other sizes of its model),
  looked up by the model key in SQL.
- `size` joins create/update (bounded, 400 on failure) and the form.

## Frontend

- List: model rows (thumb, "Brand Model", "Discipline · Construction · Since
  <year>" with "about" for approximate, size tags, a spec range line), Kayaks |
  Paddles tabs, search, the existing chips and Filters sheet (sort moves into
  it), `ListPaneHeader` count of models, `DockedAction`/FAB "Add entry".
- Compare: a tick per size (on the model page) or per model (its first size)
  in the list; the bar shows "<n> picked", Clear and a text Compare.
- Model page: `PanelHeader`, size picker (44px toggle chips, the URL holds the
  entry id), Facts of the picked size, "All sizes" table, colours, photos with
  credit, sources, `RowMenu` with the existing actions.
- Units through `lib/prefs/units.ts`; dark mode through tokens.

## Acceptance

- After the migration: 0 entries whose `variant` is S, M, L, Small, Medium or
  Large; Pyranha Scorch is one model with sizes S, M, L; re-running the seed
  changes 0 rows.
- `GET /materials/models?category=kayak` total equals the count of distinct
  model keys (test), paging clamps as elsewhere.
- A user-edited entry keeps its variant (test).
- At 320px the list and the model page do not scroll sideways; every target is
  44px; the size picker changes the URL and the Facts.
- Gates as in AGENTS.md; the security table answered.
