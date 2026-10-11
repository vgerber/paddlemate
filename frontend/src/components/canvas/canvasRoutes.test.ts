import { describe, expect, test } from "bun:test";
import { isGeographyRoute } from "./canvasRoutes";

describe("isGeographyRoute", () => {
  test("the map, logs, trips and proposals have geography", () => {
    for (const path of [
      "/",
      "/logs",
      "/logs/12",
      "/trips",
      "/trips/3/candidates",
      "/proposals",
      "/proposals/9",
    ]) {
      expect(isGeographyRoute(path), path).toBe(true);
    }
  });

  test("settings, tools, admin and the rest do not", () => {
    for (const path of [
      "/settings",
      "/tools",
      "/tools/gauge-catalog",
      "/admin/proposals",
      "/waterways/new",
      "/invite/abc",
    ]) {
      expect(isGeographyRoute(path), path).toBe(false);
    }
  });

  test("a prefix must end at a path segment", () => {
    expect(isGeographyRoute("/logsheet")).toBe(false);
    expect(isGeographyRoute("/tripsy")).toBe(false);
    expect(isGeographyRoute("/proposals-old")).toBe(false);
  });
});
