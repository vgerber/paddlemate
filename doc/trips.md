# Trips

A trip is a paddling week you plan together: someone sets when it runs, adds
the mates who are coming, and the group keeps a shared list of the rivers it
is watching. It is private to the people on it. Everyone still logs their own
descents, but inside the trip you see each other's.

The shape of a trip follows how one actually goes. The dates people can make
settle early - you book leave, you know when you can get there. Where the
group is based does not: the camp is full, the levels move, someone finds a
better hut, and the plan changes while the trip is already running. So a trip
is a list of **bases** you can add to and edit at any point, each carrying the
runs reachable from it.

## Planning one

Creating a trip takes a name, a start date and a first base. The base needs
only a kind (camp, hotel, bivouac, holiday home, other) and a name -
"somewhere in the Oetztal" is a perfectly good plan to work against while you
are still ringing around for a pitch. Fill in the location and dates once it
is settled.

From there the trip reads as **a run of days**:

```
DAY -1   Wed, 09 Sept 2026   vincent arrives · 19:30
DAY 1    Thu, 10 Sept 2026   based at Camping Oetztal Arena
                             mara arrives · 08:15
DAY 2    Fri, 11 Sept 2026   Oetztaler Ache
                               Tumpen · vincent
                               Wellerbruecke · vincent, mara
                             Inn
                               Imster Schlucht · vincent
DAY 3    Sat, 12 Sept 2026   tobi arrives · 22:45
DAY 4    Sun, 13 Sept 2026   based at Gasthof Post
DAY 5    Mon, 14 Sept 2026   Rest
```

The start date is **day 1** and the day before it is **day -1**, so turning up
early reads the way people say it. There is no day 0.

The run is unbroken: every day from the first thing that happens to the last
appears, and a day with nothing on it reads **Rest**. A gap in the middle of a
week is a fact about the plan rather than an absence of one, and it is where
you go to put something on that day.

Everything the group records lands on that timeline: who arrives and leaves,
when the base changes, and every run paddled - **grouped by river**, so a day
reads as the water it covered rather than as a list of logs. Two people on one
stretch is a single line with both names, not the same stretch twice.

**It is also where you edit it.** A day is the thing you click, and it opens
where it sits rather than over the plan: the summary gives way to the same
entries as rows you can act on - that base, your own dates, that log - and
under them the ways to put something new on the day, with the date already
filled in. The week stays on screen around the open day, so moving between
days costs nothing and the day you are working on keeps its place. Clicking it
again closes it.

The one thing that still asks first is **adding a day**, because which day is
the first decision. The button opens a **calendar**, not a typed date: the
trip's own span is shaded and a dot marks every day that already has something
on it, so "which days have I planned" is answerable before you choose. Any day
works, including before the trip starts, which is how an early arrival gets
onto the plan. Picking one closes the calendar and opens that day in the plan.

Noticing a plan is wrong and fixing it happen in the same place, and the
timeline itself stays a thing you read rather than a column of buttons.

## The other tabs

Every list behaves the same way: **a row opens** - in place, showing what is
inside it - and the menu on the right carries what that row can *do*.

### Bases

Above the list, every placed base sits on **one map**, named, inside a dashed
ring showing how far it reaches: the radius is the run on its own watch list
it sits farthest from, so the ring covers the lot. Read together the rings
answer what a list of bases cannot - which base actually reaches which water,
and where two of them overlap. A base nobody has placed yet is left off rather
than guessed at.

Each base is **numbered and coloured**, and both ride on its map marker and
sit beside its name in the list below. Rings overlap, so without them there is
no telling whose reach is whose - and a number, unlike a colour, can be read
aloud and survives a colourblind reader.

In the list a base is **collapsed to a line**: its number, name and dates, and
**a dot per run on its watch list, coloured by what that run's gauge says
right now**. That answers the question you would open a base to ask - is
anything here running? - without opening it. Opening one shows the watch list
in full.

Bases are added, edited and removed as the trip moves, by any member. Dates
are optional. The notes take **Markdown**, so a base can carry the booking
link, the price and what is actually good about it rather than one flat line;
the editor has buttons for bold, italic, link and list plus a preview, so
nobody needs to know the syntax. The location is **placed on a map** with the
rivers the trip already watches drawn underneath, because where you camp is
chosen relative to them. A trip always keeps at least one base.

