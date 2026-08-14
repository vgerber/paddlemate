# How to fetch river gauge data: the Americas and Asia, plus the original five

Concrete request recipes for pulling station metadata and readings from
gauge networks outside (or newly inside) our current provider set. Chile,
Japan, USA, Canada, Pakistan verified live 2026-08-10/11. Brazil, Argentina,
Colombia, Peru, Ecuador, Bolivia, Mexico, Central America, Uruguay, Paraguay,
Venezuela researched/verified live 2026-08-15 (batch 1). India, Bhutan,
Georgia, Armenia, Turkey, Kyrgyzstan, Tajikistan, Kazakhstan, Vietnam, Laos,
Thailand, Philippines, Indonesia, China, South Korea, Sri Lanka, Nepal
researched/verified live 2026-08-15 (batch 2, Asia). This is a fetch
reference, not a code plan - `brazil_ana.rs`, `srilanka_mevinu.rs` and
`nepal_dhm.rs` are the only ones of these two batches actually implemented;
see `lib.rs`'s checklist for the full **why** behind everything excluded.

Chile and Japan are unofficial scrapes (no published API) - throttle and
cache, only fetch stations you actually use. USA and Canada are clean,
documented government APIs - by far the easiest of the five original ones.
Pakistan sits in between: a real JSON API, but undocumented and only covers
main-stem barrages, not the northern whitewater rivers. Brazil (ANA) turned
out to be just as clean as USA/Canada - implemented, see below.

This doc doesn't cover Europe - for the remaining European gaps (Sweden,
Finland, Spain) and the whitewater.guide coverage/licensing analysis, see
[gauge-data-and-whitewater-guide.md](gauge-data-and-whitewater-guide.md).

---

## Chile - DGA (Dirección General de Aguas)

### Station list - ArcGIS REST JSON (easy)

```
GET https://rest-sit.mop.gob.cl/arcgis/rest/services/DGA/Red_Hidrometrica/MapServer/0/query
    ?where=TIPO_ESTACION='Fluviométricas'   (note plural + accent)
    &outFields=*
    &returnGeometry=true
    &outSR=4326
    &f=json
    &resultOffset=0&resultRecordCount=1000   (paginate)
```

- No auth, no visible rate limit. 5,084 stations total, **786 fluviométricas**.
- Active-only variant: `.../DGA/Red_Hidrometrica_vigentes/MapServer`.

Field mapping:

| Field | Use |
|---|---|
| `COD_BNA` | station id, 8 digits (e.g. `01001002`) |
| `NOM_ESTACION` | station name (river is usually embedded in it) |
| `NOM_CUEN` / `NOM_SUBC` | basin / sub-basin (closest to a river name) |
| `LATITUD` / `LONGITUD` | WGS84 decimal (also geometry x/y with `outSR=4326`) |
| `VIGENCIA` | `Vigentes` (active) / `Suspendidas` |
| `ALTITUD`, `REGION`, `AREA_DRENAJE_KM2` | extra metadata |

This layer does **not** say which stations report level vs flow.

Sample:
```json
{"attributes":{"COD_BNA":"01001002","NOM_ESTACION":"Rio Caquena En Vertedero",
 "NOM_CUEN":"Altiplanicas","LATITUD":-17.99782714,"LONGITUD":-69.25700849,
 "VIGENCIA":"Vigentes"},"geometry":{"x":-69.257008,"y":-17.997827}}
```

### Readings - SNIA HTML scrape (harder)

The old `dgasatel.mop.cl` feed is **dead**. Readings migrated to SNIA:

1. `GET https://snia.mop.gob.cl/dgasat/pages/dgasat_param/dgasat_param.jsp?param=1`
   to obtain a **session cookie**.
2. `POST https://snia.mop.gob.cl/dgasat/pages/dgasat_param/dgasat_param_tablas.jsp`
   with form fields (same names the whitewater.guide harvester used):
   - `estacion1` (up to `estacion3`)
   - `chk_estacion1a` = `<code>_1` (water level "Nivel") and/or `<code>_12` (flow "Caudal")
   - `fechaInicioTabla` / `fechaFinTabla` (`dd/mm/yyyy`) or `period=1d` (incremental) / `3m` (backfill)
   - `tiporep=I`, `accion=refresca`, `UserID`

Response: **HTML table**, windows-1252. Columns matched by header text:
`Fecha-Hora`, `AltLM` (water level, **m**), `Caudal` (flow, **m³/s**).
Timestamps `dd/mm/yyyy HH:MM` in **America/Santiago** -> convert to UTC.
Cadence: ~hourly (satellite/GPRS).

Gotchas (de-risked 2026-08-15, see below - not yet re-implemented against
this, but both original blockers turned out to have simpler answers):
- ~~The exact `chk_estacion` checkbox codes are produced per-station by a
  "Ver Parámetros" AJAX step; capture them with a browser network trace.~~
  **Not true** - see below, they're deterministic.
- ~~**ID mismatch:** ArcGIS gives 8-digit `COD_BNA`; the readings app uses
  `NNNNNNNN-D` with a check digit (e.g. `10100002-8`). Derive/carry it.~~
  **Avoidable** - see below, don't source station IDs from ArcGIS at all.
- The app is flaky; the old harvester slept ~10s and retried.

License: DGA/MOP public-sector hydrometric data - attribute DGA/MOP.
Pattern reference: `github.com/whitewater-guide/gorge/tree/master/scripts/chile`.

### De-risking update (2026-08-15)

The two gotchas above were flagged 2026-08-10, before checking
`whitewater-guide/gorge`'s actual Go source (`scripts/chile/*.go`). Both
turned out to have simpler answers than feared - **not yet re-implemented
against this**, but the path is much clearer now:

- **`chk_estacion` codes are deterministic**, not AJAX-discovered per
  station: they're literally `{station_id}_1` (level) and `{station_id}_12`
  (flow). `gorge` POSTs the bare station id first and greps the returned
  HTML for the substring `{id}_1>` or `{id}_12>` to learn which parameters
  exist, then reuses the same deterministic codes in the actual data
  request. No browser capture needed.
