import { describe, expect, test } from "bun:test";
import type { Descent, Proposal } from "@/lib/api";
import type { components } from "@/lib/api/schema";
import {
  captionText,
  currentLevel,
  dayLabel,
  fitRows,
  hazardNotes,
  hazardRow,
  levelText,
  noteRow,
  orderRows,
  paddledRow,
  proposalRow,
} from "./stateRows";

type Comment = components["schemas"]["Comment"];

const now = new Date(2026, 9, 12, 12, 0);
const daysAgo = (n: number) => new Date(2026, 9, 12 - n, 10, 0).toISOString();

function note(
  id: number,
  category: Comment["category"],
  ago: number,
  extra: Partial<Comment> = {},
): Comment {
  return {
    id,
    category,
    status: "ok",
    body: `note ${id}`,
    author_name: "mara",
    created_at: daysAgo(ago),
    ...extra,
  } as Comment;
}

describe("hazardNotes", () => {
  test("keeps open urgent and hazard notes within 90 days, newest first", () => {
    const list = hazardNotes(
      [
        note(1, "danger_temporary", 10),
        note(2, "urgent", 2),
        note(3, "danger_temporary", 100),
        note(4, "info", 1),
        { ...note(5, "urgent", 1), status: "outdated" },
        note(6, "danger_permanent", 1),
      ],
      now,
    );
    expect(list.map((c) => c.id)).toEqual([2, 1]);
  });

  test("a newer cleared note hides older hazards only", () => {
    const list = hazardNotes(
      [
        note(1, "danger_temporary", 10),
        note(2, "danger_cleared", 5),
        note(3, "danger_temporary", 2),
      ],
      now,
    );
    expect(list.map((c) => c.id)).toEqual([3]);
  });
});

describe("hazardRow and noteRow", () => {
  const comments = [
    note(1, "danger_temporary", 7, { author_name: "mara" }),
    note(2, "urgent", 1),
    note(3, "info", 9, { author_name: "jonas" }),
  ];
  const hazards = hazardNotes(comments, now);

  test("hazard row names the newest and counts the rest", () => {
    const row = hazardRow(hazards, now);
    expect(row?.title).toBe("note 2");
    expect(row?.lead?.text).toBe("Urgent");
    expect(row?.detail).toBe(", mara, +1 more");
    expect(row?.when).toBe("Yesterday");
    expect(row?.opens).toBe("notes");
  });

  test("no hazards, no row", () => {
    expect(hazardRow([], now)).toBeNull();
  });

  test("note row skips the hazard row's note and counts all ok notes", () => {
    const row = noteRow(comments, hazards, now);
    expect(row?.title).toBe("note 1");
    expect(row?.detail).toBe("mara · 3 notes");
  });

  test("a lone hazard leaves no note row; one note reads singular", () => {
    const one = [note(1, "urgent", 1)];
    expect(noteRow(one, hazardNotes(one, now), now)).toBeNull();
    const info = [note(2, "info", 3)];
    expect(noteRow(info, [], now)?.detail).toBe("mara · 1 note");
  });
});

describe("dayLabel", () => {
  test("today, yesterday, this year, other year", () => {
    expect(dayLabel(daysAgo(0), now)).toBe("Today");
    expect(dayLabel(daysAgo(1), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 3, 9).toISOString(), now)).toBe("3 Oct");
    expect(dayLabel(new Date(2025, 3, 14, 9).toISOString(), now)).toBe(
      "14 Apr 2025",
    );
  });
});

function descent(snap: Partial<components["schemas"]["SectionWaterSnapshot"]>) {
  return {
    id: 1,
    user_id: "u1",
    username: "mara",
    start_time: daysAgo(9),
    sections: [
      {
        section_id: 7,
        sort_order: 0,
        water_snapshots: [
          {
            gauge_id: 1,
            gauge_name: "g",
            level: "medium",
            series_id: 1,
            unit: "cm",
            value: 82,
            range_low: 50,
            range_medium: 70,
            range_high: 120,
            ...snap,
          },
        ],
      },
    ],
  } as unknown as Descent;
}

describe("levelText", () => {
  test("quotes the reading and the level word", () => {
    expect(levelText(descent({}), 7, null)).toBe("At 82 cm, medium");
  });

  test("says same as now when the levels match", () => {
    expect(levelText(descent({}), 7, "medium")).toBe(
      "At 82 cm, medium - same as now",
    );
    expect(levelText(descent({}), 7, "high")).toBe("At 82 cm, medium");
  });

  test("no thresholds, no level word; no snapshot, nothing", () => {
    const bare = descent({
      range_low: null,
      range_medium: null,
      range_high: null,
    });
    expect(levelText(bare, 7, "medium")).toBe("At 82 cm");
    expect(levelText(descent({}), 8, null)).toBe("");
  });
});