### Up for a vote

Where to stay is the part of a trip a group actually argues about, so the
argument gets a place to happen instead of a chat thread. Anyone on the trip
can **put a base up**; everyone can vote it up or down, and pressing your own
vote again takes it back.

A candidate reads at a glance and opens for the rest. Closed it is the name
and dates, a **bar showing how much of the vote is behind it**, and who is on
which side - a count alone settles nothing on a trip of four, so the names are
the default, and your own vote reads as "you". Opening one adds who suggested
it, the description, and **how far it is from the nearest run the trip is
already watching**, which is usually what decides it: a cheap campsite an hour
from the water is not cheap.

**Anyone on the trip can correct a suggestion** - the wrong price, a dead
link, the dates it is actually free - not just whoever typed it; a suggestion
belongs to the trip, and editing leaves its votes alone. Withdrawing is
narrower: your own, or anyone's if you are an admin. An admin accepts one,
behind a confirmation since it is the one move here that cannot be undone, and
it becomes a base. Candidates sit on the same map as the bases, hollow,
because they are not real yet.

### Watch list

The runs the group is watching from a base, shown the way the section list
shows them: the river, the place, the difficulty and the live water level. The
same run can sit under two bases - two camps a kilometre apart reach the same
water, and each keeps its own list, so moving the base never rewrites what the
earlier one was watching.

### Members

Admins add the people who belong and manage roles and deletion; a trip always
keeps at least one admin.

Each member records the days they can personally make, separately from any
base's dates, and an **hour** for each once they know it - so the group can see
who to expect when, not just on which day. Yours is yours to set. Arriving and
leaving are **filled in separately and neither needs the other**: people
usually know when they get there long before they know when they can get away,
so an arrival on its own is a complete answer, and so is a day without an hour.

### Logs

Every descent credited to the trip, from every member.

## Who can see it

A trip is **invite-only**, and that is the whole rule: the people on it see
it, and nobody else does - not the public, not the rest of a club, not
somebody who was sent the link. Nobody browses other people's trips, so there
is no discovery and nothing to make public.

Getting in is therefore something an **admin does for you**: on the Members
tab they pick you from the list of people, and the trip appears in your trips
the moment they do. There is no request, no approval and no joining yourself.
Leaving is yours: your own row's menu has "Leave trip".

## Logs in a trip

A descent belongs to **at most one** trip - credit goes to one trip only. Link
one of your existing logs to a trip, or log a new one from a run on the watch
list and it arrives already linked. Unlinking keeps the log and just drops the
trip.

Two rules are worth knowing:

- **Members copy, they do not share.** When a mate has logged a run you were
  on, copying it opens the log form pre-filled from theirs and saves a new
  descent owned by you, with the same trip. So one run down the Oetz by four
  people is four logs. That is what makes "who was on this" readable, but it
  means the trip's log count counts logs, not runs.
- **A log's visibility governs the public list, not the trip.** In the trip
  view a member sees every member's logs, private ones included - inside a
  trip the group has already agreed to share. Visibility is what decides
  whether a log shows up in the general `/descents` listing and the social
  feed, and there the normal rules hold: ask for a trip's logs as a member and
  you get all of them, ask generally and a private log stays private.

---

## Internals

### How it is laid out

Trips grew a lot of parts, so each one gets the same name in both layers:

| Concern | Routes | Queries |
|---|---|---|
| the trip itself | `routes/trips/mod.rs` | `query/trips/mod.rs` |
| who is on it | `routes/trips/members.rs` | `query/trips/members.rs` |
| bases and watch lists | `routes/trips/stays.rs` | `query/trips/stays.rs` |
| bases up for a vote | `routes/trips/candidates.rs` | `query/trips/candidates.rs` |
| who may do what | `routes/trips/access.rs` | - |

`query/trips/mod.rs` re-exports its submodules, so callers keep saying
`trips::list_stays` and never have to learn the layout. A new table under a
trip becomes a new pair of files rather than another few hundred lines in an
existing one - which is what the query layer was before this, at 979 lines
across five concerns.

### Permission

It lives in `access.rs` and nowhere else, because the answers have to be
identical everywhere:

- `caller` turns the optional token into a user id, or the 401 to send. Every
  trips route needs one, the listing included.