- **The ArcGIS-vs-readings-app ID mismatch is avoidable**, not something to
  solve: `gorge` doesn't source its station list from the ArcGIS
  `COD_BNA` field at all - it gets station IDs from a separate SNIA-native
  KML/web listing (`getKMLGauges`/`getWebGauges` in `script.go`), sidestepping
  the check-digit conversion entirely. The endpoint for that KML/web listing
  wasn't located in this pass - that's the one remaining piece needed before
  Chile is fully implementable.

---

## Japan - MLIT (www1.river.go.jp)

### Station metadata - per-station HTML

```
GET http://www1.river.go.jp/cgi-bin/SiteInfo.exe?ID={15-digit id}
```

- HTML, **EUC-JP** encoded.
- Fields: 水系名 (water system), 河川名 (river), 所在地 (address),
  緯度経度 as **DMS** (e.g. `北緯 35度35分14秒 東経 139度40分05秒`) -> parse to decimal.
- `station_id` is a **15-digit** code.

There is **no single "all stations with coordinates" JSON** on this host. Build a
station master once by crawling `SiteInfo.exe` over the id set, then cache it as a
CSV (`id,name,river,lat,lon`). Seed the id set from the kawabou master (below).

### Readings - CSV, no auth

```
GET http://www1.river.go.jp/cgi-bin/DspWaterData.exe
    ?KIND=1&ID={15-digit id}&BGNDATE={YYYYMMDD}&ENDDATE={YYYYMMDD}&KAWABOU=NO
```

- `KIND=1` = hourly water level; `KIND=9` = 10-min water level. Discharge (流量)
  uses a different `KIND` - **unverified**; confirm the code + m³/s for a known
  流量 station before relying on it.
- **31-day** range cap per request; chunk longer spans.
- The response is an HTML "top page" that links a generated data file
  `/dat/dload/download/{...}.dat` - regex the href, then GET the `.dat`.
- The `.dat` is CSV (header Shift-JIS/EUC, data rows ASCII):
  ```
  観測所記号,303051283310020
  #日付,時刻,データ,フラグ
  2026/08/08,01:00,1.33,*
  ```
  Columns: date `YYYY/MM/DD`, time `HH:MM` (**JST**, no offset - treat as
  Asia/Tokyo), value (water level **m**; discharge **m³/s**), flag
  (`*`=confirmed, `$`=missing, `#`=closed, `-`=unregistered). Keep `*`, drop the rest.
- Near real-time (rows through ~2 days ago observed). Decode EUC-JP/Shift-JIS for
  headers, or just skip `#`/header lines and parse the ASCII data rows.

### Modern JSON alternative (kawabou SPA) - partial

```
GET https://www.river.go.jp/kawabou/file/files/master/sect/sect-all.json   (~507 KB)
```

Station records with a **13-digit** `obsFcd`, `obsNm`, river `rvrNm`, water-system
`rsysNm`, flood thresholds - but **no lat/lon**, and `obsFcd` != the 15-digit `www1`
ID. Realtime endpoints are built dynamically in the bundled JS (need a browser
network capture). Useful only as an id/name seed, not as a standalone source.

### License / terms

政府標準利用規約 v2.0, **CC-BY 4.0 compatible**: commercial + non-commercial use
with source attribution and disclosure of modifications; the numerical data itself
is outside copyright. The terms (`caution.html`) ask **regular/ongoing** collectors
to use FRICS's `河川情報数値データ配信事業` distribution service instead of scraping;
that FRICS feed is charged separately at cost-recovery (fees on
`river.or.jp/koeki/opendata/ryokin.html`, **not** on the MLIT terms page). For
low-volume, linked-gauge-only polling, the free `www1` scrape with throttling is
fine.

References: portal `river.go.jp/kawabou/pc/tm` · terms
`river.go.jp/kawabou/kwb_apend/html/caution.html` · FRICS fees
`river.or.jp/koeki/opendata/ryokin.html`.

---

## USA - USGS Water Data

By far the largest network of the five (14k+ live discharge stations), and
one of the two clean, documented APIs. Two stacks exist right now:

- **`api.waterdata.usgs.gov/ogcapi/v0`** - the new OGC Features API. **Build
  against this.**
- **`waterservices.usgs.gov/nwis`** - the legacy NWIS service. Still returns
  200 with valid data today, but is scheduled for decommission (no
  intentional degradation before Aug 2026, full sunset targeted Q1 2027). Use
  only as a fallback.

### Station list

```
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items
    ?site_type_code=ST        (ST = Stream)
    &limit=10000               (cursor pagination beyond this via links[rel=next])
    &f=json
```

