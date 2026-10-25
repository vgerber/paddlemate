import { expect, type Page } from "@playwright/test";

/** The stored choice; MUI's `modeStorageKey`, read by the inline script in
 * index.html (doc/design.md#dark-mode). */
export const MODE_KEY = "paddlemate-color-mode";

export type Mode = "light" | "dark" | "system";
export type Scheme = "light" | "dark";

/** Sets the stored mode before the page loads and emulates the device
 * preference. `system` stores nothing (the default); the device is `os`
 * (light unless given). Call before `page.goto`. */
export async function useScheme(
  page: Page,
  mode: Mode,
  os: Scheme = mode === "dark" ? "dark" : "light",
) {
  await page.emulateMedia({ colorScheme: os });
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (value === "system") localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // storage blocked: the page falls back to System
      }
    },
    [MODE_KEY, mode] as const,
  );
}

type Rgba = [number, number, number, number];

/** Runs in the page. Returns the offending elements; the helpers below turn
 * them into assertions. Kept as one function so it serialises to the browser. */
function scan(kind: string) {
  const parse = (c: string): Rgba => {
    const m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1]
        .split(/[,/ ]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    }
    const s = c.match(/^color\(srgb ([^)]+)\)$/);
    if (s) {
      const p = s[1].split(/[ /]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
    }
    return [0, 0, 0, 0];
  };
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c: Rgba) =>
    0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const over = (fg: Rgba, bg: Rgba): Rgba => {
    const a = fg[3] + bg[3] * (1 - fg[3]);
    if (a === 0) return [0, 0, 0, 0];
    const ch = (i: number) => (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a;
    return [ch(0), ch(1), ch(2), a];
  };
  const ratio = (a: Rgba, b: Rgba) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const name = (el: Element) => {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
    const text = (el.textContent ?? "").trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  // Level dots are data marks, not surfaces.
  const skip =
    'img, canvas, video, picture, svg, [data-imagery], [data-dot], [data-level], [data-testid="note-dot"]';
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return (
      s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"
    );
  };
  // The colour an element sits on: its ancestors' backgrounds composited, the
  // page's white as the last resort.
  const groundOf = (el: Element | null): Rgba => {
    const stack: Rgba[] = [];
    for (let n = el; n; n = n.parentElement)
      stack.push(parse(getComputedStyle(n).backgroundColor));
    let out: Rgba = [255, 255, 255, 1];
    for (const c of stack.reverse()) out = over(c, out);
    return out;
  };
  const hasImage = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement)
      if (getComputedStyle(n).backgroundImage !== "none") return true;
    return false;
  };

  const found: { what: string; detail: string }[] = [];
  const all = Array.from(document.body.querySelectorAll("*"));

  if (kind === "surface") {
    for (const el of all) {
      if (el.matches(skip) || el.closest("[data-imagery], canvas")) continue;
      if (!visible(el)) continue;
      const bg = parse(getComputedStyle(el).backgroundColor);
      if (bg[3] > 0.5 && lum(bg) > 0.5)
        found.push({
          what: name(el),
          detail: `background rgba(${bg.map((v) => Math.round(v * 100) / 100).join(", ")})`,
        });
    }
    return found;
  }

  for (const el of all) {
    if (!visible(el) || el.closest("svg, canvas")) continue;
    if (el.matches(":disabled, [aria-disabled='true']")) continue;
    const s = getComputedStyle(el);
    const ground = groundOf(el.parentElement);
    const ownBg = parse(s.backgroundColor);

    const hasText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
    );
    if (hasText && !hasImage(el)) {
      const size = Number.parseFloat(s.fontSize);
      const bold = Number.parseInt(s.fontWeight, 10) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const bg = over(ownBg, ground);
      const fg = over(parse(s.color), bg);
      const r = ratio(fg, bg);
      if (r < need)
        found.push({
          what: `text ${name(el)}`,
          detail: `${r.toFixed(2)} < ${need}`,
        });
    }

    const control = el.matches(
      "button, input, select, textarea, [role='button'], [role='tab'], [role='switch']",
    );
    const bw = Number.parseFloat(s.borderTopWidth);
    // An unset FilterChip is a borderless raised pill: transparent edge, a
    // fill and the e1 shadow. Nothing else gets this pass.
    const raisedChip =
      el.matches(".MuiChip-root:not(.MuiChip-colorPrimary)") &&
      parse(s.borderTopColor)[3] === 0 &&
      s.boxShadow !== "none";
    if (control && !raisedChip && bw > 0 && s.borderTopStyle !== "none") {
      const border = over(parse(s.borderTopColor), ground);
      const r = ratio(border, ground);
      if (r < 3)
        found.push({
          what: `border ${name(el)}`,
          detail: `${r.toFixed(2)} < 3`,
        });
    }
  }
  return found;
}

