# Gauge providers and whitewater.guide data - findings and plan

Status: research note, 2026-08-09, provider-coverage sections (2.1-2.3, 5)
updated 2026-08-15 to match current state. Author: investigation via the
live whitewater.guide GraphQL API, their open-source repos, and our own
`api/river-gauge` readers. Not legal advice - see caveats at the end.

## 1. TL;DR

- Our gauge coverage is strong across Central Europe and actually **ahead of
  whitewater.guide** there (they have no France/Germany/Czech/Poland feeds).
  We've since also built UK/Ireland, USA/Canada, Australia/New Zealand, the
  Balkans/Slovenia/Greece, Brazil, Sri Lanka, Nepal, Sweden (SMHI) and
  Catalonia (ACA) (see §2.1) - the gap against `gorge`'s source list is now
  mostly closed except **Finland** and the non-Catalan Spanish basins
  (blocked, see §2.3). See [fetching-gauge-data.md](fetching-gauge-data.md)
  for the much larger, separately-researched Americas/Asia expansion beyond
  what `gorge` itself covers.
- whitewater.guide's **section content is not a free dataset**. The code is
  CC BY-NC-SA 4.0; the section text is a mix of unspecified-license (most),
  a little CC0, and some explicitly **copyrighted** guidebook material. Do not
  bulk-import descriptions. Use it as a coverage reference only.
- The **facts** in it (river names, put-in/take-out coordinates, grades, gauge
  bindings) are largely not copyrightable and can inform where we build our own
  content. The **prose and photos** are the risk.

## 2. Gauge providers

### 2.1 What we have

