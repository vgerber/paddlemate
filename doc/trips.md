# Trips

A trip is a paddling week you plan together: someone sets when it runs, mates
join, and the group keeps a shared list of the rivers it is watching. Everyone
still logs their own descents, but inside the trip you see each other's.

The shape of a trip follows how one actually goes. The dates people can make
settle early - you book leave, you know when you can get there. Where the
group is based does not: the camp is full, the levels move, someone finds a
better hut, and the plan changes while the trip is already running. So a trip
is a list of **bases** you can add to and edit at any point, each carrying the
sections reachable from it.

## Planning one

Creating a trip takes a name, a start date and a first base. The base needs
only a kind (camp, hotel, bivouac, other) and a name - "somewhere in the
Oetztal" is a perfectly good plan to work against while you are still ringing
around for a pitch. Fill in the location and dates once it is settled.

From there the trip reads as **a run of days**:

```
DAY -1   Wed, 02 Sept 2026   vincent arrives · 19:30
DAY 1    Thu, 03 Sept 2026   based at Camping Oetztal Arena
                             mara arrives · 08:15
DAY 2    Fri, 04 Sept 2026   Ötztaler Ache
                               Wellerbrücke · vincent
                             Test River
                               Upper Test · vincent
                               Lower Test · vincent, mara
DAY 3    Sat, 05 Sept 2026   tobi arrives · 22:45
DAY 4    Sun, 06 Sept 2026   based at Gasthof Post
DAY 5    Mon, 07 Sept 2026   Rest
```

The start date is **day 1** and the day before it is **day -1**, so turning up
early reads the way people say it. There is no day 0.

The run is unbroken: every day from the first thing that happens to the last
appears, and a day with nothing on it reads **Rest**. A gap in the middle of a
week is a fact about the plan rather than an absence of one, and it is where
you go to put something on that day.

Everything the group records lands on that timeline: who arrives and leaves,
when the base changes, and every section paddled - **grouped by river**, so a
day reads as the water it covered rather than as a list of logs. Two people on
one stretch is a single line with both names, not the same stretch twice. **It is also where you edit it.** A day is the
thing you click: it opens with everything on it listed, each row going to what
is behind it - that base, your own dates, that log - and below them the ways
to put something new on the day, with the date already filled in. The button
adds a day.

Picking a day is a **calendar**, not a typed date: the trip's own span is
shaded, and a dot marks every day that already has something on it, so "which
days have I planned" is answerable without leaving the dialog. Any day works,
including before the trip starts, which is how an early arrival gets onto the
plan.

The calendar is only in the way once you have made that choice, so opening a
day lands you on the day itself, with its date at the top and **Change day**
beside it; adding a day opens the calendar instead, because picking one is the
first decision. Changing the day moves the dialog to it and folds the calendar
away again, so it doubles as a way to step through the week without turning
every visit into a scroll past a month grid.

Noticing a plan is wrong and fixing it happen in the same place, and the
timeline itself stays a thing you read rather than a column of buttons.

The other tabs are the same things as plain lists, and they behave like every
other list in the app: a row opens the thing it names - a base opens its
editor, your own member row opens your dates - and the menu on the right
carries the rest of what that row can do.

- **Bases** — add, edit and remove them as the trip moves. Dates are
  optional, and the location is **placed on a map**: the rivers the trip
  already watches are drawn underneath, because where you camp is chosen
  relative to them. A trip always keeps at least one base.
- **Watch list** — the sections the group is watching from a base, shown the
  way the section list shows them: place, difficulty and the live water level.
  The same river can sit under two bases: two camps a kilometre apart reach
  the same water, and each keeps its own list, so moving the base never
  rewrites what the earlier one was watching.
- **Members** — anyone who can see the trip can join it. Admins manage
  visibility, roles and deletion; a trip always keeps at least one admin.
  Each member records the days they can personally make, separately from any
  base's dates, and an **hour** for each once they know it - so the group can
  see who to expect when, not just on which day. Yours is yours to set.
  Arriving and leaving are **filled in separately and neither needs the
  other**: people usually know when they get there long before they know when
  they can get away, so an arrival on its own is a complete answer, and so is
  a day without an hour.
- **Logs** — every descent credited to the trip, from every member.

## Who can see it

Trips use the same visibility model as descents:

