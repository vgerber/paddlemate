# Paddlemate

Platform for whitewater paddlers: rivers, sections and rapids on a map, live
water levels, and a shared logbook.

## Features

- **Map** - rivers, sections and their features with difficulty labels, a
  satellite layer, and put-in/take-out markers colored by live water status.
  A light base map where the selected section and region stand out. While a
  search filter is set the map draws only the sections the list shows.
- **Wide screens** - from 768px the map fills the window and the screen floats
  over it as cards (list, open item, side panel); the map frames what you
  are looking at. From 1280px wide a section with a gauge gets a reading
  rail: its own chart card beside the section card, with a values pane for the
  latest reading and how old it is. A borderless chart with Low, Medium and
  High written on the threshold lines; pointing at the plot shows that value
  in the plot. Phones keep their own screens, with tabs you swipe between.
- **Search** - find rivers by name, section, translation or rapid name;
  accent-, digraph- and typo-tolerant, with an explanation of why each result
  matched. Area search by map point and radius; region search that turns the
  map into the picker - valleys, districts, mountain ranges and states in
  view are outlined and clickable, one kind at a time, chosen by a segmented control or the zoom, a phone previews a tap before it picks;
  typo-tolerant by name, and an English country name lists its regions. Regions are
  filled from OpenStreetMap as you go. A Filters sheet for country, grade and
  the water level right now (kept in the URL). The empty search lists your
  starred sections and recent rivers, each river ending in level dots.
- **Sections & features** - named paddleable stretches with typed features:
  rapids, hazards, structures, portages, access points, play spots. The section
  view puts the gauge chart on top, a feature strip with range bands
  under it, and tabs for features, logs, notes and sources, with the change
  history one tap away. A grade covering 80% or more of the run is the
  section's grade, with a harder stretch in brackets ("III (IV)"). A river
  state block shows the latest hazard, last descent, newest note and open
  proposals.
- **Water levels** - live gauge readings from public hydrological services;
  per-feature low/medium/high ranges classify the current level, shown on
  markers, chips, level dots and a per-section chart. The chart covers 24
  hours up to a year or a custom From/To range of up to five years, draws the
  low-high band where readings are averaged, and zooms by dragging a span
  across the plot.
- **Logs** - record a descent across one or more sections; counts per section,
  a log list in the section view, and your descents shaded into the gauge
  chart at the level you paddled.
- **Trips** - plan a paddling week together, private to the people invited to
  it: a shared list of bases that moves with the group, the sections watched
  from each (a closed base ends in level dots, one per run), who is coming and
  when, and every member's logs from the trip in one place, private ones included. Friends join through an invite link, even
  before they have an account. Open trips update live as others change them, a
  bell collects what changed while you were away, and a phone can get a push
  when the plan changes.
- **Languages** - section and rapid names in any language, with a per-device
  display language applied live, map labels included.
- **Proposals** - an edit by a non-admin shows the old value struck through
  beside the new one; reviewers approve or reject in a dialog.
- **Inbox, settings and tools** - the inbox lists what changed on your trips;
  settings hold account, display language, notifications and access tokens
  (shown once); the Tools page opens the gauge catalog.
- **Dark mode** - Settings > Appearance offers System, Light and Dark, kept
  per device. System, the default, follows the phone or computer live; the map,
  charts and markers recolour with the app, and print is always light. The
  installed app keeps a dark frame (status bar and system buttons) on a dark
  device even when the app is set to Light. A second choice, Motion (System,
  Reduced, Full), keeps short fades and stops movement, also on the map.
- **Community** - voting on proposals, comments on
  sections and features, favorites (listed as starred sections), follows, and per-user or
  per-group visibility of logs.
- **Access** - Keycloak (OIDC) sign-in, API tokens for programmatic use,
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
