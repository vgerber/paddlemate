import { describe, expect, test } from "bun:test";
import type { components } from "@/lib/api/schema";
import { countLevels, dotLevel, dotsLabel } from "./levelDots";

type Status = components["schemas"]["SectionWaterStatus"];

const NOW = Date.parse("2026-10-14T12:00:00Z");

function status(
  level: string,
  measured: string | null,
  calibrated = true,
): Status {
  return {
    ranges: [
      {
        level,
        gauge: { fetch_interval_secs: 900 },
        range_low: calibrated ? 10 : null,
        latest_reading: measured
          ? { measured_at: measured, series_id: 1, value: 5 }
          : null,
      },
    ],
  } as unknown as Status;
}

describe("dotLevel", () => {
  test("a fresh calibrated reading gives its level", () => {
    expect(dotLevel(status("medium", "2026-10-14T11:00:00Z"), NOW)).toBe(
      "medium",
    );
  });

  test("a stale reading is unknown", () => {
    expect(dotLevel(status("high", "2026-10-12T11:00:00Z"), NOW)).toBe(
      "unknown",
    );
  });

  test("no gauge, no reading or no thresholds is unknown", () => {
    expect(dotLevel(undefined, NOW)).toBe("unknown");
    expect(dotLevel({ ranges: [] } as unknown as Status, NOW)).toBe("unknown");
    expect(dotLevel(status("low", null), NOW)).toBe("unknown");
    expect(dotLevel(status("low", "2026-10-14T11:00:00Z", false), NOW)).toBe(
      "unknown",
    );
  });
});

describe("dotsLabel", () => {
  test("counts running sections and names the rest", () => {
    expect(dotsLabel(["low", "high", "empty", "unknown"])).toBe(
      "2 of 4 sections running: 1 low, 1 high; 1 too low; 1 no current reading",
    );
  });

  test("stays short when everything runs", () => {
    expect(dotsLabel(["medium"])).toBe("1 of 1 section running: 1 medium");
  });

  test("is empty without sections", () => {
    expect(dotsLabel([])).toBe("");
    expect(countLevels([]).high).toBe(0);
  });
});