| Scope | Who sees it |
|---|---|
| `private` | members only |
| `shared` | members, plus the users and groups the admins name |
| `public` | anyone |

`visible_from` schedules the reveal: until that moment a `public` trip behaves
as if it were not.

## Logs in a trip

A descent belongs to **at most one** trip - credit goes to one trip only. Link
one of your existing logs to a trip, or log a new one from a section on the
watch list and it arrives already linked. Unlinking keeps the log and just
drops the trip.

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

### Tables

Created in [`api/migrations/00040_trips.sql`](../api/migrations/00040_trips.sql).

| Table | Holds |
|---|---|
| `trips` | name, description, `start_date`/`end_date`, `visibility_scope`, `visible_from`, `created_by` |
| `trip_members` | `(trip_id, user_id)` with role `admin` or `member` |
| `trip_member_attendance` | per-member `arrival`/`departure` days plus optional `arrival_time`/`departure_time`, keyed on the membership |
| `trip_visible_users` / `trip_visible_groups` | the audience of a `shared` trip |
| `trip_stays` | a base: `kind`, `name`, optional `location` point and dates |
| `trip_sections` | a section watched from one stay, with `sort_order`, `status` and a note |
| `descents.trip_id` | nullable FK, `ON DELETE SET NULL` |

There is no `user_id` on `trips`: ownership is a `trip_members` row with role
`admin`, so it can be transferred or shared without touching the trip. And
there is no `trip_descents` link table: with one trip per descent the link is
a column, and `ON DELETE SET NULL` means deleting a trip ungroups its logs
rather than destroying them.

`trip_sections` is unique on `(stay_id, section_id)` and `(stay_id,
sort_order)` - per stay, not per trip. Trip-level queries join through
`trip_stays`, and a stay never moves between trips, so the table needs no
`trip_id` of its own.

The two "at least one" invariants (one admin, one stay) are enforced in the
route layer on delete, where a check constraint cannot see the rest of the
table.

Attendance times are `TIME`, not `TIMESTAMPTZ`: "19:30 at the campsite" must
read the same for everyone, and a zoned value would shift it to whoever is
looking. They are nullable and separate from the day because that is the order
you learn them in - the day lands first, the hour later - and the table says
so: a time needs its day (`chk_trip_attendance_arrival_time`), and arriving
and leaving on one day means the clock has to run forwards too
(`chk_trip_attendance_same_day`). Arrival and departure are otherwise
independently nullable - every constraint on the pair is written to pass when
either side is `NULL`, so recording an arrival never obliges a departure.
`constraint_message` in the route layer maps each of those to the sentence for
the rule that was broken, rather than one blanket "bad dates".

### Endpoints

All under `/trips`, documented in the OpenAPI at `/api/v1/docs`.

| Method | Path | Notes |
|---|---|---|
| `GET` `POST` | `/trips` | `scope=member` narrows to the caller's; creating takes the first stay |
| `GET` `PATCH` `DELETE` | `/trips/{trip_id}` | write is admin only; `PATCH` replaces a `shared` audience inline |
| `PUT` | `/trips/{trip_id}/audiences/users` `.../groups` | admin only |
| `GET` `POST` | `/trips/{trip_id}/members` | `POST` is the open join; the member comes from the token, so there is no body |
| `GET` `PATCH` `DELETE` | `/trips/{trip_id}/members/{user_id}` | role is admin only, attendance is the member's own, and leaving is always your own to do |
| `GET` `POST` | `/trips/{trip_id}/stays` | any member may add a base |
| `GET` `PATCH` `DELETE` | `/trips/{trip_id}/stays/{stay_id}` | members edit, admins delete |
| `PUT` | `/trips/{trip_id}/stays/{stay_id}/sections` | replaces the ordered watch list |

Linking a descent is not a trip route at all: it rides on `PATCH
/descents/{descent_id}` with `trip_id` (or `null` to unlink), because the trip
is an attribute of the descent and descents already own their collection. The
handler checks the caller is a member of the target trip, the same way it
checks they own the descent.

Reading a trip's logs is `GET /descents?trip_id=`, so one listing keeps paging
and every other filter.

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

