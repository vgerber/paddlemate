import { expect, test } from "bun:test";
import { theme } from "./theme";

const phone: Record<string, number> = { ...theme.tokens.phone };

test("the 28 text line is the card edge plus its inner padding", () => {
  expect(phone.line).toBe(phone.edge + phone.inner);
});

test("names after an icon start on the 68 line", () => {
  expect(phone.nameLine).toBe(phone.line + phone.icon + phone.iconGap);
});

test("the FAB room clears a 56 button with 16 around it", () => {
  expect(phone.fabRoom).toBe(56 + 16 + 16);
});