describe("paddledRow", () => {
  const opts = { sectionId: 7, viewerId: "u2", level: null, now };

  test("names who, when and the year's count", () => {
    const row = paddledRow(descent({}), { ...opts, thisYear: 4 });
    expect(row?.title).toBe("Last paddled by mara");
    expect(row?.detail).toBe("At 82 cm, medium · 4 logs this year");
    expect(row?.opens).toBe("logs");
  });

  test("says you for the viewer and drops a zero count", () => {
    const row = paddledRow(descent({}), {
      ...opts,
      viewerId: "u1",
      thisYear: 0,
    });
    expect(row?.title).toBe("Last paddled by you");
    expect(row?.detail).toBe("At 82 cm, medium");
    expect(paddledRow(undefined, { ...opts, thisYear: 0 })).toBeNull();
  });

  test("one log reads singular", () => {
    expect(
      paddledRow(descent({ value: null }), { ...opts, thisYear: 1 })?.detail,
    ).toBe("1 log this year");
  });
});

describe("proposalRow", () => {
  test("counts and quotes the newest", () => {
    const mk = (id: number, ago: number, name: string) =>
      ({
        id,
        created_at: daysAgo(ago),
        entity_type: "feature",
        proposed_data: { name },
      }) as unknown as Proposal;
    const row = proposalRow([mk(1, 9, "Old weir"), mk(2, 3, "Add weir")], now);
    expect(row?.title).toBe("2 open proposals");
    expect(row?.detail).toBe("Add weir");
    expect(row?.opens).toBe("features");
    expect(proposalRow([mk(1, 1, "x")], now)?.title).toBe("1 open proposal");
    expect(proposalRow([], now)).toBeNull();
  });
});

describe("captionText", () => {
  test("added by, then edited on another day", () => {
    expect(
      captionText({
        createdAt: new Date(2026, 2, 12, 9).toISOString(),
        updatedAt: new Date(2026, 9, 3, 9).toISOString(),
        by: "vincent",
        now,
      }),
    ).toBe("Added 12 Mar 2026 by vincent, edited 3 Oct");
  });

  test("untouched and anonymous", () => {
    expect(
      captionText({
        createdAt: new Date(2026, 2, 12, 9).toISOString(),
        updatedAt: new Date(2026, 2, 12, 18).toISOString(),
        now,
      }),
    ).toBe("Added 12 Mar 2026");
  });
});

describe("currentLevel", () => {
  const range = (ago: number, level: string, interval = 900) =>
    ({
      level,
      range_low: 50,
      gauge: { fetch_interval_secs: interval },
      latest_reading: {
        measured_at: new Date(now.getTime() - ago * 3600_000).toISOString(),
      },
    }) as never;

  test("fresh calibrated readings give the worst level", () => {
    expect(currentLevel([range(1, "low"), range(2, "high")], now)).toBe("high");
  });

  test("stale or uncalibrated readings give none", () => {
    expect(currentLevel([range(5, "high")], now)).toBeNull();
    expect(currentLevel([range(5, "high", 7200)], now)).toBe("high");
    const bare = { ...(range(1, "high") as object), range_low: null } as never;
    expect(currentLevel([bare], now)).toBeNull();
    expect(currentLevel([], now)).toBeNull();
  });
});

describe("fitRows", () => {
  test("rows drop from the bottom", () => {
    expect(fitRows(5, 170, true)).toEqual({ rows: 3, caption: false });
    expect(fitRows(2, 56, true)).toEqual({ rows: 1, caption: false });
  });

  test("caption needs every row and 32px after them", () => {
    expect(fitRows(2, 144, true)).toEqual({ rows: 2, caption: true });
    expect(fitRows(2, 143, true)).toEqual({ rows: 2, caption: false });
    expect(fitRows(2, 400, false)).toEqual({ rows: 2, caption: false });
  });

  test("under one row nothing is drawn; five rows at most", () => {
    expect(fitRows(3, 55, true)).toEqual({ rows: 0, caption: false });
    expect(fitRows(9, 900, true).rows).toBe(5);
  });
});

describe("orderRows", () => {
  test("hazard, paddled, note, proposal; absent rows are skipped", () => {
    const r = (key: "hazard" | "paddled" | "note" | "proposal") => ({
      key,
      title: key,
      detail: "",
      opens: "notes" as const,
    });
    expect(
      orderRows({
        proposal: r("proposal"),
        hazard: r("hazard"),
        note: null,
      }).map((x) => x.key),
    ).toEqual(["hazard", "proposal"]);
  });
});