| File | Owns |
|---|---|
| `routes/trips/index.tsx` | the list, and on desktop the two-pane split that opens a trip beside it |
| `routes/trips/$tripId.tsx` | the same trip as its own screen: the mobile overlay and any direct link |
| `components/trip-page/TripDetail.tsx` | the trip itself - header, tabs, panels and the per-tab FAB - rendered by both |
| `components/trip-page/StayLocationPicker.tsx` | placing a base on the map, over the trip's watched sections |
| `components/trip-page/DayDialog.tsx` | one day: what is on it, and what can be added to it |
| `components/trip-page/AttendanceDialog.tsx` | the dates you can make, opened from a day or the members list |
| `lib/tripTimeline.ts` | `dayNumber` and `buildTimeline` - the pure day/event model, with tests |
| `components/trip-page/TripTimeline.tsx` | the day entries |
| `components/trip-page/WatchList.tsx` | a base's sections, through `SectionListItem` |
| `routes/trips/new.tsx` | creation |
| `components/trips/` | `TripRow`, `TripForm`, stay kinds |
| `components/trip-page/` | the four tab panels plus the base, watch-list and link dialogs |
| `lib/hooks/useTrips.ts` | the `tripKeys` factory and every trip mutation |

The timeline is the feature timeline's shape: `TimelineRail` (extracted from
`PointEntry`) draws the dot and connector, and a day still ahead gets the
hollow dot, the way a proposed feature does.

`buildTimeline` fills the gaps as well as bucketing the events, so a rest day
is a `TripDay` with no events rather than a hole the UI has to infer. It is
capped at `MAX_TIMELINE_DAYS` so a typo in an end date cannot turn the plan
into a decade of rest days. `monthGrid` builds the calendar's six weeks, and
`eachDay` the run between two dates - both pure, both tested, and neither
needs a date library.

`paddledByRiver` does the grouping as a pure function beside `buildTimeline`,
so the rule that two paddlers on one section collapse to one line is testable
without a browser. Rivers sort by `localeCompare`, which is what puts
Ötztaler Ache with the Os instead of after Z.

`TripTimeline` and `DayDialog` read the same days through
`useTripTimeline`, so neither owns the list and React Query dedupes the three
queries behind it. `eventLabels` is shared too, so an entry reads the same in
both.

`TripDetail` owns every editor - the base dialog, its watch list, attendance,
the unlink and delete confirmations - because the same base and the same log
are reachable from two places, the timeline and the tab that lists them, and
two owners would mean two copies drifting apart. The panels below it are
presentational: they render rows and call up. The day dialog takes its
capabilities as one grouped `DayActions` object rather than a row of loose
props. Actions that manage a *thing* rather than a day - a base's watch list,
deleting one, unlinking or copying a log - stay on the tab that lists them,
where a `RowMenu` names them.

A trip section carries only an id and a name, so `WatchList` loads the
waterways behind them through `useWaterwaySections` - the same fetch and cache
the map search results use - and hands real sections to `SectionListItem`. The
watch list is then literally the section list, chips and all.

Trips reuse the app's shared UI rather than restating it: `PanelHeader` for
the header and its segmented tab bar, `Fact` for the labelled values on the
overview, `FormSection` for the blocks of every form, `SectionAdder` and the
descent wizard's `SectionDraftList` for the watch list (a watch list and a
descent's section list are the same ordered pick), `VisibilityPicker` for the
audience, `DescentCard` for a log, and `ConfirmDialog` for every confirmation.

Each tab's primary action is the FAB, per the design language's one screen,
one action rule: Bases adds a base, Logs offers log-or-link, and the admin
tools sit behind the menu on the other two. Everything a *row* can do is one
`RowMenu` with named entries - editing a base, its watch list, a member's
role or dates - so a row stays scannable.

On desktop the list and the open trip sit side by side, the way proposals
review does, with `?selected=` keeping the open trip linkable, and `?new`
opening the create form in the same pane. Mobile pushes the same components
as full screens instead (`/trips/$tripId`, `/trips/new`).

Creating and editing a trip use the suggest-a-river shape: the fields scroll
and `PanelBottomBar` stays pinned at the bottom - cancel left, the step's
status as the subtitle, one round action right, disabled until the form is
valid. Both placements give it a bounded height (`PANEL_HEIGHT`) so the bar
has something to pin against.

The base location reuses the map's existing `drawing` group
(`placingFeature` + `onMapClick`), so placing a camp is the same mechanism as
drafting a feature - no new map capability.
