import { describe, expect, test } from "bun:test";
import type { Proposal } from "@/lib/api";
import { kindLine, proposerName, reviewerLine, STATUS_LABEL } from "./status";

describe("reviewerLine", () => {
  const decided = {
    status: "approved",
    reviewed_by: "u2",
    reviewed_by_name: "anna",
  } as Proposal;
  test("names who approved it", () => {
    expect(reviewerLine(decided)).toBe("Approved by anna");
  });
  test("falls back to the id", () => {
    expect(reviewerLine({ ...decided, reviewed_by_name: null })).toBe(
      "Approved by u2",
    );
  });
  test("is empty while pending", () => {
    expect(reviewerLine({ ...decided, status: "pending" })).toBeNull();
  });
});

describe("STATUS_LABEL", () => {
  test("is sentence case", () => {
    expect(STATUS_LABEL).toEqual({
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
    });
  });
});

describe("kindLine", () => {
  const labels = { op: { create: "Create" }, entity: { feature: "Feature" } };
  test("joins operation and entity", () => {
    expect(kindLine("create", "feature", labels)).toBe("Create · Feature");
  });
  test("falls back to the raw value", () => {
    expect(kindLine("merge", "feature", labels)).toBe("merge · Feature");
  });
});

describe("proposerName", () => {
  test("prefers the username", () => {
    expect(
      proposerName({ submitted_by: "u1", submitted_by_name: "jonas" }),
    ).toBe("jonas");
  });
  test("falls back to the id", () => {
    expect(proposerName({ submitted_by: "u1" })).toBe("u1");
  });
  test("says you for the reader", () => {
    expect(
      proposerName({ submitted_by: "u1", submitted_by_name: "jonas" }, "u1"),
    ).toBe("you");
  });
});
