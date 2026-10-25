# Plan: the sweep (WP15)

Status: started 2026-10-25. Delete this file when the work has landed; rules
that come out of it go into [design.md](../design.md) and AGENTS.md.

WP15 of [ui-overhaul.md](ui-overhaul.md): every screen at 320px and at 130%
text, touch targets everywhere, a keyboard and screen reader pass, then the
Opus review.

## What it does for the user

Every screen works on the smallest phones and with large text: nothing is cut
off or scrolls sideways, every tap target is big enough to hit, everything
can be reached and used with a keyboard, and a screen reader names every
control and announces what changes.

## How it runs

1. **S0, the harness** (one agent). A sweep spec, `e2e/sweep/sweep.spec.ts`,
   loops over every screen in `e2e/support/dark.ts` `SCREENS` (adding the ones
   it lacks: tools, gauge catalog, wizards, dialogs and sheets that open from a
   screen) and checks on each:
   - no sideways scroll and no clipped text at 320px wide, and at 390px with
     the root font size at 130%;
   - every visible interactive element at least `tokens.touch.min` (44px)
     both ways, or with a hit area that size;
   - `@axe-core/playwright` (WCAG 2.1 AA rules) with no serious or critical
     violation, light and dark;
   - Tab reaches every interactive element in reading order, focus is always
     visible, Escape closes what opened.
   It writes the failures, grouped by the file that owns them, to
   `.claude/handoffs/ui-work/sweep-findings.md`.
2. **Fixers**, in parallel on separate files, one agent per group from the
   findings (the groups follow the wave 2 ownership table in ui-overhaul.md).
   Each fix keeps or adds the sweep check that shows it.
3. **The Opus review**: runs the sweep and the full suite on every project,
   drives the screens with keyboard only and with text at 130%, reports.

## Acceptance

- The sweep spec passes on `phone`, `small` and `desktop`, light and dark,
  with no allowlist entry that is not explained beside it.
- No axe violation of impact serious or critical on any listed screen.
- At 320px and at 130% text, no screen scrolls sideways and no label is cut
  without a way to read it (wrap, or a tooltip on a deliberate ellipsis).
- Every listed screen can be used with a keyboard alone: its main task done
  start to finish (open a section, log a descent, review a proposal, change a
  setting).
