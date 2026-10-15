import { expect, test } from "bun:test";
import { CATEGORY_META } from "./comments";
import { theme } from "./theme";

const { tokens } = theme;

test("hazard categories use text tokens, not map marker hues", () => {
  expect(CATEGORY_META.danger_temporary.color).toBe(tokens.error);
  expect(CATEGORY_META.danger_permanent.color).toBe(tokens.levels.medium.text);
  expect(CATEGORY_META.danger_cleared.color).toBe(tokens.levels.low.text);
});