- `require_member` gates anything that reads or shapes a trip. A non-member
  gets **404, not 403** - the existence of somebody's private trip is itself
  private.
- `require_admin` gates anything that changes what the trip *is*. A member who
  is not an admin gets **403**: they can already see the trip, so hiding it now
  would be a lie.

There is deliberately no third gate. `can_view` used to be one, from when trips
had visibility scopes; once they became invite-only it was a synonym for
membership, and two ways to ask one question is how they drift apart.

Which gate each route uses:

| Open to | Routes |
|---|---|
| any member | reading anything; adding and editing a base; the watch list; proposing, editing and voting on a candidate |
| admins only | editing and deleting the trip; adding and removing members; roles; deleting a base; accepting a candidate |
| the person themselves | their own attendance; leaving the trip; withdrawing their own suggestion |

"The person themselves" still means a *member*: editing your own row starts
with `require_member` like everything else. It used to skip the gate and lean
on the attendance table's foreign key to refuse outsiders, which held only as
long as every per-member field lived in that one table.

How a result becomes a response lives beside it, in `respond.rs`, for the same
reason: a missing thing is 404, a stale version 412, a refused rule or a bad
input 400, anything else an opaque 500. Queries return an `Outcome`
(`Done`, `NotFound`, `Stale`, `Refused`), and `outcome()` is the only place
the arms become statuses. `failure()` turns the constraints a client can trip
- dates, an unknown section or user, a duplicate entry - into the 400 naming
the rule.

### Tables

| Migration | Adds |
|---|---|
| [`00040_trips.sql`](../api/migrations/00040_trips.sql) | the trip, members, attendance, stays, watch lists |
| [`00041_trip_stay_holiday_home.sql`](../api/migrations/00041_trip_stay_holiday_home.sql) | `holiday_home` on `trip_stay_kind` |
| [`00042_trips_are_invite_only.sql`](../api/migrations/00042_trips_are_invite_only.sql) | drops visibility: the scope columns and the audience tables |
| [`00043_trip_stay_candidates.sql`](../api/migrations/00043_trip_stay_candidates.sql) | candidates and their votes |
| [`00044_trips_integrity.sql`](../api/migrations/00044_trips_integrity.sql) | moves rules into the schema: votes and trip logs hang off the membership, watched sections cascade, positions check at commit, candidates carry `updated_at` |

| Table | Holds |
|---|---|
| `trips` | name, description, `start_date`/`end_date`, `created_by` |
| `trip_members` | `(trip_id, user_id)` with role `admin` or `member` |
| `trip_member_attendance` | per-member `arrival`/`departure` days plus optional `arrival_time`/`departure_time`, keyed on the membership |
| `trip_stays` | a base: `kind`, `name`, optional `location` point and dates |
| `trip_sections` | a run watched from one stay, with `sort_order`, `status` and a note; `section_id` cascades |
| `trip_stay_candidates` | a base somebody has put up: same shape as a stay, because accepting one copies it across |
| `trip_stay_candidate_votes` | one row per member per candidate, `+1`/`-1`, same shape as `proposal_votes`; keyed on `(trip_id, user_id)` into `trip_members` |
| `descents.trip_id` | nullable; `(trip_id, user_id)` references `trip_members` with `ON DELETE SET NULL (trip_id)` |

There is no `user_id` on `trips`: ownership is a `trip_members` row with role
`admin`, so it can be transferred or shared without touching the trip. And
there is no `trip_descents` link table: with one trip per descent the link is a
column, and `ON DELETE SET NULL` means deleting a trip ungroups its logs rather
than destroying them.

`trip_sections` is unique on `(stay_id, section_id)` and `(stay_id,
sort_order)` - per stay, not per trip. Trip-level queries join through
`trip_stays`, and a stay never moves between trips, so the table needs no
`trip_id` of its own.

The two "at least one" invariants (one admin, one stay) cannot be check
constraints, since they are about the rest of the table. They are checked in
the query that does the write, inside one transaction that first takes
`FOR NO KEY UPDATE` on the trip row. Without the lock two admins could each
pass the count and each leave, and a trip with no admin has no way back
through the API. `NO KEY` so inserts that merely reference the trip - a stay,
a member - are not held up by it.

Rules that *can* be structural are, so no code path can forget them:

