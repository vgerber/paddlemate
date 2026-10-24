import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The phone's own bars (status, navigation) take their colours and button
// contrast from these declarations; the light app must say "light" everywhere.

const html = readFileSync("index.html", "utf8");
const config = readFileSync("vite.config.ts", "utf8");

test("the installed app's frame is dark, so the phone's buttons show", () => {
  expect(config).toMatch(/theme_color: "#141b1f"/);
  expect(config).toMatch(/background_color: "#141b1f"/);
});

test("theme-color is white for the light scheme", () => {
  expect(html).toContain(
    '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />',
  );
});

test("iOS status bar keeps dark text over the light page", () => {
  expect(html).toContain(
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  );
  expect(html).not.toContain("black-translucent");
});

// A phone in dark mode draws its buttons light, so the frame behind them must
// be dark even though the app is light.
for (const [scheme, colour] of [
  ["light", "#ffffff"],
  ["dark", "#141b1f"],
] as const) {
  test(`a phone in ${scheme} mode gets a ${colour} frame`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    const active = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLMetaElement>(
          'meta[name="theme-color"]',
        ),
      ]
        .filter((m) => !m.media || matchMedia(m.media).matches)
        .map((m) => m.content),
    );
    expect(active).toEqual([colour]);
  });
}
