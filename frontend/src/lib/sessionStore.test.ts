import { describe, expect, test } from "bun:test";
import { ErrorResponse } from "oidc-client-ts";
import { isDeadGrant } from "./sessionStore";

describe("isDeadGrant", () => {
  test("a refresh token the server no longer knows ends the session", () => {
    expect(isDeadGrant(new ErrorResponse({ error: "invalid_grant" }))).toBe(
      true,
    );
  });
  test("a network failure or another server error keeps it", () => {
    expect(isDeadGrant(new TypeError("Failed to fetch"))).toBe(false);
    expect(
      isDeadGrant(new ErrorResponse({ error: "temporarily_unavailable" })),
    ).toBe(false);
    expect(isDeadGrant(null)).toBe(false);
  });
});