- **A vote hangs off the membership.** `trip_stay_candidate_votes` carries the
  trip and references `trip_members (trip_id, user_id)` with `CASCADE`, and its
  candidate through `(candidate_id, trip_id)`. Only a member can vote, and
  leaving takes your votes with you.
- **A trip log hangs off the membership too.** `descents (trip_id, user_id)`
  references `trip_members` with `ON DELETE SET NULL (trip_id)`: a log can only
  be linked to a trip its owner is on, and leaving unlinks it while keeping
  the log. The visibility override below lets members see each other's
  private trip logs, so without this a private log stayed readable by a trip
  its owner had walked away from.
- **A watched section is a plan, not a record.** `trip_sections.section_id`
  cascades, so deleting a run from the map drops it off the watch lists
  rather than a private list nobody else can see blocking the deletion.
  (`descent_sections` still restricts: a log is a record.)
- **Positions are checked at commit.** `(stay_id, sort_order)` is
  `DEFERRABLE`, so a reorder can move entries past each other in one
  transaction.

Enums decode through `sqlx::Type`, never by matching text with a fallback: an
unknown role must fail loudly, not quietly read as `member`.

Attendance times are `TIME`, not `TIMESTAMPTZ`: "19:30 at the campsite" must
read the same for everyone, and a zoned value would shift it to whoever is
looking. They are nullable and separate from the day because that is the order
you learn them in - the day lands first, the hour later - and the table says
so: a time needs its day (`chk_trip_attendance_arrival_time`), and arriving and
leaving on one day means the clock has to run forwards too
(`chk_trip_attendance_same_day`). Arrival and departure are otherwise
independently nullable - every constraint on the pair is written to pass when
either side is `NULL`, so recording an arrival never obliges a departure.
`constraint_message` in `respond.rs` maps each of those to the sentence for
the rule that was broken, rather than one blanket "bad dates".

`trip_stay_candidates.location` is `GEOMETRY`, matching `trip_stays.location`,
because accepting one copies it straight across. It was `GEOGRAPHY` for about
an hour, and the copy failed on the type mismatch.

### Endpoints

All under `/trips`, documented in the OpenAPI at `/api/v1/docs`.

| Method | Path | Notes |
|---|---|---|
| `GET` `POST` | `/trips` | the listing is the caller's trips; creating takes the first stay |
| `GET` `PATCH` `DELETE` | `/trips/{trip_id}` | write is admin only |
| `GET` `POST` | `/trips/{trip_id}/members` | `POST` adds somebody, admins only, `{user_id}` in the body |
| `GET` `PATCH` `DELETE` | `/trips/{trip_id}/members/{user_id}` | role is admin only, attendance is the member's own, and leaving is always your own to do |
| `GET` `POST` | `/trips/{trip_id}/stays` | any member may add a base |
| `GET` `PATCH` `DELETE` | `/trips/{trip_id}/stays/{stay_id}` | members edit, admins delete |
| `PUT` | `/trips/{trip_id}/stays/{stay_id}/sections` | replaces the watch list; position is list order, and an entry that stays keeps its id, status and note |
| `GET` `POST` | `/trips/{trip_id}/candidates` | `POST` puts a base up; any member may, and their own vote is counted for it |
| `GET` `PATCH` `DELETE` | `/trips/{trip_id}/candidates/{candidate_id}` | `PATCH` edits the fields (any member) or, with `{accepted:true}`, turns it into a base (admins); `DELETE` withdraws it (yours, or any as an admin) |
| `POST` `DELETE` | `/trips/{trip_id}/candidates/{candidate_id}/vote` | `{vote: 1 \| -1}`; `DELETE` takes the vote back |

Linking a descent is not a trip route at all: it rides on `PATCH
/descents/{descent_id}` with `trip_id` (or `null` to unlink), because the trip
is an attribute of the descent and descents already own their collection. The
handler checks the caller is a member of the target trip, the same way it
checks they own the descent.

Reading a trip's logs is `GET /descents?trip_id=`, so one listing keeps paging
and every other filter.

Every route needs a signed-in caller (401 otherwise, the listing included),
and every path below `/trips/{trip_id}` is looked up *inside* that trip - the
query filters on both ids. Candidate ids are sequential, and the candidate
queries once took the id alone: a member of one trip could rename and accept
another trip's candidate through their own trip's URL. Scope a child by its
parent in the SQL, not in a check the handler might skip.

