import { describe, expect, test } from "bun:test";
import { ApiError } from "@/lib/api/client";
import { shouldRetryQuery } from "./retry";

describe("shouldRetryQuery", () => {
  test("4xx never retries", () => {
    for (const status of [400, 403, 404]) {
      expect(shouldRetryQuery(0, new ApiError(status, "x"))).toBe(false);
    }
  });
  test("5xx and network errors retry once", () => {
    expect(shouldRetryQuery(0, new ApiError(500, "x"))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(500, "x"))).toBe(false);
    expect(shouldRetryQuery(0, new TypeError("network"))).toBe(true);
    expect(shouldRetryQuery(1, new TypeError("network"))).toBe(false);
  });
});
