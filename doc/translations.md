# Translations

River sections and rapids can carry their names and descriptions in any
language. You pick a display language once, and the app shows each section in
that language when a translation exists — falling back to the local name when
it doesn't.

## Choosing your language

Settings → **Display language**. The picker offers every ISO 639-1 language,
searchable by its own name and its English name ("deutsch" and "german" both
find Deutsch). The choice is saved on the device and applies immediately —
lists, detail views and map labels included.

What you'll see:

- A section with a translation in your language shows that translation.
- A section without one shows its own name — usually the local river name,
  which is more useful than an arbitrary other translation. There is
  deliberately no "try English" step.
- A regional variant serves the base language: a `de-AT` translation is shown
  to a reader who chose German.

## Adding translations

In a section's edit view, each name or description row has a language. Rapids
(features) work the same way, and a rapid's translated names are searchable —
see [search](search.md).

The UI language itself (buttons, labels) is English only, by choice.

## Language codes

One canonical form everywhere: lowercase, dash-separated BCP 47 tags — `de`,
`ces`, `pt-br`, `zh-hant`. Submissions are normalized (`DE`, `de_DE` →
`de`, `de-de`) and anything that isn't a well-formed tag is rejected with a
400. The API validates the *shape* of a tag, not membership in a list —
clients decide which languages they offer.

## API

Upsert and delete per language, under the owning entity:

```
POST/DELETE .../sections/{id}/names/{lang_code}
POST/DELETE .../sections/{id}/descriptions/{lang_code}
POST/DELETE .../features/{id}/names/{lang_code}
POST/DELETE .../features/{id}/descriptions/{lang_code}
```

The `lang_code` in the path is normalized first, so `DELETE .../names/DE`
removes the `de` row. The API returns *all* translations on reads and the
client picks — there is no `Accept-Language` handling.

## Internals

### Storage

Four tables shaped `(entity_id, lang_code, text)`, UNIQUE per entity and
language: `section_names`, `section_descriptions`, `feature_names`,
`feature_descriptions`. A section's own `name` column is the untagged fallback.
Features have no plain name column; `feature_names` is their only naming.

### Code validation, three redundant layers

| Layer | Where | Rejects |
| ----- | ----- | ------- |
| API boundary | `api/src/models/lang.rs::normalize_lang_code` | malformed tags, tags over 35 chars → 400 |
| Database CHECK | `lang_code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'` (migration `00025`) | any non-canonical write from any other client |
| Column width | `VARCHAR(35)` (migration `00026`) | nothing legitimate — sized so the column can never reject a valid tag before the API does |

The CHECK grammar and `normalize_lang_code` duplicate each other on purpose
and must be kept in step. Without normalization, `de`, `DE` and `de_DE` would
be three rows and defeat the UNIQUE constraint.

All eight write handlers start with the shared
`authorize_localization` (`api/src/routes/waterways/mod.rs`): signed in, then
normalize.

### Frontend

| Concern | File |
| ------- | ---- |
| Persisted choice (localStorage, live updates) | `frontend/src/lib/languagePreference.ts` |
| Language list via `Intl.DisplayNames`, base 2-letter codes only | `frontend/src/lib/languages.ts` |
| Picking the right text (exact tag, then regional variant, then fallback) | `frontend/src/lib/localization.ts` |

Base codes only means content is never split across `de` / `de-AT` / `de-CH`.

One rule for callers: code that caches localized output — memos, map-layer
builders — must take the language as an explicit argument so the cache re-keys
when it changes. `buildSectionLabelsGeoJSON` requires it for exactly that
reason; the comment in `localization.ts` explains the trap.
