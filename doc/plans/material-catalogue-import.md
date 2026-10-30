# Material catalogue import (plan, delete when landed)

Bring the researched kayak and paddle data into the material wiki, with
colours and mirrored product images.

Source data: `.claude/handoffs/materials-data/{kayaks,paddles}/_all.json`
(built by `consolidate.py`; format in `BRIEF.md`). It is not in the repo yet.

## Decisions (user, 2026-10-31)

- Product images are **mirrored**: the server downloads them into
  `MEDIA_DIR`, never into git (the repo is public). Every image keeps its
  maker credit and the page it came from, and an admin can take down one
  image or all images of a brand.
- Years that rest on a weak source (archive first capture, Playak listing
  year, a search snippet) are imported and shown as approximate.
- Stored values are metric (see AGENTS.md "Device preferences").

## Interfaces

- **Schema** (one migration via `cargo sqlx migrate add`):
  - `materials.colors TEXT[]`, `materials.year_approximate BOOLEAN NOT NULL
    DEFAULT false`, `materials.sources JSONB` (field -> url), `materials.notes`.
  - Paddle fields on `materials` (nullable, used when category is paddle):
    `blade_area_cm2`, `blade_length_cm`, `blade_width_cm`, `length_min_cm`,
    `length_max_cm`, `lengths_cm DOUBLE PRECISION[]`, `pieces INT`,
    `shaft` enum, `shaft_material` enum, `blade_material TEXT`,
    `feather_deg INT[]`, `shaft_diameter TEXT`, `weight_g` folded into
    `weight_kg`. Paddle disciplines join the discipline enum if missing.
  - `material_images`: `id`, `material_id` FK cascade, `source_url`,
    `page_url`, `credit` (brand), `file` (path under MEDIA_DIR, null until
    fetched), `status` (pending|fetched|failed|removed), `fetched_at`,
    `error`, unique (material_id, source_url).
  - A system user row (`system-catalogue`) as `created_by` for imported rows.
- **Seed**: a generated, checked-in SQL migration built from `_all.json` by
  `scripts/materials/build_seed.py`; imported rows are upserted by
  (brand, model, variant, category) so a later re-import updates instead of
  duplicating, and never overwrites a row a user edited after import.
- **Mirror job** (`src/jobs/`): fetches `pending` images in small batches;
  host allowlist = hosts present in the seeded `source_url`s; HTTPS only;
  10 s timeout; 5 MB cap; image content types only; re-encoded to WebP at
  most 1600 px (strips metadata); one request per host per 2 s; a 403/429
  or robots disallow marks the host failed for 24 h, never retried faster.
- **API**: material detail returns `colors`, `year_approximate`, `sources`,
  `notes`, paddle fields and `images[{url, page_url, credit}]` (fetched
  only). Admin: `DELETE /materials/{id}/images/{image_id}` and
  `DELETE /materials/images?brand=` (takedown sets `removed`, deletes the
  file, and the job never refetches it).
- **Frontend** (second agent, after the API merges): detail shows images
  with "Photo: <brand>" linking to `page_url`, colour chips, "about <year>"
  for approximate years, paddle specs; units through `lib/units.ts`.

## Acceptance

- After `cargo sqlx migrate run` the wiki lists >= 600 kayaks and >= 150
  paddles; a second run of the seed changes 0 rows.
- An image from a host not in the allowlist is never fetched (test).
- A 429 from a host stops fetches from it for 24 h (test).
- Takedown: the file is gone from MEDIA_DIR, the API stops returning it,
  and the job does not fetch it again (test).
- Detail of a seeded kayak at 320 px shows image, credit link, colours and
  an approximate year without sideways scroll.
- Gates as in AGENTS.md, and the security table answered in the report.