/** Elements with a light background (opaque enough and bright), outside
 * imagery. Empty in a correct dark screen. */
export async function lightSurfaces(page: Page) {
  return page.evaluate(scan, "surface");
}

/** Fails when any visible element has a light surface. Dark screens only. */
export async function noLightSurface(page: Page) {
  expect(await lightSurfaces(page), "light surfaces on the screen").toEqual([]);
}

/** Text below 4.5:1 (3:1 for large or bold-large text) and control borders
 * below 3:1, each against the colour it sits on. Elements on a background
 * image, inside SVG or canvas, and disabled controls are not measured. */
export async function contrastReport(page: Page) {
  return page.evaluate(scan, "contrast");
}

/** Fails when `contrastReport` finds anything. */
export async function expectContrast(page: Page) {
  expect(await contrastReport(page), "contrast violations").toEqual([]);
}

/** The 14 named screens of the plan: where they live and how to open them.
 * `ready` waits for something that proves the screen drew. */
export type Screen = {
  name: string;
  path: string;
  /** Extra steps after navigation (open a tab). */
  open?: (page: Page) => Promise<void>;
  ready: (page: Page) => Promise<void>;
  /** Selector of content that changes with the clock (a date field); a
   * screenshot masks it. */
  volatile?: string;
};

const heading = (text: RegExp | string) => async (page: Page) => {
  await expect(page.getByText(text).first()).toBeVisible();
};

const openTab = (name: string) => async (page: Page) => {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
};

export const SCREENS: Screen[] = [
  {
    name: "map",
    path: "/",
    ready: async (page) => {
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    },
  },
  {
    name: "river",
    path: "/?waterway=9001",
    ready: heading("Lower Test"),
  },
  {
    name: "section-features",
    path: "/?waterway=9001&section=9102",
    ready: heading("Lower Test"),
  },
  {
    name: "section-sources",
    path: "/?waterway=9001&section=9102",
    ready: heading("Lower Test"),
    open: openTab("Sources"),
  },
  {
    name: "gauge",
    path: "/?waterway=9001",
    ready: heading("Test River"),
    open: openTab("Gauges"),
  },
  { name: "logs", path: "/logs", ready: heading(/Test/) },
  {
    name: "log-form",
    path: "/logs/new",
    ready: heading("Log descent"),
    volatile: "input",
  },
  { name: "trips", path: "/trips", ready: heading("Oetztal week") },
  {
    name: "trip",
    path: "/trips/9001?edit=false",
    ready: heading("Oetztal week"),
  },
  {
    name: "proposals",
    path: "/proposals?status=pending",
    ready: heading(/Mittelschwall/),
  },
  {
    name: "proposal",
    path: "/proposals/9701",
    ready: heading(/Mittelschwall/),
  },
  { name: "search", path: "/?panel=1&q=Test", ready: heading(/Test/) },
  {
    name: "settings",
    path: "/settings?group=language",
    ready: heading(/Language/i),
  },
  {
    name: "notifications",
    path: "/settings?group=notifications",
    ready: heading(/Notification/i),
  },
];

export const SCREEN_NAMES = SCREENS.map((s) => s.name);