#### Versioned edits

A trip, a stay and a candidate are edited by several people, so their
`PATCH` takes an optional `If-Match`. The tag is the item's `updated_at`,
quoted, exactly as the JSON carries it - which is also what the `ETag` header
says. Because the version is already in the body, a client holding an item
from a *list* can send it too, without a GET per item.

| Request | Result |
|---|---|
| no `If-Match` (or `*`) | written, as before |
| the current version | written, new `ETag` in the response |
| an older version | **412**, nothing written |
| not a timestamp | 400 |

Accepting a candidate honours it as well: with a version, only the version the
admin read is accepted, not one somebody reworded while they decided. The CORS
layer allows `If-Match` and exposes `ETag` - without the first, a browser's
preflight for a versioned `PATCH` fails before the API sees it.

Attendance and roles are not versioned: attendance is each member's own row,
and role changes go through the trip lock.

### Why candidates are their own tables

They are not rows in the site-wide `proposals`. Those propose edits to shared
river data and are settled by server admins against the map; these belong to
one trip and are settled by the people on it, so the audience, the permissions
and the lifetime are all different. What they do share is the vote shape -
`+1`/`-1`, one row per person, replacing your own vote rather than stacking -
so a vote means the same thing wherever it is cast. Votes are read back with
the voters' names, because on a trip of four that is the useful half.

One `PATCH` covers both correcting a candidate and accepting it, and the
permission follows the field rather than the route: a body carrying `accepted`
needs an admin, anything else needs only membership. That keeps the endpoint
shape the proposals review already uses, rather than inventing a verb path for
the accept.

Accepting is one transaction that inserts the stay and deletes the candidate,
so the trip is never briefly holding both or neither. The proposer's own vote
is cast when the candidate is created, which makes the count read as "three of
us want this" rather than "three others do".

### If something else needs a vote

Candidates are built so that the next votable thing costs a migration rather
than a second stack. Two things would have to happen, and neither is the
obvious one.

**Sections would not get their own candidate table.** A candidate base is a
record that does not exist yet - name, location, dates, description - so it
needs somewhere to live that the bases list, the map, the range rings and
attendance do not read. A candidate *run* carries no payload of its own: it is
a pointer at a `water_sections` row that is already there. `trip_sections`
already has a `status`, so a proposed run is one more value on that enum, and
the whole cost is:

| Change | Size |
|---|---|
| keep candidates out of the watch list | `status <> 'candidate'` at three call sites, all in `query/trips/stays.rs` |
| `sort_order` has no meaning yet | make it nullable; `UNIQUE (stay_id, sort_order)` becomes a partial index that skips candidates |
| `PUT .../sections` replaces the list | scope its delete to non-candidates, or it wipes them |
| new endpoints | one vote pair |

Copying the base-candidate stack instead would buy a table pair, six routes and
a component, for a record whose entire content is a foreign key.

**The votes are the part that duplicates.** Copied verbatim per candidate type
today: the votes table, the count, voter-list and `viewer_vote` subqueries
around `CANDIDATE_COLS`, `cast_vote`/`clear_vote`, the `POST`/`DELETE
.../vote` pair, and on the frontend the support bar and voter line still
sealed inside `TripCandidates.tsx`. The permission gate is already shared and
costs nothing, which is the half that usually rots, and the model is already
named `TripCandidateVote` rather than `TripStayCandidateVote`.

So the second voter starts by pulling those out, not by writing them again:
one `trip_votes` table with an exclusive arc - a nullable foreign key per
votable thing and `CHECK (num_nonnulls(...) = 1)` - with the existing
candidates moved onto it in the same change, so there is never a moment with
two vote tables. A third votable thing is then `ADD COLUMN`, one partial
unique index and an updated check.

Two shapes to avoid. A polymorphic `(entity_type, entity_id)` key cannot carry
a foreign key, so withdrawing a candidate leaves its votes behind and the
cascade has to be rebuilt as a trigger or a cleanup job. And a generic
`trip_candidates(kind, payload jsonb)` loses the date check constraint, the
foreign key into `water_sections`, the `INSERT ... SELECT` that makes
accepting one statement, and the typed schema in the OpenAPI - for two
payloads that share nothing but a name.

