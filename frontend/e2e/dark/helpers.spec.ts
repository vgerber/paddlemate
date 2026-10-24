import { expect, test } from "@playwright/test";
import {
  contrastReport,
  lightSurfaces,
  MODE_KEY,
  SCREENS,
  useScheme,
} from "../support/dark";

// Self-test of the dark-mode helpers: each one must fail on a bad page and
// stay quiet on a good one, or the dark specs built on it prove nothing.

const page = (body: string) =>
  `<!doctype html><body style="margin:0;background:#141b1f;color:#e8eef0">${body}</body>`;

test.describe("useScheme", () => {
  test("stores the mode and emulates the device", async ({ page: p }) => {
    await useScheme(p, "dark");
    await p.goto("/auth/callback");
    expect(await p.evaluate((k) => localStorage.getItem(k), MODE_KEY)).toBe(
      "dark",
    );
    expect(
      await p.evaluate(
        () => matchMedia("(prefers-color-scheme: dark)").matches,
      ),
    ).toBe(true);
  });

  test("system stores nothing and follows the device", async ({ page: p }) => {
    await useScheme(p, "system", "dark");
    await p.goto("/auth/callback");
    expect(await p.evaluate((k) => localStorage.getItem(k), MODE_KEY)).toBe(
      null,
    );
    expect(
      await p.evaluate(
        () => matchMedia("(prefers-color-scheme: dark)").matches,
      ),
    ).toBe(true);
  });

  test("a stored light mode can sit under a dark device", async ({
    page: p,
  }) => {
    await useScheme(p, "light", "dark");
    await p.goto("/auth/callback");
    expect(await p.evaluate((k) => localStorage.getItem(k), MODE_KEY)).toBe(
      "light",
    );
  });
});

test.describe("noLightSurface", () => {
  test("flags a white card on a dark ground", async ({ page: p }) => {
    await p.setContent(
      page('<div id="c" style="background:#fff;width:50px;height:50px"></div>'),
    );
    const found = await lightSurfaces(p);
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain("div#c");
  });

  test("flags a translucent colour-mix surface only above half alpha", async ({
    page: p,
  }) => {
    await p.setContent(
      page(
        `<div style="background:color-mix(in srgb, #fff 80%, transparent);width:20px;height:20px"></div>
         <div style="background:color-mix(in srgb, #fff 20%, transparent);width:20px;height:20px"></div>`,
      ),
    );
    expect(await lightSurfaces(p)).toHaveLength(1);
  });

  test("passes dark surfaces, images and canvases", async ({ page: p }) => {
    await p.setContent(
      page(
        `<div style="background:#1b2429;width:50px;height:50px"></div>
         <canvas style="background:#fff" width="20" height="20"></canvas>
         <div data-imagery style="background:#fff;width:20px;height:20px"></div>`,
      ),
    );
    expect(await lightSurfaces(p)).toEqual([]);
  });
});

test.describe("contrastReport", () => {
  test("flags grey text that is too faint", async ({ page: p }) => {
    await p.setContent(
      page('<p style="color:#3a454b;font-size:16px">faint words</p>'),
    );
    const found = await contrastReport(p);
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain("faint words");
  });

  test("passes the dark ink on the dark ground", async ({ page: p }) => {
    await p.setContent(page("<p>readable</p>"));
    expect(await contrastReport(p)).toEqual([]);
  });

  test("large text needs only 3:1", async ({ page: p }) => {
    // #6b7a81 on #141b1f is about 3.9:1.
    await p.setContent(
      page(
        '<p style="color:#6b7a81;font-size:28px">big</p><p style="color:#6b7a81;font-size:14px">small</p>',
      ),
    );
    const found = await contrastReport(p);
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain("small");
  });

  test("flags a control border below 3:1", async ({ page: p }) => {
    await p.setContent(
      page(
        '<button style="background:#141b1f;color:#e8eef0;border:1px solid #1d272c">go</button>',
      ),
    );
    const found = await contrastReport(p);
    expect(found.map((f) => f.what.split(" ")[0])).toEqual(["border"]);
  });

  test("resolves the ground through translucent parents", async ({
    page: p,
  }) => {
    await p.setContent(
      page(
        '<div style="background:#fff"><p style="color:#e8eef0">light on white</p></div>',
      ),
    );
    expect((await contrastReport(p)).length).toBe(1);
  });
});

test("the screen list names 14 distinct screens", () => {
  expect(SCREENS).toHaveLength(14);
  expect(new Set(SCREENS.map((s) => s.name)).size).toBe(14);
});
