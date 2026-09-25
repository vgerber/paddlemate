import { describe, expect, test } from "bun:test";
import type { Descent } from "@/lib/api";
import { copyFromDescent } from "./model";

/** A mate's public log, shared nowhere else, with a personal note. */
const theirs = {
  id: 1,
  user_id: "mara",
  name: "Wellerbruecke lap",
  note: "my shoulder hurt the whole way",
  start_time: "2026-09-10T08:00:00Z",
  end_time: "2026-09-10T10:00:00Z",
  visibility: { type: "shared", users: ["tobi"], groups: [7] },
  visible_from: "2026-09-11T00:00:00Z",
  trip_id: 9001,
  sections: [
    { section_id: 12, sort_order: 2, section_name: "Lower" },
    { section_id: 11, sort_order: 1, section_name: "Upper" },
  ],
  created_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-10T10:00:00Z",
} as unknown as Descent;

describe("copyFromDescent", () => {
  test("starts private, whatever the original was", () => {
    const form = copyFromDescent(theirs);
    expect(form.visibility_type).toBe("private");
    expect(form.shared_users).toEqual([]);
    expect(form.shared_groups).toEqual([]);
    expect(form.visible_from).toBe("");
  });

  test("leaves the original's note behind", () => {
    expect(copyFromDescent(theirs).note).toBe("");
  });

  test("keeps what describes the run", () => {
    const form = copyFromDescent(theirs);
    expect(form.name).toBe("Wellerbruecke lap");
    expect(form.trip_id).toBe(9001);
    expect(form.sections.map((s) => s.section_id)).toEqual([11, 12]);
  });
});
