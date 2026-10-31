# Material proposals (plan, delete when landed)

Users contribute to the material wiki the way they contribute rivers,
sections and features: a change from a non-admin becomes a pending proposal,
an admin reviews it on the proposals screen, and approving applies it.
Decided with the user 2026-10-31.

## Behaviour

| Request | Admin | Signed-in non-admin | Signed out |
|---|---|---|---|
| `POST /materials` | 201, entry created | 202, `Proposal` (create) | 401 |
| `PUT /materials/{id}` | 200, entry updated | 202, `Proposal` (update, `previous_data` = the entry now) | 401 |
| `DELETE /materials/{id}` | 204 | 202, `Proposal` (delete) | 401 |

- Bodies take the existing `Proposable<T>` wrapper (`proposal_note`, max 500).
- Validation runs before a proposal is stored (400 as today), so a pending
  proposal always holds a body an admin could apply as is.
- Review (`routes/proposals/review.rs`) applies a material proposal through the
  same query functions the admin path uses; approving an update whose entry
  changed since the proposal was made follows the existing rule for
  waterways/sections (read it and match it; report what it is).
- Votes, listing, filters and notifications work for material proposals as for
  the others (`entity_type = material`).
- Caps: the existing 30 per day per user on material writes counts proposals
  too; at most one pending update or delete per user per entry (409
  otherwise) - check whether waterways have such a rule and match it.
- Photo takedown stays admin-only and is not a proposal.
- Catalogue rows (`created_by = system-catalogue`) are proposable like any
  entry; an approved update sets `updated_by`, so the seed never overwrites it.

## API refinement

While in the materials routes, check them against AGENTS.md "API design" and
fix what does not hold, without breaking the generated client beyond what the
frontend agent can follow: status codes as above, `ApiError` envelopes, 400
for validation, plural nouns, the models listing and the images takedown
routes, the OpenAPI descriptions (state admin vs proposal outcomes like the
waterway routes do). List every change in the report.

## Interfaces

- `ProposalEntityType::Material`; a migration widens the `entity_type` CHECK
  (`cargo sqlx migrate add`).
- `query/proposals/` gains the material apply path beside the others;
  `query/materials/` keeps the writes; `routes/materials/mod.rs` decides admin
  vs proposal through `routes/access.rs`.
- Frontend (second agent, after this merges and after the material models
  screens): the form shows "Sent for review" on 202; the proposals list and
  review screen render a material diff (`lib/proposals.ts` labels); the entry
  page shows a pending proposal note to its author.

## Acceptance

- Non-admin create/update/delete answer 202 with a pending proposal and leave
  `materials` unchanged (tests).
- Approving each kind applies it; rejecting leaves the entry as it was
  (tests).
- Signed out 401; a second pending update by the same user on the same entry
  follows the matched rule (test).
- The proposals list shows material proposals with a filter by type (test).
- Gates as in AGENTS.md; the security table answered.
