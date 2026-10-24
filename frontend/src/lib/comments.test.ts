import { describe, expect, test } from "bun:test";
import { categoryColor, categoryMeta } from "./comments";
import { type ResolvedTokens, type Scheme, tokensFor } from "./useTokens";

const SCHEMES: Scheme[] = ["light", "dark"];

describe.each(SCHEMES)("category colours in the %s scheme", (scheme) => {
  const t = tokensFor(scheme);

  test("hazard categories use text tokens, not map marker hues", () => {
    const meta = categoryMeta(scheme);
    expect(meta.danger_temporary.color).toBe(t.error);
    expect(meta.urgent.color).toBe(t.error);
    expect(meta.danger_permanent.color).toBe(t.levels.medium.text);
    expect(meta.danger_cleared.color).toBe(t.levels.low.text);
  });

  test("categoryColor follows the scheme, neutral categories have none", () => {
    expect(categoryColor("danger_cleared", scheme)).toBe(t.levels.low.text);
    expect(categoryColor("info", scheme)).toBeUndefined();
  });
});

test("given tokens reach the colours", () => {
  const fake = {
    ...tokensFor("light"),
    error: "#000001",
  } as unknown as ResolvedTokens;
  expect(categoryColor("urgent", fake)).toBe("#000001");
});

test("no argument means light", () => {
  expect(categoryColor("urgent")).toBe(categoryColor("urgent", "light"));
});
