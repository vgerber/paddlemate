import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The phone's own bars (status, navigation) take their colours and button
// contrast from these declarations; the light app must say "light" everywhere.

const html = readFileSync("index.html", "utf8");
const config = readFileSync("vite.config.ts", "utf8");

test("manifest colours are the light app's white", () => {
  expect(config).toMatch(/theme_color: "#ffffff"/);
  expect(config).toMatch(/background_color: "#ffffff"/);
});

test("theme-color is white for the light scheme and the page declares it is light", () => {
  expect(html).toContain(
    '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />',
  );
  expect(html).toContain('<meta name="color-scheme" content="light" />');
});

test("iOS status bar keeps dark text over the light page", () => {
  expect(html).toContain(
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  );
  expect(html).not.toContain("black-translucent");
});
