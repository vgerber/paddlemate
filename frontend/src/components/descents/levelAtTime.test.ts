import { describe, expect, test } from "bun:test";
import type { components } from "@/lib/api/schema";
import { levelAtTime } from "./levelAtTime";

type Section = components["schemas"]["DescentSection"];
type Snap = components["schemas"]["SectionWaterSnapshot"];

const snap = (series_id: number, level: string, value: number | null) =>
  ({ series_id, level, value, unit: "cm", gauge_name: "G" }) as unknown as Snap;

const section = (snaps: Snap[]) =>
  ({ section_id: 1, sort_order: 1, water_snapshots: snaps }) as Section;

describe("levelAtTime", () => {
  test("is null without snapshots", () => {
    expect(levelAtTime([section([])])).toBeNull();
  });

  test("shows the reading of one gauge at the highest level", () => {
    const r = levelAtTime([
      section([snap(1, "low", 40)]),
      section([snap(1, "medium", 95)]),
    ]);
    expect(r?.level).toBe("medium");
    expect(r?.label).toContain("95");
  });

  test("falls back to the level word across gauges", () => {
    const r = levelAtTime([section([snap(1, "low", 40), snap(2, "high", 9)])]);
    expect(r?.level).toBe("high");
    expect(r?.label).toBe("High");
  });
});