### The visibility override

`list_descents_for_viewer` gains one branch alongside the normal ones, and it
only fires when the listing is filtered to a trip the viewer belongs to:

```sql
OR ($trip_id IS NOT NULL
    AND descents.trip_id = $trip_id
    AND EXISTS (SELECT 1 FROM trip_members tm
                WHERE tm.trip_id = $trip_id AND tm.user_id = $viewer))
```

Scoping it to the filter is the point. As a free-standing branch it would leak
a private log into the *global* feed for anyone who happens to share a trip
with its author, which is exactly what visibility exists to prevent. The bare
detail route `GET /descents/{id}` keeps the normal rules too.

### Frontend

Routes:

| File | Owns |
|---|---|
| `routes/trips/index.tsx` | the list, and on desktop the two-pane split that opens a trip beside it |
| `routes/trips/$tripId.tsx` | the same trip as its own screen: the mobile overlay and any direct link |
| `routes/trips/new.tsx` | creation on mobile |

The trip itself:

| File | Owns |
|---|---|
| `trip-page/TripDetail.tsx` | the panel: header, tabs, which panel is showing, and every editor dialog |
| `trip-page/TripFab.tsx` | the per-tab primary action, and `fabSx` - the position both routes use |
| `trip-page/TripTimeline.tsx` | the Plan tab: the day entries |
| `trip-page/DayDetail.tsx` | the inside of a day: what is on it, and what can be added to it |
| `trip-page/DayCalendar.tsx` | the month grid, with the trip's span shaded |
| `trip-page/DayPickerDialog.tsx` | the calendar behind the add-a-day button |
| `trip-page/eventLabels.tsx` | how one entry reads, shared by the day closed and open |
| `trip-page/TripStays.tsx` | the Bases tab: the rows, their watch dots and their menus |
| `trip-page/BasesMap.tsx` | every placed base with its reach, and any candidates, hollow |
| `trip-page/WatchList.tsx` | a base's runs, through `SectionListItem` |
| `trip-page/TripCandidates.tsx` | the bases up for a vote, their support bars and the accept |
| `trip-page/TripMembers.tsx` | the Members tab |
| `trip-page/TripLogs.tsx` | the Logs tab, through `DescentCard` |
| `trip-page/StayDialog.tsx` | one form for three jobs: add a base, edit one, propose one |
| `trip-page/StayLocationPicker.tsx` | placing a base on the map, over the trip's watched runs |
| `trip-page/StaySectionsDialog.tsx` | editing a watch list |
| `trip-page/AttendanceDialog.tsx` | the dates you can make, opened from a day or the members list |
| `trip-page/AddMemberDialog.tsx` | the people picker behind the Members FAB |
| `trip-page/LinkDescentDialog.tsx` | crediting an existing log to the trip |
| `trips/TripRow.tsx`, `trips/TripForm.tsx`, `trips/stayKinds.ts` | the list row, the create/edit form, and the kinds |

Pure logic, tested without a browser:

| File | Owns |
|---|---|
| `lib/tripTimeline.ts` | `dayNumber`, `buildTimeline`, `eachDay`, `monthGrid`, `paddledByRiver` |
| `lib/tripRange.ts` | `baseRanges`, `rangeBounds`, `nearestWatched`, and the per-base colour and number |
| `lib/hooks/useTrips.ts` | the `tripKeys` factory, every trip query and every mutation |

Shared pieces this feature added to the app, not to itself: `PanelHeader`,
`Fact`, `RowMenu`, `TimelineRail`, `SectionAdder`, `VisibilityPicker`,
`MarkdownText`/`MarkdownField`, and the map's `RangeRingLayers`.

The edit dialogs (`TripForm`, `StayDialog`, and the accept confirm in
`TripCandidates`) send `If-Match` with the version the form was filled from.
They take it with the form, once, rather than reading the live prop: on a 412
the hooks refetch, and a form saved against the refreshed version would
overwrite the other person's change after all. So a refused save stays
refused until the dialog is reopened on what is really there, and the error
is scrolled into view beside the save button.

### Tests

