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
- When a river matched through something other than its own name, the row says
  why — e.g. `Rapid: Wellerbrücke - Riesenschlucht` or `DE name: Teufelsstrom`.
- The **Sections** tab lists the sections that matched; if a river matched by
  its own name, all of its sections are shown.

Search starts at 2 characters. Typo tolerance starts at 4, so very short terms
only match exactly.

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
| TypeScript | `frontend/src/lib/text.ts` `searchKey()` | nothing (frontend has no CI yet) |
| Rust  | `api/src/models/lang.rs` (language codes only) | unit tests |

### Ranking

`api/src/query/waterways.rs::search` ranks each waterway's best match by tier —
exact (0), prefix (1), substring (2), fuzzy (3) — then by source specificity
(waterway > section > translation > rapid), then trigram similarity. Rows carry
`matched_name`, `matched_source`, `matched_lang`, `matched_section_name` and
`fuzzy` for the frontend. Fuzzy matching engages at `FUZZY_MIN_CHARS = 4`; the
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
