import { describe, expect, test } from "bun:test";
import { activeNav, DESKTOP_NAV, PHONE_NAV } from "./nav";

describe("activeNav", () => {
  test("the map is only the root path", () => {
    expect(activeNav(PHONE_NAV, "/")).toBe("/");
    expect(activeNav(PHONE_NAV, "/unknown")).toBeNull();
  });

  test("nested paths belong to their section", () => {
    expect(activeNav(PHONE_NAV, "/logs/12")).toBe("/logs");
    expect(activeNav(DESKTOP_NAV, "/trips/3")).toBe("/trips");
  });

  test("a prefix match needs a path boundary", () => {
    expect(activeNav(PHONE_NAV, "/logsx")).toBeNull();
  });

  test("proposals and tools light Tools on desktop and Profile on a phone", () => {
    for (const path of ["/tools/x", "/proposals/4", "/admin/proposals"]) {
      expect(activeNav(DESKTOP_NAV, path)).toBe("/tools");
      expect(activeNav(PHONE_NAV, path)).toBe("/settings");
    }
  });

  test("settings is Profile on a phone only", () => {
    expect(activeNav(PHONE_NAV, "/settings")).toBe("/settings");
    expect(activeNav(DESKTOP_NAV, "/settings")).toBeNull();
  });
});