[`api/tests/trips.rs`](../api/tests/trips.rs) drives the real routers behind
the real API-key layer, each test on a fresh database built from the
migrations. It pins what used to hold only by convention: the 404/403 split,
signed-out 401s, self-edits needing membership, the last admin and last base
(each also raced), votes and private logs leaving with a member, candidates
unreachable through another trip, bad input answering 400, a reorder keeping
its rows, and a stale `If-Match` answering 412. Each race test fails when the
trip lock is removed, which is how it is known to test anything.

#### Patterns worth keeping

**Everything expands in place**, the way `PointEntry` does on the map panel: a
`Collapse` inside the row's own `ButtonBase`, with the opened body stopping
click propagation so acting on a row is not read as closing it. Days,
candidates and bases all work this way, and a closed row always carries a
summary of what is inside - the day's entries, the vote so far, the watch
dots - so opening is for acting, not for finding out.

**`buildTimeline` fills the gaps** as well as bucketing the events, so a rest
day is a `TripDay` with no events rather than a hole the UI has to infer. It is
capped at `MAX_TIMELINE_DAYS` (366) so a typo in an end date cannot turn the
plan into a decade of rest days. `monthGrid` builds the calendar's six weeks
and `eachDay` the run between two dates - both pure, both tested, and neither
needs a date library. `paddledByRiver` groups the day's runs, so the rule that
two paddlers on one section collapse to one line is testable without a browser;
rivers sort by `localeCompare`, which is what puts Oetztaler Ache with the Os
instead of after Z.

**One source per fact.** `TripTimeline` and `DayPickerDialog` read the same
days through `useTripTimeline`, which is three queries React Query dedupes.
`eventLabels` lives in its own module because the day closed and the day open
both render entries - importing it from the timeline would have made the pair
circular. The watch dots take their colour from `useSectionLevels`, the hook
that already colours section lines on the map, so a dot and the line it stands
for can never disagree; they use the `marker` half of the level token pair,
because a dot is geometry rather than text, and a run with no calibrated gauge
takes the outline colour - unknown is not a level.

**Editors are owned, not scattered.** `TripDetail` holds every dialog the tabs
reach - the base, its watch list, attendance, the member picker, the link and
the confirms - because the same base and the same log are reachable from two
places, the timeline and the tab that lists them, and two owners would mean two
copies drifting apart. `TripCandidates` owns its own two, the edit form and the
accept confirm, because nothing else can reach a candidate. The panels below
are presentational: they render rows and call up. A day takes its capabilities
as one grouped `DayActions` object rather than a row of loose props, with
`canEdit` deciding whether the add rows appear at all.

**Markdown is sandboxed by omission.** `MarkdownText` is `react-markdown` with
GFM and **no** `rehype-raw`: raw HTML in a description is escaped rather than
rendered, and link hrefs go through the default transform that drops
`javascript:`. That is the whole sandbox - the app renders no user HTML
anywhere, and this does not start. Links open in a new tab with
`rel="noopener noreferrer"`.

**Colour never carries a fact alone.** A base has a number as well as a colour,
so a ring can be named out loud. The candidate support bar is cyan rather than
green-and-red, because the signal colours belong to water levels and a vote is
not a hazard.

**Reuse over restating.** A trip section carries only an id and a name, so
`WatchList` loads the waterways behind them through `useWaterwaySections` - the
same fetch and cache the map search uses - and hands real sections to
`SectionListItem`, so the watch list is literally the section list, chips and
all. The base location reuses the map's existing `drawing` group
(`placingFeature` + `onMapClick`), so placing a camp is the same mechanism as
drafting a feature, with no new map capability.

**Every editor uses the suggest-a-river shape**, whether it is a whole trip or
a single dialog: the fields scroll and `PanelBottomBar` stays pinned at the
bottom - close left, the editor's name with its status as the subtitle, one
round action right, disabled until the form is valid. So no editor carries a
title of its own, and none pairs a text Cancel with a text Save; a blocked save
says why in the subtitle rather than putting the reason inside the button. The
trip form's two placements give it a bounded height (`PANEL_HEIGHT`) so the bar
has something to pin against.

On desktop the list and the open trip sit side by side, the way proposals
review does, with `?selected=` keeping the open trip linkable and `?new`
opening the create form in the same pane. Mobile pushes the same components as
full screens instead. The desktop pane drops the panel header, because the list
beside it already names the open trip and carries the way back.
