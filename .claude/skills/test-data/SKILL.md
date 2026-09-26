---
name: test-data
description: Seed or remove the paddlemate dev-DB test fixture (five paddlers, Test River with sections, put-in/take-out features, gauge with readings, descents, a club, two trips, API token). Use when local testing needs data, or to reset it.
---

# Test data fixture

Seeds a self-contained fixture into the local dev database. All ids are in
the 9xxx range so it never collides with real data and can be removed
cleanly.

## Prerequisites

- DB container running: `docker start paddlemate-db-1`
- Migrations applied: `cd api && cargo sqlx migrate run`

The fixture creates its own users, so it no longer needs anyone to have
logged in first.

## Seed / reset / remove

Scripts live next to this file. Always clean before seeding (seed is not
idempotent):

```sh
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/cleanup.sql
docker exec -i paddlemate-db-1 psql -U postgres -d paddlemate -v ON_ERROR_STOP=1 < .claude/skills/test-data/seed.sql
```

Remove only: run just `cleanup.sql`.

## The people

Five paddlers, with the same subjects as the local Keycloak realm
(`keycloak/build-realm.sh`), so signing in as any of them lands on exactly
this data. All have the password `paddle`; only Vincent is a `server_admin`.

| Username | Name | Their part in the data |
|---|---|---|
| `vincent` | Vincent Local | the admin you normally sign in as; owns the club, two logs and the trip |
| `mara` | Mara Lindqvist | co-admin of the trip, owns a public and a **private** log in it, and a private trip of her own |
| `tobi` | Tobias Reiner | trip member who joins late and leaves early |
| `aoife` | Aoife Byrne | trip member with no dates set; owns the club-shared log |
| `jonas` | Jonas Weber | in the club but **not** on the trip: sees it, has not joined |

Signing in as somebody other than Vincent is how you check what a non-admin,
non-owner sees. The e2e login script takes the user:

```sh
KC_USER=jonas bun e2e/login.ts     # then drive the app as Jonas
```

Adding or changing a user means editing **both** `keycloak/build-realm.sh`
and `seed.sql` - the ids are pinned in each and must agree. The realm is only
imported into a fresh container, so after editing it:

```sh
sh keycloak/build-realm.sh
docker compose --profile auth up -d --force-recreate keycloak
# new signing keys - the API caches the JWK set at startup, so restart it too
```

## What you get

| Entity | Ids | Notes |
|---|---|---|
| Users | pinned UUIDs | the five above, plus the club `9001` "Innsbruck Paddlers" (Vincent owner, Mara admin, the rest members) |
| Follows | - | Vincent and Mara follow each other, Tobias follows Vincent, Aoife's request is still `pending` |
| Waterway "Test River" | 9001 | river |
| Sections | 9101-9107 | each with put_in + take_out features (9511-9572) at its line ends, like a normal entry |
| Whitewater features | 9523/9543/9553 | difficulty III / II / IV-V on sections 9102/9104/9105, spanning put-in to take-out - difficulty chip in the section list |
| Extra features on Lower Test | 9524-9529 | rapid "Slot Machine" (III+), hole "Big Hole", weir "Altes Wehr", strainer, portage, bridge - 9102 is the feature-rich section for timeline/map/delete testing |
| Gauge "Test Gauge" + series | 9301 / 9401, 9402 | water_level in cm; 9401 has a week of 2-hourly sinusoidal readings (55-115, latest ~85), 9402 has none |
| Water ranges | 9601-9608 | thresholds around the ~85 cm reading so the section list shows every chip variant (see below); section defaults sit on the whitewater features; 9607/9608 sit on the Lower Test rapid/hole (same series as the 9601 default) so selecting them in the timeline swaps the chart thresholds |
| Descents | 9201-9204 | see below; all owned by the first user |
| Notes (comments) | 9901-9906 | one per interesting category on Test River, plus a section note and a `merged` one a client should fold away |
| Proposals | 9701-9709 | one per review case, placed so the review map has context (see below) |
| API token `pm_testtoken123` | name `test-data` | for authed curl: `-H "X-Api-Key: pm_testtoken123"` |

Proposals (on `/proposals`, newest first; the review pane draws each one
against what already exists, so the geometry is spread along the river
rather than stacked on one point):

- 9701 feature create "Mittelschwall" - a rapid in the gap between Slot
  Machine and Big Hole on Lower Test: the fits-fine case
- 9702 feature create "Grosses Loch" - a hole ~5 m from the existing Big
  Hole (9525) under another name: the duplicate the map should expose
- 9703 section create "Gorge Test" - continues below the last section
- 9704 section create "Middle Run" - overlaps Low Water Test: the
  duplicate-stretch case
- 9705 section update on Upper Test (9101) - proves the stored line is left
  out of the context so it is not drawn under the proposed one
- 9706 feature update on the weir (9526) - same rule for features
- 9707 river create "Proposed Test Creek" - no geometry, the no-context case
- 9708 approved / 9709 rejected - so the status tabs are not empty
- Votes on 9701 (+1), 9703 (+1), 9704 (-1) so the list shows tallies

Descents (times relative to NOW at seed time), spread across the crew so
"mine" and "someone else's" both have content:

