import { describe, expect, test } from "bun:test";
import { isGeographyRoute, isLogFormRoute } from "./canvasRoutes";

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

  test("the suggest-section wizard is on the canvas", () => {
    expect(isGeographyRoute("/waterways/suggest-section")).toBe(true);
    expect(isGeographyRoute("/waterways/suggest-river")).toBe(false);
  });

  test("the log form is on the canvas, its picker map is the host map", () => {
    expect(isGeographyRoute("/logs/new")).toBe(true);
    expect(isGeographyRoute("/logs/12")).toBe(true);
    expect(isLogFormRoute("/logs/new")).toBe(true);
    expect(isLogFormRoute("/logs/12", { edit: true })).toBe(true);
    expect(isLogFormRoute("/logs/12", { edit: "true" })).toBe(true);
    expect(isLogFormRoute("/logs/12", { edit: false })).toBe(false);
    expect(isLogFormRoute("/logs")).toBe(false);
  });

  test("a prefix must end at a path segment", () => {
    expect(isGeographyRoute("/logsheet")).toBe(false);
    expect(isGeographyRoute("/tripsy")).toBe(false);
    expect(isGeographyRoute("/proposals-old")).toBe(false);
  });
});
