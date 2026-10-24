import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MODE_KEY, resolveScheme, themeColorFor } from "./colorMode";
import { darkTokens, lightTokens } from "./theme";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

/** Runs the inline script of index.html against a fake page. */
function runInline(stored: string | null | "throws", prefersDark: boolean) {
  const attrs: Record<string, string> = {};
  const meta: Record<string, string> = {};
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error("no inline script in index.html");
  const fakeDocument = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
    },
    querySelector: (sel: string) => {
      if (!sel.includes('media*="light"')) throw new Error(`wrong meta ${sel}`);
      return {
        setAttribute: (k: string, v: string) => {
          meta[k] = v;
        },
      };
    },
  };
  const fakeStorage = {
    getItem: () => {
      if (stored === "throws") throw new Error("blocked");
      return stored;
    },
  };
  const fakeMatchMedia = () => ({ matches: prefersDark });
  new Function("localStorage", "matchMedia", "document", script)(
    fakeStorage,
    fakeMatchMedia,
    fakeDocument,
  );
  return { theme: attrs["data-theme"], color: meta.content };
}

describe("resolveScheme", () => {
  test("a chosen mode wins over the device", () => {
    expect(resolveScheme("dark", false)).toBe("dark");
    expect(resolveScheme("light", true)).toBe("light");
  });
  test("system and anything unknown follow the device", () => {
    for (const m of ["system", null, undefined, "sepia"]) {
      expect(resolveScheme(m, true)).toBe("dark");
      expect(resolveScheme(m, false)).toBe("light");
    }
  });
});

describe("themeColorFor", () => {
  test("is the light surface and the dark ground", () => {
    expect(themeColorFor("light")).toBe(lightTokens.surface);
    expect(themeColorFor("dark")).toBe(darkTokens.background);
  });
  test("agrees with the metas in index.html", () => {
    expect(html).toContain(
      `content="${themeColorFor("light")}" media="(prefers-color-scheme: light)"`,
    );
    expect(html).toContain(
      `content="${themeColorFor("dark")}" media="(prefers-color-scheme: dark)"`,
    );
  });
});

describe("the inline script in index.html", () => {
  const stored = ["dark", "light", "system", null, "sepia"] as const;
  for (const mode of stored) {
    for (const prefersDark of [false, true]) {
      test(`mode ${mode}, device ${prefersDark ? "dark" : "light"}`, () => {
        const scheme = resolveScheme(mode, prefersDark);
        expect(runInline(mode, prefersDark)).toEqual({
          theme: scheme,
          color: themeColorFor(scheme),
        });
      });
    }
  }

  test("blocked storage falls back to the device", () => {
    expect(runInline("throws", true).theme).toBe("dark");
    expect(runInline("throws", false).theme).toBe("light");
  });

  test("reads the key colorMode.ts stores under", () => {
    expect(html).toContain(`"${MODE_KEY}"`);
  });
});

describe("the pre-paint style in index.html", () => {
  test("holds the ground of each scheme", () => {
    expect(html).toContain(`html { background: ${lightTokens.background}; }`);
    expect(html).toContain(
      `html[data-theme="dark"] { background: ${darkTokens.background}; color-scheme: dark; }`,
    );
  });
});