- No "major filter" required - a nationwide query works, unlike the legacy
  site service (see below). All-time count with `site_type_code=ST`: **~155k**
  (includes long-discontinued sites; there's no `active` queryable here).
- `river` is **not a separate field** - parse it out of `monitoring_location_name`
  (free text, e.g. `"POTOMAC RIVER NEAR WASH, DC LITTLE FALLS PUMP STA"`).
- `lat`/`lon` come from `geometry.coordinates` (`[lon, lat]`, WGS84).

To find stations that actually have **live** discharge/stage data (not just
historically registered), query `time-series-metadata` or `latest-continuous`
instead and join back:

```
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items
    ?parameter_code=00060      (discharge; use 00065 for gage height)
    &limit=10000&skipGeometry=true&f=json
```
Verified counts: **14,238** stations currently reporting discharge, **13,283**
reporting gage height.

Legacy equivalent (works today, but requires looping per state/HUC/bbox - a
bare nationwide call 400s with "no major-filter pairs supplied"):
```
GET https://waterservices.usgs.gov/nwis/site/?format=rdb&stateCd=VA&siteType=ST&hasDataTypeCd=iv&parameterCd=00060&siteStatus=active
```

### Readings

Latest value, multiple sites/params in one request (comma-separated lists
work; **repeating the param key silently keeps only the last one**):
```
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items
    ?monitoring_location_id=USGS-01646500,USGS-01638500
    &parameter_code=00060,00065
    &skipGeometry=true&f=json
```
```json
{"monitoring_location_id":"USGS-01646500","parameter_code":"00060",
 "time":"2026-08-11T16:50:00+00:00","value":"3340",
 "unit_of_measure":"ft^3/s","approval_status":"Provisional"}
```

Time-series history:
```
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items
    ?monitoring_location_id=USGS-01646500&parameter_code=00060
    &datetime=2026-08-10T00:00:00Z/2026-08-11T00:00:00Z
    &limit=10000&f=json
```
5-min interval typically. History depth is deep and per-station - some series
run back to the early-to-mid 1900s (daily), IV data typically from the
1980s-2000s depending on telemetry install date; check `time-series-metadata`
`begin`/`end` for a given station.

Legacy IV (works, deeply nested WaterML-in-JSON, local time with offset
instead of UTC):
```
GET https://waterservices.usgs.gov/nwis/iv/?format=json&sites=01646500&parameterCd=00060,00065&period=P1D
```

### Units, timezone, auth, license

- **Units are imperial**: discharge `ft^3/s`/`ft3/s` (cfs), gage height `ft`.
  Convert: `m3/s = ft3/s × 0.0283168`, `m = ft × 0.3048`.
- New API timestamps are **UTC** (`+00:00`) throughout - normalize once.
  Legacy IV timestamps are **local site time with explicit offset**
  (DST-aware, e.g. `-04:00`) - parse per-site.
- **Auth: not required.** Optional API key (free signup at
  `api.waterdata.usgs.gov/signup`) raises the rate limit from ~100 req/hr/IP
  to ~1,000 req/hr, via `?api_key=` or `X-Api-Key` header.
- **License: US public domain.** Standard USGS open-data policy; legacy
  responses carry a "Provisional data are subject to revision" disclaimer -
  respect `approval_status`/`qualifiers` (`Provisional` vs `Approved`).

References: [decommission announcement](https://waterdata.usgs.gov/blog/api-waterservices-decom/),
[API key docs](https://api.waterdata.usgs.gov/docs/ogcapi/keys).

---

## Canada - ECCC / Water Survey of Canada (WSC)

The cleanest of the five: documented OGC API, no auth, permissive commercial
licence, national coverage.

### Station list - MSC GeoMet OGC API

```
GET https://api.weather.gc.ca/collections/hydrometric-stations/items?f=json&limit=10000
```

- **8,057** total stations; filter `STATUS_EN=Active` (2,896) and/or
  `REAL_TIME=1` (~2,100, has a live telemetry feed) to narrow to useful ones.
- Whole catalogue fits in one request (`limit=10000` returns all of it).
- Coordinates are **only in `geometry`** (`[lon, lat]`), not in `properties` -
  don't pass `skipGeometry=true` here.

Field mapping: `STATION_NUMBER` (id, e.g. `05BB001`), `STATION_NAME`,
`PROV_TERR_STATE_LOC` (province/territory, includes US border codes like
`ME`), `STATUS_EN`/`STATUS_FR`, `REAL_TIME` (0/1), `CONTRIBUTOR_EN/FR`,
`VERTICAL_DATUM`, `DRAINAGE_AREA_GROSS`.

### Readings - hydrometric-realtime collection

```
GET https://api.weather.gc.ca/collections/hydrometric-realtime/items
    ?STATION_NUMBER=05BB001&f=json&limit=100&sortby=-DATETIME
```
```json
{"properties":{"STATION_NUMBER":"05BB001","STATION_NAME":"BOW RIVER AT BANFF",
 "DATETIME":"2026-08-11T00:00:00Z","DATETIME_LST":"2026-08-10T17:00:00-07:00",
 "LEVEL":2.395,"DISCHARGE":56.9,
 "LEVEL_SYMBOL_EN":null,"DISCHARGE_SYMBOL_EN":null}}
```

- `LEVEL` = water level in **metres** (gauge datum, often station-relative -
  not comparable across stations without checking `VERTICAL_DATUM`).
  `DISCHARGE` = flow in **m³/s**. Either can be `null`.
- `DATETIME` = UTC; `DATETIME_LST` = local **standard** time (fixed offset,
  no DST shift, even in summer - confirmed on a BC station).
- Cadence: 5-minute. **History: exactly ~30 days rolling** (confirmed
  empirically and in the collection description).
- **Gotcha - one station per request.** `STATION_NUMBER=A,B` returns 0
  features, and CQL2 `IN (...)` filters are rejected. Fan out with N requests,
  or use `bbox=`/`PROV_TERR_STATE_LOC=` to scope a region, or switch to the
  bulk CSV below for many stations at once.
- `resulttype=hits` for a count-only query; `datetime=start/end` for a range;
  `limit` max 10,000 with `offset`/`next`-link paging.

### Bulk alternative - Datamart CSV (what whitewater.guide's harvester uses)

```
https://dd.weather.gc.ca/today/hydrometric/doc/hydrometric_StationList.csv
https://dd.weather.gc.ca/today/hydrometric/csv/{PROV}/hourly/{PROV}_hourly_hydrometric.csv   (~2.4 days, 5-min)
https://dd.weather.gc.ca/today/hydrometric/csv/{PROV}/daily/{PROV}_daily_hydrometric.csv     (~30 days, 5-min despite the name)
```
One file per province covers every station in it - much cheaper than N
per-station API calls if tracking many Canadian gauges. **Windows-1252**
encoded (accented French names break under UTF-8 decoding). Same
`LEVEL`/`DISCHARGE` semantics as the API.

Note two harvester quirks worth stealing from `gorge`'s `scripts/canada/`:
station codes sometimes come in paired `...0`/`...X` (main/auxiliary) forms
that need remapping, and the station list only gives fixed UTC offsets (no
IANA tz), so a province->timezone fallback table is needed alongside
coordinate-based lookup.

### Auth, limits, license

- **No auth**, no documented rate limit (no `X-RateLimit-*` headers observed);
  be a considerate caller (cache, prefer bulk CSV over per-station loops).
- **License: Open Government Licence - Canada**, worldwide royalty-free,
  commercial use permitted. Attribution required, e.g. *"Data Source:
  Environment and Climate Change Canada"*. Some stations are contributed by
  provinces (`CONTRIBUTOR_EN`) and should be named too.

---

## Pakistan - FFD (Flood Forecasting Division, PMD)

A real JSON API exists, but it is **undocumented/unofficial** - reverse
engineered from the public flood-monitoring site's own frontend calls, not a
published integration point. Treat it as more fragile than USA/Canada/Japan.

### What's there

`ffd.pmd.gov.pk` (Laravel app) embeds a "Flood Assistant" widget that calls
several open JSON endpoints - no auth, no token, no cookie:

```
GET https://ffd.pmd.gov.pk/home/river-status
```
Bulk summary, one row per river: `[{"river":"Indus","status":"low","label":"Low",
"rank":1,"station":"Guddu","discharge":"262,408"}, ...]`. Discharge is a
**formatted string with thousands separators** - de-comma it. Cheapest way to
get a quick overview, but see the data-quality caveat below.

```
GET https://ffd.pmd.gov.pk/flood-assistant/rivers
    (Accept: application/json)
```
**158 stations** in 9 groups (Indus 17, Kabul 33, Jhelum 18, Neelum 5, Chenab
7, Ravi 7, Sutlej 5, Nullahs 7, "Other stations" 59 - mostly `(Telemetry)`
duplicates). Each `{id, name, name_ur, is_dam}`. **No coordinates** in this
endpoint.

```
GET https://ffd.pmd.gov.pk/flood-assistant/station/{id}?lang=en
```
```json
{"ok":true,"station":{"id":60,"name":"Nowshera","code":"NO","river":"Indus","is_dam":false,
 "metric":"discharge","unit":"cusecs","status":"NORMAL",
 "current":{"timestamp":"2026-08-11T18:00:00+05:00","source":"PRIMARY",
   "inflow_discharge":29500,"outflow_discharge":29500,"inflow_level":5.7,
   "outflow_level":5.7,"dam_level":null,"flow":29500,"is_stale":false},
 "thresholds":[{"level":"LOW","min_discharge":60000}, ...],
 "season_peak":{"year":2026,"value":93024,"at":"08 Apr 2026 15:00"},
 "all_time_peak":{"year":2022,"value":336500,"at":"28 Aug 2022 18:00"},
 "trend":{"direction":"rising","delta":600,"pct":2.08,"points":2,"window_hours":6},
 "series":[{"t":"2026-07-13","v":42200}, ... 30 items]}}
```
Values here are **numeric** (unlike the comma-string `river-status`
summary). A name-lookup variant also exists: `GET .../flood-assistant/ask?q=Besham`.

Verified live for all 18 major barrages/dams (Tarbela, Kala Bagh, Chashma,
Taunsa, Guddu, Sukkur, Kotri, Nowshera, Marala, Khanki, Qadirabad, Trimmu,
Panjnad, Mangla, New Rasul, Balloki, Sulemanki, Islam).

- **Units:** discharge stations report `cusecs` (cubic feet/sec); dam
  stations report `ft` (pool elevation) with discharge embedded separately as
  `outflow_discharge`/`flow`, also cusecs. Convert: `m3/s = cusecs × 0.0283168`.
  Thresholds are sometimes quoted in *lacs* elsewhere on the site (1 lac =
  100,000 cusecs) - confirmed consistent with `min_discharge` in the JSON.
- **Cadence: ~6-hourly**, not irregular and not daily - `trend.window_hours: 6`
  with `points: 2` confirms readings land on a roughly 00/06/12/18 PKT cycle
  (a couple of stations, e.g. Marala, drift to a 22:00 slot). The `series`
  history field is **daily resolution only** (30 points, one per calendar
  day, no time-of-day) with **no date-range parameter** - build your own
  archive from `current` if you need the 6-hourly granularity or more than
  30 days back.
- **Data-quality caveat - river labels are unreliable.** `river-status`
  attributes the Neelum's representative reading to "Trimmu," which is
  physically on the Chenab. Nowshera is filed under `river:"Indus"` in
  `flood-assistant` but under `area_name:"Kabul River"` in the map feed
  (below). Garhi Habibullah is grouped under "Jhelum" but is physically on
  the **Kunhar** - don't trust the `river` field for basin assignment; map
  station id -> real river by hand from coordinates/names.
- **Rate limit:** response header `x-ratelimit-limit: 40` (per minute, not
  per hour) - cache, don't poll tightly.

### Coordinates - a separate, harder scrape

The station list above has no lat/lon. The interactive map
(`ffd.pmd.gov.pk/river-state?zoom=6`) loads a session cookie + `X-FW-Token`
- the page's own source comments it as anti-scraping. `GET /river-state/data`
is **403** without both; with the token *and* the session cookie from the same
request it's 200 and returns **31 stations** with lat/lon plus a `shape`
polyline of the river course (large - strip it if you only need the point).
Confirmed coordinates for Tarbela (34.106, 72.734), Marala (32.661, 74.411),
Guddu (28.420, 69.711), Skardu (35.338, 75.604), Besham (34.906, 72.867),
Nowshera (34.010, 71.985), and more. A second gated feed,
`/staff/discharge-report-carousel/data`, returned 403 in every attempt and
isn't usable at all. Two-step, session-bound, more fragile than
`flood-assistant/*` - only worth it for the one-time coordinate seed, not for
polling.

### `floodupdates.com` is not a separate source

Identical page title, identical built JS asset hash, byte-identical
`flood-assistant/rivers` **and** `home/river-status` responses - it's the same
Laravel app on a second hostname, not an independent dashboard. Don't treat
it as a fallback/mirror with independent uptime.

### WAPDA - not viable

`wapda.gov.pk/hydro-reservior` and `/hydrology`/`/daily-reservoir-report` are
404. `wapda.gov.pk/river-flow-data/` is a WordPress archive with two posts
dated 20 Dec 2024 ("River Flow", "Water Situation") that contain **zero
tables, zero PDF links, zero data** - nav chrome only, not stale data but no
data at all. `wrh.wapdamis.gov.pk` (linked from the WAPDA site) turned out to
be an unrelated Rest House booking system with a self-signed placeholder TLS
cert. `www.wapdamis.gov.pk` and `archive.wapda.gov.pk` are unreachable
(connection reset). **WAPDA publishes nothing fetchable** - its numbers only
reach the public *through* FFD, which credits "WAPDA, Irrigation and Police
sources" as its own inputs.

### Coverage vs. actual whitewater rivers

Station-by-station verification (not just catalog presence - many catalogued
stations return `current: null` or `series: []`, i.e. listed but not
reporting):

| Reporting live | River (real) | Note |
|---|---|---|
| Skardu, Partab Bridge, Besham | Indus | upper Indus / Rondu / gorge runs |
| Garhi Habibullah | **Kunhar** (mislabeled "Jhelum" in the API) | Kunhar / Naran run |
| Muzaffarabad, Domel, Azad Pattan, Chattar Kallas | Jhelum / Neelum confluence | Kohala-Azad Pattan corridor |

| Catalogued but NOT reporting (`current: null` or empty `series`) | |
|---|---|
| Khwazakhela, Chakdara (Swat), Dir (Panjkora) | Swat basin is in the catalog but dark |
| Sharda, Taobat (upper Neelum) | empty series, no data at all |
| Warsak, Munda Head Works | Kabul tributaries |
| All `... (Telemetry)` ids (the "Other stations" 59) | telemetry tier is staff-only |

Gilgit-Baltistan's other paddling rivers - Hunza, Gilgit, Astore, Braldu,
Shigar - don't appear in the catalog at all.

**Net:** strong, live coverage for main-stem barrages/dams plus the
Jhelum-Neelum-confluence corridor and the big-water Indus (Skardu/Besham) -
and, unexpectedly, a genuinely live gauge on the **Kunhar** (Garhi
Habibullah), a real Pakistani whitewater run. But **Swat and the upper
Neelum are catalogued and then silent** - don't assume catalog presence means
live data; check `current` per station before relying on it.

### Terms and anti-scraping signals

No terms-of-use or data-reuse policy page exists anywhere on the site;
footer reads only "All rights reserved." `robots.txt` allows generic clients
(`User-agent: * / Allow: /`) and sets Cloudflare's `Content-Signal:
search=yes, ai-train=no, use=reference` - crawling for reference/display is
not blocked, only AI-training use is refused, and several named AI crawlers
get an explicit `Disallow`. The `X-FW-Token` gate on the map/carousel
endpoints (above) is a separate, explicit anti-scraping measure - respect it
by treating those two as a one-off seed, not a polling target. A plain-UA
`curl` gets 200 where some bot user agents get Cloudflare 403s.

### Verdict

**Viable** for main-stem barrages plus a handful of real whitewater gauges
(Kunhar, Jhelum-Neelum corridor, upper Indus) via the open, undocumented
`flood-assistant`/`home/river-status` endpoints - structured, no auth, tested
working end to end, ~6-hourly cadence, 30-day daily history. **Not viable**
via WAPDA. Coordinates need a separate, more fragile token-gated scrape,
one-time only. Attribute to "Flood Forecasting Division, Pakistan
Meteorological Department" - no open licence is stated, so treat as
display-with-attribution rather than redistribution.

---

## Brazil - ANA (Agência Nacional de Águas) - implemented

**Implemented** in `api/river-gauge/src/brazil_ana.rs` (provider key `ana`).
Everything below is verified live 2026-08-15 and matches the code.

### Station list - legacy SOAP/REST-hybrid ASMX service (works via plain GET)

```
GET https://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroInventario
    ?codEstDE=&codEstATE=&tpEst=1&nmEst=&nmRio=&codSubBacia=&codBacia=
    &nmMunicipio=&nmEstado=&sgResp=&sgOper=&telemetrica=1
```

- All 12 params optional; blank `nmEstado` (and every other filter) returns
  the **whole national catalog in one request** - no need to loop per state.
  Verified live: **4,311 telemetric stations**, 14.9 MB response.
- No auth, no published rate limit. Response is a .NET `DataSet` diffgram
  XML; the root element is `<DataSet xmlns="http://MRCS/">`, data rows are
  `<Table>` under `<diffgr:diffgram><Estacoes>`.

Field mapping:

| Field | Use |
|---|---|
| `Codigo` | station id (`source_id` prefix), e.g. `57735000` |
| `Nome` | station name |
| `RioNome` | river name |
| `Latitude` / `Longitude` | WGS84 decimal, already signed correctly |
| `TipoEstacaoEscala` | `"1"` = has a level/staff gauge (our `W` param) |
| `TipoEstacaoDescLiquida` | `"1"` = has a discharge rating curve (our `Q`) |
| `Operando` | `"1"` = operational; filter out everything else |

### Readings - same ASMX service, one station per request, real history

```
GET https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos
    ?codEstacao=57735000&dataInicio=13/08/2026&dataFim=15/08/2026
```

- One station per request (no batch param) - same shape as Canada's WSC API,
  see `canada_wsc.rs` for the per-station-loop pattern this reader copies.
- Date params `dd/MM/yyyy`. Verified a **45-day window returns the full
  expected row count with no truncation** (1,080 hourly rows for a 45-day
  span) - likely deeper, not verified further.
- Root element is `<DataTable xmlns="http://MRCS/">` this time (not
  `<DataSet>`); rows are `<DadosHidrometereologicos>` under
  `<diffgr:diffgram><DocumentElement>`. **Note the misspelling**: the schema
  and endpoint name say "Hidrometeorologicos" but the actual data element is
  "Hidrometere*ologicos*" (extra stray "e") - verified live, not a typo here.
- Fields: `DataHora` (has a **trailing space**, trim before parsing),
  `Vazao` (discharge, **m³/s**, empty element `<Vazao />` when unavailable),
  `Nivel` (level, **cm**, same empty-element convention), `Chuva` (rain, mm,
  unused).
- Timezone: **America/Sao_Paulo**, a **fixed UTC-3** year-round since Brazil
  abolished DST in 2019 - `chrono-tz`'s database already reflects this
  correctly, no special-casing needed.

### quick-xml gotcha worth remembering for any future .NET-DataSet API

Elements with a namespace prefix in the raw XML (`<diffgr:diffgram>`) must be
matched in `#[serde(rename = "...")]` by their **local name only**
(`"diffgram"`, not `"diffgr:diffgram"`) - `quick_xml::de` strips the prefix
before matching. Using the prefixed form fails with a silent-looking
`missing field` error that doesn't mention the prefix at all.

License: Brazilian federal open data (Lei de Acesso à Informação /
dadosabertos.ana.gov.br) - attribute ANA.

Gotcha: ANA is mid-migration to a newer, email-gated REST API
(`www.snirh.gov.br/hidroweb/rest/api/estacaotelemetrica`). The legacy ASMX
service used here is documented to stay live through **2026-06-30** on a
secondary, slightly-delayed DB - expect a forced migration after that date.
The parallel ArcGIS catalog (`snirh.gov.br/arcgis/rest/services/
Telemetria_BH/*`) looked promising but returned empty layers live - dead
end, don't bother with it.

---

## Argentina - INA (SNIH / alerta.ina.gob.ar) - researched, not implemented

### Self-describing REST API

Base `https://alerta.ina.gob.ar/pub/datos/` - a bare GET returns a JSON
catalog of every sub-resource (`estaciones`, `series`, `datos`, `variables`).

```
GET https://alerta.ina.gob.ar/pub/datos/estaciones?format=json
```
Verified live: `{data: [...]}`, 22 fields/station incl. `sitecode`,
`nombre`, `rio`, `lat`, `lon`, `automatica` (telemetric flag), `tipo_nombre`
(Hidrológica/Meteorológica/Virtual).

```
GET https://alerta.ina.gob.ar/pub/datos/series?estacion_id=2&format=json
```
One row per (variable × procedure): e.g. `series_id=1` → "Altura
hidrométrica" (level, m, medición directa), a separate `series_id` for
"Caudal" (flow, m³/s, medición directa). Pick `medición directa` rows, skip
`Simulado`/`Curva de gasto`.

**Not implemented because**: the actual readings endpoint

```
GET https://alerta.ina.gob.ar/pub/datos/datos?series_id=1&timeStart=...&timeEnd=...
```

returned `{"mensaje": "Argumento timeStart faltante."}` ("missing timeStart
argument") on every variant tried (bare date, ISO 8601, different casing)
even with the param present. Likely a param-name or encoding mismatch, e.g.
it may want `estacion_id`+`var_id` instead of `series_id` - needs someone to
crack the exact working request (browser network trace against the real
`alerta.ina.gob.ar` dashboard would probably solve it in minutes) before this
is implementable. License: SNIH states data access is free under a Creative
Commons license.

---

## Colombia - IDEAM / DHIME - researched, not implemented

Real ArcGIS REST services, confirmed live:

```
GET http://dhime.ideam.gov.co/server/rest/services/CNE/Estaciones/MapServer/0
GET http://dhime.ideam.gov.co/server/rest/services/CNE/Estaciones_edit/FeatureServer/0
```

National Station Catalog (CNE) layer: point geometry, JSON/GeoJSON query
support, max record count 10,000, carries "additional Aquarius attributes"
(Aquatic Informatics' Aquarius telemetry-management software - implies
genuine live telemetry behind it, not a static list). IDEAM states ~400
hydrological stations report river levels hourly, near-real-time.

**Not implemented because**: `dhime.ideam.gov.co` is **HTTP-only** - refused
an HTTPS connection outright (`ECONNREFUSED` on 443; fine for a real
`reqwest` client, just don't force TLS). The separate readings/telemetry
endpoint (station catalog ≠ time-series data, same split as Chile's
DGA/SNIA) wasn't located in this pass - needs a follow-up from an
environment with plain-HTTP reach to this host to find the field names and
readings URL. License: government open data; IDEAM attribution presumably
required, not independently confirmed.

---

## Peru, Ecuador, Bolivia - researched, dead ends or unconfirmed

- **Peru (SENAMHI)**: no public unauthenticated API found; the download page
  is a dead landing page and the automatic-stations page is login-gated.
  Third-party ArcGIS mirrors of SENAMHI station metadata exist on other
  Peruvian government GIS portals (INDECI's `geosinpad.indeci.gob.pe/indeci/
  rest/services/Ent_Tecnico_Cientificas/SENAMHI/MapServer`, GEOCATMIN,
  SEDAPAL) but weren't reachable in this pass (DNS timeout) and may only
  carry metadata, not readings.
- **Ecuador (INAMHI)**: `geoservicios.inamhi.gob.ec` is a real, live geoportal
  explicitly advertising open hydrometeorological data, but the landing page
  doesn't expose the underlying service URL - needs someone to browse its
  Datasets/Maps catalog to find the actual REST endpoint. (Separately,
  `inamhi.geoglows.org` is a satellite/model streamflow *forecast* platform,
  not ground-gauge telemetry - different data character, only useful as a
  supplementary source.)
- **Bolivia (SENAMHI)**: dead end. Data is published only as PDF bulletins;
  no evidence of a programmatic access point.

---

## Mexico, Central America, Uruguay, Paraguay, Venezuela - surveyed, mostly dead ends

**Mexico (CONAGUA)** got a deep dig and is a dead end for near-real-time use:
SIH (`sih.conagua.gob.mx`) is CSV-only, updated **weekly**, coordinates only
in a separate bot-blocked catalog file; SINA (`sinav30.conagua.gob.mx:8080`)
explicitly caps data at the prior December (annual, not current) aside from
a dam-storage module (daily, but dams ≠ river gauges); `datos.gob.mx`'s
hydrometric listing is the same weekly CSV export. A station-metadata-only
reader (name/code/basin, no live readings) is technically possible but not
worth building - too stale to reflect current conditions.

| Country | Agency | Finding |
|---|---|---|
| Costa Rica | IMN | Only **one** hydrological station total; HTML-only, no API. |
| Panama | ETESA/IMHPA | ~67 stations exist (8 automatic/satellite) but `hidromet.com.pa` is unreachable - infrastructure too unreliable right now. |
| Guatemala | INSIVUMEH | Informational maps only, no coordinates, no API; the 5 real stations feed an internal early-warning system, not public. |
| Honduras | COPECO/CENAOS | Weather-focused portal; hydrology section referenced but no data/API exposed. |
| El Salvador | MARN/SNET | Best lead of the group - "10 telemetric stations, 15-min readings" per search snippets - but the `caudales` page is bot-blocked (403). Worth a manual follow-up with a real browser. |
| Nicaragua | INETER | Nothing usable surfaced. |
| Uruguay | DINAGUA | CKAN portal confirmed but datasets are stale annual releases (2017-2019, last updated 2022-03) - not real-time, no coordinates. |
| Paraguay | DINAC | **Best lead in this batch.** `meteorologia.gov.py/nivel-rio/indexautomatica.php` is a live, auto-updating table ("actualizados en intérvalos de 10 minutos") covering multiple rivers. No JSON endpoint visible in the raw HTML, but the 10-minute auto-refresh strongly implies a backing AJAX/JSON call - needs a browser network trace to find it (same gotcha pattern as Chile's SNIA scrape). |
| Venezuela | - | Nothing usable surfaced; known-weak government open-data infrastructure. |

---

## Sri Lanka - mevinu.com aggregator - implemented

**Implemented** in `api/river-gauge/src/srilanka_mevinu.rs` (provider key
`lk`). Verified live 2026-08-15.

```
GET https://slwaterlevel.mevinu.com/api/data
```

No auth. One JSON array, one row per station (confirmed: 40 rows, 40 unique
`gauge` names, no duplicates - not an append-only reading log despite
sequential `objectid`s). ArcGIS-FeatureServer-shaped, strongly implying a
hosted Esri feature layer underneath:

```json
{"attributes":{"objectid":1476823,"basin":"Kelani Ganga","gauge":"Deraniyagala",
 "water_level":2.78,"EditDate":1786740495538, ...},
 "geometry":{"x":80.339475,"y":6.925716666666666}}
```

- `gauge` = station name (used as `source_id`, unique within a snapshot but
  not a guaranteed-stable code - switch to a real station code if the
  aggregator ever exposes one). `basin` = river name. `geometry.x`/`.y` =
  WGS84 lon/lat. `water_level` = metres, converted to **cm** to match this
  app's convention. `EditDate` = Unix ms, used as the reading timestamp (the
  aggregator has no separate reading-time field; a row's `EditDate` updates
  whenever its value changes).
- No discharge field, no history endpoint - snapshot-only provider, water
  level only.
- No stated license; original data is Sri Lanka's Irrigation Department
  telemetry - attribute the Department plus the aggregator.

---

## Nepal - DHM river-watch - implemented

**Implemented** in `api/river-gauge/src/nepal_dhm.rs` (provider key `np`).
Verified live 2026-08-15.

```
POST https://dhm.gov.np/site/riverWatchTableViewData
```

No auth, empty body. Verified live: **337 stations, 203 currently
reporting** a value (the rest carry a blank `waterLevel` and are skipped).
Station names cover major whitewater put-ins: Kali Gandaki at Jomsom,
Karnali at Chisapani, Bhote Koshi at Kodari, Trishuli/Narayani at
Narayanghat.

```json
{"basin":"Koshi","id":4903,"name":"Bhote Koshi at Kodari",
 "waterLevel":{"datetime":"2026-08-14T21:15:00+00:00","value":20.294},
 "warning_level":"4.0", ...}
```

- `waterLevel` is **either** the object shape above **or** a blank string
  (`" "`) when the station has no current reading - handle both, don't
  assume the object shape unconditionally.
- `datetime` is already UTC (explicit `+00:00`), no conversion needed.
- **Two open gaps, unresolved in this pass**:
  1. **No coordinates in this endpoint.** The site's map view implies a
     separate endpoint (`getRiverWatchMapFilterData`, triggered by a
     serialized filter-form POST body) exists, but its exact field names
     weren't cracked - a browser network trace of the map tab, or reading
     the `#filter_Data` form's `name=` attributes from the page HTML,
     would likely solve this quickly. Shipped without coords for now, same
     situation as `wales_nrw`.
  2. **Unit not confirmed.** `waterLevel.value` (e.g. 20.294 for Bhote
     Koshi at Kodari, against a `warning_level` of 4.0) doesn't obviously
     read as plain metres against its own thresholds. Stored as-is,
     uninterpreted - don't assume metres without checking a known station.
- No stated license; Government of Nepal service - attribute DHM.

---

## India, Bhutan - researched, no live feed found

- **India (CWC)**: the live flood dashboard (`cwc.gov.in/ffm_dashboard`) is
  gated (401). The **National Water Data Portal** (`nwdp.nwic.gov.in`) is a
  real, public **CKAN** instance (standard `api/3/action/package_show`
  endpoint, no auth) hosting "River Water Level (Telemetry - Hourly), CWC" -
  58 per-basin CSV resources, but **batch historical data through 2025**,
  not live telemetry (same character as Mexico/Uruguay above). FloodWatch
  India (mobile app, 392 stations) is apparently the real-time-facing
  product but has no public web API found - would need APK traffic
  inspection to find one.
- **Bhutan (NCHM)**: dead end. `nchm.gov.bt` has no hydrology/flood/river
  data link anywhere on its site.

---

## Georgia, Armenia, Turkey - researched, mostly dead ends

- **Georgia (NEA/hydromet.ge)**: dead end. `/data/` lists only 3 sample
  stations with descriptive metadata (coordinates, names) - no readings, no
  download links, no API. `/maps/` is static PNG images only.
- **Armenia (HMC)**: dead end. River/lake/reservoir data is published as
  daily bulletin documents, not an API.
- **Turkey (DSİ)**: real infrastructure exists - a genuine Flood Early
  Warning System (TEUS) with real-time water-level sensors at 35 flood-risk
  points (6 with live video) - but the public dam-level dashboard
  (`yagisbarajdoluluk.dsi.gov.tr`) refused every connection attempt from
  this environment (HTTPS and plain HTTP both `ECONNREFUSED`), and no
  public URL for the TEUS river-gauge network specifically (as opposed to
  the dam dashboard) was found. Worth a retest from a different network
  before concluding it's inaccessible.

---

## Kyrgyzstan, Tajikistan, Kazakhstan - researched, dead ends or inaccessible

- **Kyrgyzstan (Kyrgyzhydromet)**: dead end. `meteo.kg` states network specs
  (79 hydrological posts) but exposes no API, portal, or map.
- **Tajikistan**: dead end, nationally and via the regional CAREWIB
  (`cawater-info.net`) aggregator, which turned out to be a static
  knowledge portal with no live monitoring feed.
- **Kazakhstan (Kazhydromet)**: real data exists - an interactive map
  (opened August 2024) covering **377 stations** (329 river), reporting
  level/temperature/discharge daily at 12:00 local time. Lives at
  `ecodata.kz:3838/app_dg_map_ru/` - the `:3838` port and `app_*` naming is
  the signature of an **R Shiny app** (session/websocket reactive UI, no
  plain REST API by default). Unreachable (`ECONNREFUSED`) on this pass,
  transient or permanently firewalled unconfirmed. Not a clean dead end,
  but not implementable from what's confirmed here.

---

## Vietnam, Laos, Thailand, Philippines, Indonesia - real telemetry exists, blocked by JS frontends

- **Vietnam / Laos / Thailand (Mekong River Commission)**: real
  infrastructure confirmed - MRC operates **58 automated telemetry
  stations** (plus 139 traditional) across the Mekong mainstream/tributaries
  spanning these three countries plus Cambodia, at **15-minute** intervals.
  Portals: `portal.mrcmekong.org`, `monitoring.mrcmekong.org`,
  `monitoringwidget.mrcmekong.org`. **Not implementable from this pass**:
  all three are JS SPAs returning only a page shell over plain HTTP fetch,
  with no discoverable REST path by guessing. Needs a browser devtools
  network trace to find the real backend. Separately, MRC's own docs say
  raw data access is "guided by the MRC's PDIES" data-sharing policy - even
  once found, it may not be fully open.
- **Philippines (PAGASA)**: real infrastructure confirmed - PAGASA's Flood
  Forecasting and Warning System runs real-time gauges (Marikina, Pampanga,
  and others) updating every **10 minutes**; a third-party aggregator,
  ProjectLIGTAS (`projectligtas.com/flood_monitoring`), surfaces 16 of them
  on a public dashboard. Same blocker as Mekong: no discoverable JSON/API
  endpoint in the static HTML, needs a network trace.
- **Indonesia**: dead end nationally. BMKG (`data.bmkg.go.id`) publishes
  weather/earthquake open data only, no hydrological/river-level data. The
  one lead found (a Jakarta provincial flood-canal water-level feed) is
  local urban flood-control infrastructure, not a whitewater river.

---

## China, South Korea - one dead end, one real API pending a retest

- **China**: dead end. No public real-time river-level API found from
  `mwr.gov.cn` or any national portal; a 2023 Nature Water article
  ("Making China's water data accessible, usable and shareable") confirms
  this is a known, documented, unsolved open-data gap. (Aside, out of
  scope: Taiwan's `data.gov.tw` has a real "Real-time water level data"
  open dataset, a separate lead if Taiwan is ever wanted.)
- **South Korea (WAMIS)**: real API exists, structurally similar to `nve`/
  `usgs` in this codebase (free registered key required):
  ```
  GET http://www.wamis.go.kr:8080/wamis/openapi/wkw/wl_hrdata
      ?key={API_KEY}&obscd={station_code}&startdt=YYYYMMDD&enddt=YYYYMMDD&output=json
  ```
  Confirmed max 6-month window per request; sibling `wkw/rf_hrdata` is
  rainfall. **Not implemented because**: (1) the station-list/coordinates
  endpoint wasn't confirmed live (naming convention suggests something like
  `wkw/wl_obsinfo`, unverified), and (2) `www.wamis.go.kr:8080` refused the
  connection from this environment - possibly geo-restricted, worth a
  retest from elsewhere before registering for a key.

---

## At a glance

| | Chile DGA | Japan MLIT | USA USGS | Canada ECCC | Pakistan FFD | Brazil ANA | Sri Lanka mevinu | Nepal DHM |
|---|---|---|---|---|---|---|---|---|
| Station list | ArcGIS JSON, 786 stations, coords included (easy) | no bulk coord list; crawl `SiteInfo.exe` (medium) | OGC API, ~155k historical / ~14k live discharge (easy) | OGC API, 8,057 stations, ~2,100 real-time (easy) | JSON, 158 stations, **no coords** (medium - coords need a second, token-gated scrape) | ASMX/XML, 4,311 telemetric stations, one request, coords included (easy) | JSON, 40 stations, coords included, one request (easy) | JSON, 203 reporting stations, one request, **no coords** (easy, but coords missing) |
| Readings | SNIA HTML-table scrape, session + per-station codes; de-risked 2026-08-15, see above (medium-hard) | `www1` `.dat` CSV, 2 GETs/station, 31-day windows (medium) | OGC API, batched multi-site/param (easy) | OGC API, **one station per request**; bulk CSV for many (easy-medium) | JSON, `current` + 30-day daily `series` (easy, but undocumented) | Same ASMX service, **one station per request** (easy) | Same JSON snapshot as station list (easy) | Same JSON snapshot as station list (easy) |
| Units | level m, flow m³/s | level m (flow = other `KIND`, TBD) | **cfs, ft** (convert) | level m, flow m³/s | **cusecs, ft** (convert) | level **cm**, flow m³/s | level **cm** (converted from m); no flow field | level, **unit not confirmed** - stored as-is |
| Timezone | America/Santiago | Asia/Tokyo | UTC (new API) / local+offset (legacy) | UTC + local-standard-offset | local +05:00, ~6-hourly cadence | America/Sao_Paulo, fixed UTC-3 (no DST since 2019) | UTC (Unix ms `EditDate`) | UTC (explicit `+00:00` in feed) |
| History depth | not verified | ~5 days via feed (per earlier readers), 31-day windows | decades, per-station | ~30 days rolling | ~30 days, daily resolution only, no range param | **45+ days** verified, likely deeper | snapshot only | snapshot only |
| Auth | none | none | none (optional key: 100->1000 req/hr) | none | none (x-ratelimit-limit: 40/min) | none | none | none |
| License | DGA/MOP open data | CC-BY 4.0 compatible | US public domain | Open Government Licence - Canada | none documented (unofficial API) | Federal open data (attribute ANA) | none documented (third-party aggregator) | none documented (attribute DHM) |
| Overall | medium-hard, now implementable | medium | **easy** | **easy** | medium; real but partial whitewater relevance (Kunhar yes, Swat catalogued-but-dark) | **easy - implemented** | **easy - implemented** | **easy - implemented**, two open gaps (coords, unit) |

Argentina, Colombia, Peru, Ecuador, Bolivia, Mexico, Central America,
Uruguay, Paraguay, Venezuela, India, Bhutan, Georgia, Armenia, Turkey,
Kyrgyzstan, Tajikistan, Kazakhstan, Vietnam, Laos, Thailand, Philippines,
Indonesia, China and South Korea were also researched 2026-08-15 - see the
sections above for what's confirmed, what's a dead end, and what just needs
a follow-up pass. The concrete unblocking steps identified across both
batches: Argentina's `datos` endpoint param shape, Colombia's readings
endpoint, Paraguay's backing AJAX call, Chile's SNIA-native station-list
endpoint, Nepal's map/coordinate endpoint, Turkey's dashboard reachability,
Kazakhstan's Shiny-app reachability, South Korea's WAMIS reachability plus
its station-list endpoint, and a browser network trace for the Mekong River
Commission (Vietnam/Laos/Thailand) and PAGASA (Philippines) - both of which
have real, confirmed telemetry hidden behind a JS frontend.
