import { describe, expect, test } from "bun:test";
import type { Descent } from "@/lib/api";
import { descentRivers, descentTitle } from "./descents";

const log = (
  name: string | null,
  sections: { waterway_name?: string; section_name?: string }[],
) =>
  ({
    name,
    sections: sections.map((s, i) => ({ ...s, sort_order: i })),
  }) as unknown as Pick<Descent, "name" | "sections">;

describe("descentTitle", () => {
  test("its own name wins", () => {
    expect(descentTitle(log("Evening lap", [{ waterway_name: "Isar" }]))).toBe(
      "Evening lap",
    );
  });

  test("then the rivers, each once", () => {
    const d = log(null, [
      { waterway_name: "Isar", section_name: "Upper" },
      { waterway_name: "Isar", section_name: "Lower" },
      { waterway_name: "Loisach" },
    ]);
    expect(descentRivers(d)).toEqual(["Isar", "Loisach"]);
    expect(descentTitle(d)).toBe("Isar / Loisach");
  });

  test("then the sections, then a plain word", () => {
    expect(
      descentTitle(log(null, [{ section_name: "A" }, { section_name: "B" }])),
    ).toBe("A, B");
    expect(descentTitle(log(null, []))).toBe("Descent");
  });
});