- 9201 vincent "Public multi-section run" - public, 2 days ago, 2 h, on Upper + Lower
- 9202 vincent "Private upper run" - private, 1 day ago, 1 h, on Upper (hidden from anonymous)
- 9203 mara "Public lower-only run" - public, 3 days ago, 1 h, on Lower
- 9204 tobi "Long weekend trip" - public, 6 days ago, 36 h, on Lower (wide chart band)
- 9205 aoife "Club evening lap" - **shared with group 9001**: the group audience branch
- 9206 jonas "Scout, shared with Vincent" - **shared with one user**: the user audience branch
- 9207 mara "Maras private scout" - private, and linked to the trip: inside the
  trip every member sees it, in the public listing only Mara does
- 9208 vincent "Wellerbruecke lap" - on the Oetztaler Ache, the same day as
  9201/9207 on the Test River, so the trip timeline has two rivers to group
  on one day

Rivers around the trip - 9008 Inn, 9009 Sanna, 9010 Pitze, and more of the
Oetztaler Ache - carry their **real courses**, taken from OpenStreetMap
(`waterway=river`, matched by name) and thinned to 30 points apiece. The
lengths are therefore true: Imster Schlucht really is ~9 km, Wellerbruecke
~3 km. That is what makes the bases map honest - the hotel really is 100 m
from the Weller Bridge and 7.6 km from Imster Schlucht, so the ring drawn
round it means something. Each run has a difficulty, which is what puts a
chip on every watch list row.

Test River stays synthetic and stays **off the watch lists**: it is what the
gauge, calibration and search fixtures need, and parking it on a list dragged
every ring 24 km into the wrong valley. Every real demo run borrows its
calibrated series, with thresholds chosen against the gauge's 85 cm so the
levels come out **deliberately spread** - empty, low, medium and high all
appear. The watch dots on a collapsed base are only worth looking at if they
are not all one colour.

Trips:

- 9001 "Oetztal week" - straddles today so the day
  timeline has days behind it (solid dots) and ahead of it (hollow). Members:
  Vincent + Mara (admins), Tobias, Aoife. Vincent arrives a day early (19:30),
  which is the timeline's **Day -1**; Mara knows the day she leaves but not
  the hour, which is the half-settled state the UI has to read well.

  **Four bases**, one of each interesting shape and each in its **own
  valley**: 1 the camp in the Oetztal (Laengenfeld), 2 the hotel in the
  Inntal (Landeck), 3 a `holiday_home` in the Pitztal (Wenns), 4 an undated
  placeholder with no location at all, notionally in the Stubai. The placed
  three are 14-30 km apart. Two bases in one valley made the bases map a
  single blob with overlapping rings and proved nothing. The three placed ones each carry a watch list
  and so each draw a ring on the bases map, in three different colours; the
  placeholder draws nothing, which is the case worth checking. Each base
  watches its own valley first, so the rings cover different ground: about
  14 km at the camp (the Oetztaler Ache top to bottom), 11 km at the hotel
  (the Sanna out of the door, the Inn both ways) and 5 km at the house. The
  bases are numbered 1-4 in the list and the same numbers ride on the map
  markers, so a ring can be named without relying on its colour. Imster
  Schlucht is on two lists at once, watched from either side of the Inn.
  Logs 9201,
  9203, 9205 and 9207 are credited to the trip.
- 9002 "Soca spring" - Mara and Tobias only, so Vincent cannot see it at all
  and the two users' trip lists differ.

The Oetztal week also ships an **argument in progress**: two bases up for a
vote. "Haus Wildspitze" has three votes for and none against and sits 1.2 km
from Tumpen; "Camping Aufenfeld" is split one-one and is 70 km from anything
on the watch lists, which is what its own description admits. So the vote bar
has both a clear case and a contested one without anybody clicking, and the
distance line has a good number and a damning one.

Jonas is the interesting case: in the club but on neither trip, so he is how
you check that a trip is invisible to anyone who was not added to it - a trip
is invite-only, and club membership grants nothing.

Empty Test (9103) intentionally has no descents (empty-state testing).

Section chip variants in the list view:

- 9101 Upper Test - uncalibrated range (9602): plain reading chip
- 9102 Lower Test - medium level (9601: 60/80/120) + chart with descent bands
- 9103 Empty Test - no gauge: no chip
- 9104 Low Water Test - low level (9603: 80/100/130)
- 9105 High Water Test - high level (9604: 40/50/70)
- 9106 Dry Test - below low = empty level (9605: 100/120/150)
- 9107 Silent Gauge Test - calibrated on series 9402 which has no readings: level-letter fallback

## Using it

- Proposals entry point: `/proposals` (desktop shows the list beside the
  full proposal; `?selected=9702` opens the duplicate case directly).
- Trips entry point: `/trips` (desktop shows the list beside the open trip;
  `?selected=9001` opens the Oetztal week's day timeline directly).
- Map entry points: `/?waterway=9001` (section list with paddle-count
  badges), `/?waterway=9001&section=9102` (chart with descent bands, Logs tab).
- Frontend against the local API: `cd frontend && VITE_API_URL=http://localhost:3000 bun run dev`
  (the checked-out `.env` points at production).
- Authed API checks: `curl -H "X-Api-Key: pm_testtoken123" localhost:3000/api/v1/descents?scope=owned`
- To drive an authenticated browser session headlessly, see the `verify`
  skill: it signs in through a local Keycloak whose user id matches this
  fixture's owner, so the session sees exactly this data. Do not hand-write
  an oidc session into localStorage.
