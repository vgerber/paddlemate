# Paddlemate

Platform for whitewater paddlers: rivers, sections and rapids on a map, live
water levels, and a shared logbook.

## Features

- **Map** — rivers, sections and their features with difficulty labels, a
  satellite layer, and put-in/take-out markers colored by live water status.
- **Search** — find rivers by name, section, translation or rapid name;
  accent-, digraph- and typo-tolerant, with an explanation of why each result
  matched. Area search by map point and radius; region search that turns the
  map into the picker - every valley, district, state and mountain range in
  view is outlined and clickable, filled from OpenStreetMap as you go;
  filters for country and grade.
- **Sections & features** — named paddleable stretches with typed features:
  rapids, hazards, structures, portages, access points, play spots.
- **Water levels** — live gauge readings from public hydrological services;
  per-feature low/medium/high ranges classify the current level, shown on
  markers, chips and a per-section chart.
- **Logs** — record a descent across one or more sections; counts per section,
  a log list in the section view, and your descents shaded into the gauge
  chart at the level you paddled.
- **Languages** — section and rapid names in any language, with a per-device
  display language applied live, map labels included.
- **Community** — proposals with review and voting for non-admin edits,
  comments on sections and features, favorites, follows, and per-user or
  per-group visibility of logs.
- **Access** — Keycloak (OIDC) sign-in, API tokens for programmatic use,
  public read access to rivers and water data.

## Documentation

| | |
|---|---|
| [Setup](doc/setup.md) | Requirements, running the stack, test data |
| [Design language](doc/design.md) | Layout patterns, color rules, and the tokens behind them |
| [Rivers, sections and features](doc/rivers-and-features.md) | The core data hierarchy, feature types, water levels and gauges |
| [Fetching gauge data](doc/fetching-gauge-data.md) | Fetch recipes for gauge networks outside our provider set - endpoints, fields, units, gotchas, per country |
| [Gauge providers and whitewater.guide](doc/gauge-data-and-whitewater-guide.md) | Coverage vs. whitewater.guide's `gorge` sources, and whether their section data/content can be reused |
| [Search](doc/search.md) | What you can type, how results rank, normalization and the REINDEX rule |
| [Translations](doc/translations.md) | Display language, translation endpoints, language codes end to end |
| [API](api/README.md) | Database schema, authentication, Keycloak setup |
