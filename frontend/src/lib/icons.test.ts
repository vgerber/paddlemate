import { describe, expect, test } from "bun:test";
import { STAY_KINDS, stayKind } from "@/components/trips/stayKinds";
import * as icons from "./icons";

describe("icons", () => {
  test("every export is a component", () => {
    for (const [name, icon] of Object.entries(icons)) {
      expect(icon, name).toBeDefined();
    }
  });

  test("each export is its own idea, named Icon", () => {
    for (const name of Object.keys(icons)) expect(name).toMatch(/Icon$/);
  });

  test("a stay kind this build does not know falls back to other", () => {
    // @ts-expect-error a kind from a newer server
    expect(stayKind("yurt").value).toBe("other");
  });

  test("the generic base differs from every kind's icon", () => {
    for (const k of STAY_KINDS) expect(k.Icon).not.toBe(icons.BaseIcon);
  });
});
