# Paddlemate

Platform for whitewater paddlers: rivers, sections and rapids on a map, live
water levels, and a shared logbook.

## Features

- **Map** — rivers, sections and their features with difficulty labels, a
  satellite layer, and put-in/take-out markers colored by live water status.
  A light base map where the selected section and region stand out.
- **Search** — find rivers by name, section, translation or rapid name;
  accent-, digraph- and typo-tolerant, with an explanation of why each result
  matched. Area search by map point and radius; region search that turns the
  map into the picker - every valley, district, state and mountain range in
  view is outlined and clickable, filled from OpenStreetMap as you go;
  a Filters sheet for country, grade and the water level right now (kept in
  the URL).
- **Sections & features** — named paddleable stretches with typed features:
  rapids, hazards, structures, portages, access points, play spots. The section
  view puts the gauge chart on top, a feature strip with folding range bands
  under it, and tabs for features, logs, notes and sources, with the change
  history one tap away.
- **Water levels** — live gauge readings from public hydrological services;
  per-feature low/medium/high ranges classify the current level, shown on
  markers, chips and a per-section chart.
- **Logs** — record a descent across one or more sections; counts per section,
  a log list in the section view, and your descents shaded into the gauge
  chart at the level you paddled.
- **Trips** — plan a paddling week together, private to the people invited to
  it: a shared list of bases that moves with the group, the sections watched
  from each, who is coming and when, and every member's logs from the trip in
  one place, private ones included. Friends join through an invite link, even
  before they have an account. Open trips update live as others change them, a
  bell collects what changed while you were away, and a phone can get a push
  when the plan changes.
- **Languages** — section and rapid names in any language, with a per-device
  display language applied live, map labels included.
- **Proposals** — an edit by a non-admin shows the old value struck through
  beside the new one; reviewers approve or reject in a dialog.
- **Inbox, settings and tools** — the inbox lists what changed on your trips;
  settings hold account, display language, notifications and access tokens
  (shown once); the Tools page opens the gauge catalog.
- **Community** — voting on proposals, comments on
  sections and features, favorites, follows, and per-user or
  per-group visibility of logs.
- **Access** — Keycloak (OIDC) sign-in, API tokens for programmatic use,
  public read access to rivers and water data.

## Documentation

| | |
|---|---|
| [Setup](doc/setup.md) | Requirements, running the stack, test data |
| [Design language](doc/design.md) | Layout patterns, color rules, and the tokens behind them; links the design system |
| [End-to-end tests](frontend/e2e/README.md) | How the Playwright specs are laid out and run |
| [Rivers, sections and features](doc/rivers-and-features.md) | The core data hierarchy, feature types, water levels and gauges |
| [Fetching gauge data](doc/fetching-gauge-data.md) | Fetch recipes for gauge networks outside our provider set - endpoints, fields, units, gotchas, per country |
| [Gauge providers and whitewater.guide](doc/gauge-data-and-whitewater-guide.md) | Coverage vs. whitewater.guide's `gorge` sources, and whether their section data/content can be reused |
| [Trips](doc/trips.md) | Planning a trip together: bases, watch lists, membership and invite links, and how logs are credited |
| [Search](doc/search.md) | What you can type, how results rank, normalization and the REINDEX rule |
| [Translations](doc/translations.md) | Display language, translation endpoints, language codes end to end |
| [API](api/README.md) | Database schema, authentication, Keycloak setup |