This list has grown substantially since 2026-08-09 and is no longer
maintained here - see [`api/river-gauge/README.md`](../api/river-gauge/README.md#providers)
for the current, authoritative provider table (region, station counts,
history depth). As of 2026-08-15 it covers 32 providers across Europe, North
America, South America, Oceania and Asia, materializing 48,700+ gauge_catalog
rows.

### 2.2 whitewater.guide's sources (gorge)

whitewater.guide harvests gauges with its open-source `gorge` service; each
folder in `scripts/` is one source. Their documented table plus the extra
folders in the tree, updated 2026-08-15 against our current provider list:

- **Overlap with us:** Norway, Sweden (SMHI), Switzerland, Tirol, Riverzone,
  UK (England/Wales/Scotland), Ireland, USA, Canada, New Zealand, Catalonia.
- **They lack (we win Central Europe + the Balkans):** France, all of
  Germany, Czech, Poland, Austria national + Vorarlberg, Slovenia, Croatia,
  Bosnia, Greece.
- **They have that we lack:** see next section - now just Finland and the
  non-Catalan Spanish sources from `gorge`'s own list.

### 2.3 Providers we still need (prioritised, updated 2026-08-15)

Everything `gorge` covers that we now also cover has been removed from this
table (UK/Ireland/USA/Canada/New Zealand - see §2.2). What's left from
`gorge`'s source list:

| Priority | gorge source | Region | Why |
|---|---|---|---|
| Med | `finland` | Finland | Completes Scandinavia (we have Norway + Sweden); not yet researched |
| Med | `galicia` / `galicia2` / `cantabria` | NW Spain, Asturias | Researched 2026-08-15 (see fetching-gauge-data.md): Galicia blocked on an emailed MeteoGalicia auth code, Miño-Sil implementable but scrape-heavy, Cantabria now behind a login wall. `catalunya` is built (`aca`). |
| Low | `uscdec`, `usnws` | USA (California / NWS) | Redundant with our `usgs` reader for most purposes |
| Low | `georgia` | Georgia (Caucasus) | Researched 2026-08-15 (see fetching-gauge-data.md) - dead end, no public API found |
| Low | `chile`, `ecuador`, `futa` | South America | Chile researched in depth 2026-08-15 (recipe de-risked, one endpoint short of implementable); Ecuador has an unconfirmed lead; `futa` (Futaleufu-specific) not separately investigated |
| Low | `russia1`, `kuban`, `ukraine` | Russia / Ukraine | Not investigated |

Beyond `gorge`'s own source list, [fetching-gauge-data.md](fetching-gauge-data.md)
covers a much larger, independently-researched sweep of the Americas and
Asia (20+ additional countries) that `gorge` doesn't touch at all - Brazil,
Sri Lanka, Nepal, Sweden and Catalonia are now implemented from that
research; Argentina, Colombia, Peru, Ecuador and others have documented,
unimplemented leads.

Recommended next build order: **Chile** (per the de-risked recipe) is the
next clearest win, then Finland (unresearched) or the Ebro basin
(Pyrenean whitewater, needs a browser trace).

## 3. whitewater.guide section data

### 3.1 Model and access

- Data model: Region -> River -> **Section**. A section mirrors ours: name,
  grade/difficulty (+ bracket extra), a `shape` of `[lon, lat, alt]` points from
  put-in to take-out, points of interest (rapids, portages, put-in/take-out),
  media, a gauge binding, and a markdown guidebook description.
- API: `https://api.whitewater.guide/graphql` (Apollo). Introspection is
  disabled, but the schema is open-source under
  `packages/schema/schema/*.graphql` (repo license CC BY-NC-SA 4.0).
- Query: `sections(filter: SectionsFilter, page: Page): SectionsList` and
  `section(id): Section`. There are **5,321 sections** total.
- `description` is premium-gated: the schema documents it returns **null** when
  a region requires premium access.

### 3.2 Licensing reality (sampled live)

The `Section` type carries `license { name, slug, url }` and a `copyright: String`.
In a 3,200-section sample:

- **Most sections: `license = null`** - no license declared at all. Unspecified
  means default all-rights-reserved; treat as do-not-use.
- **49 with a license set**, slugs seen: `CC0` (public domain), `CC_BY-NC`
  (non-commercial), and a `"Copyrighted license"` with null slug.
- **52 with a `copyright` string set.**

Concrete copyrighted example (pulled live):

```
Section:   Atna - Middle (Norway), difficulty 3.5
license:   { name: "Copyrighted license", slug: null, url: null }
copyright: "Norway. The Whitewater guide" by Jens Klatt and Olaf Obsommer (2005)
id:        035011a8-632d-11e8-88aa-4f31b23e9178
```

Its description is transcribed guidebook prose from that copyrighted 2005 book.
It is not a one-off: a whole cluster of Norwegian sections (Atna, Austbygdai, …)
shares the same book attribution and `"Copyrighted license"` tag.

## 4. Can we import the data, and how?

### 4.1 Legal shape (not legal advice)

Separate the two kinds of data in a section:

- **Facts - low risk.** River names, put-in/take-out coordinates, difficulty
  grades, and which gauge a section uses are facts, generally not copyrightable.
  We already source river **geometry from OSM** (our single source of truth), so
  we do not need theirs.
- **Expression - the risk.** Guidebook descriptions and photos are copyrightable.
  Their status here is:
  - `Copyrighted license` -> cannot use.
  - `license = null` -> unspecified, treat as all-rights-reserved, do not use.
  - `CC_BY-NC` -> attribution + **non-commercial only** + share-alike per the
    repo license. If paddlemate is or may become commercial, this is off-limits.
  - `CC0` -> freely usable (attribution still courteous).

### 4.2 Recommendation

1. **Do not bulk-import section descriptions.** Most are unspecified-license and
   some are explicitly copyrighted; the legal downside outweighs the content win.
2. **Use whitewater.guide as a coverage reference.** Query which rivers/sections
   exist, where, and at what grade, to prioritise where *we* write our own
   sections. Facts only, no prose copied.
3. **If we want their content**, only the explicitly permissive subset:
   filter `license.slug` to an allowlist (`CC0`, and `CC_BY-*` only if paddlemate
   stays non-commercial), store the attribution string, and skip everything
   `null` or `Copyrighted`. That is a small minority of the 5,321.
4. **Gauge feeds are unrelated to this.** gorge's harvesters pull public
   government APIs; those are reusable and are exactly what section 2.3 proposes
   we build ourselves. No whitewater.guide dependency there.

### 4.3 Technical import path (if pursuing the permissive subset)

- Paginate `sections(page: { limit, offset })`; for each node capture
  `id, name, river{name}, region{id,name}, difficulty, difficultyXtra, shape,
  license{name,slug,url}, copyright` (add `description` only for allowlisted
  licenses).
- Client-side filter on `license.slug` allowlist; drop `null`/`Copyrighted`.
- ~5,321 rows total, so one pass is cheap. Store the `copyright`/license as
  attribution metadata alongside anything we keep.

## 5. Concrete next steps

1. **Gauges:** the UK/Ireland cluster, SMHI (Sweden) and ACA (Catalonia)
   are now built. Next up per §2.3: Chile (recipe de-risked in
   fetching-gauge-data.md, one endpoint short of implementable), then
   Finland or the remaining Spanish basins (Galicia needs an emailed
   MeteoGalicia auth code; Ebro needs a browser trace). Ask for a
   per-source API scoping note when ready to implement.
2. **whitewater.guide:** treat as a coverage map only for now. If content reuse
   is ever wanted, get explicit permission from the maintainers or restrict to
   the CC0 subset, and reconcile the NC/share-alike terms with paddlemate's own
   license and commercial intent.

## 6. Provenance and caveats

- Gauge source list: whitewater.guide `gorge` repo (`scripts/` tree and
  `scripts/README.md`). Region labels for folders absent from their README table
  (e.g. `smhi` = Sweden, `uscdec` = California) are inferred from folder names,
  not confirmed per-script.
- Section data and licensing: live queries against `api.whitewater.guide/graphql`,
  with field names taken from their open-source `packages/schema/schema`.
- The `whitewater.guide/regions/{regionId}/sections/{sectionId}` URL shape is a
  best guess; the IDs are authoritative.
- The licensing discussion is an engineering summary, not legal advice. Before
  reusing any third-party content, confirm terms with the maintainers or counsel.
