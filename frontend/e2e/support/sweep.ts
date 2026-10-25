import { appendFileSync, mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { SCREENS, type Screen } from "./dark";
import { appReady, FIX } from "./fixture";

/** A screen of the sweep: a `dark.ts` screen, plus what it needs before
 * navigation and the overlay (sheet, dialog, menu) it opens, which Escape
 * must close. */
export type SweepScreen = Screen & {
  before?: (page: Page) => Promise<void>;
  overlay?: (page: Page) => Locator;
};

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;
const visible = (l: Locator) => l.filter({ visible: true });

const text = (t: RegExp | string) => async (page: Page) => {
  await expect(page.getByText(t).first()).toBeVisible();
};

const settings = (group: string, ready: RegExp): SweepScreen => ({
  name: `settings-${group}`,
  path: `/settings?group=${group}`,
  ready: text(ready),
});

const logStep = (n: number, label: string): SweepScreen => ({
  name: `log-form-step-${n}`,
  path: `/logs/new?waterwayId=${FIX.waterway}&sectionId=${FIX.sections.upper}`,
  ready: text("Step 1 of 3 · When"),
  open: async (page) => {
    for (let i = 1; i < n; i++)
      await page.getByRole("button", { name: "Next" }).click();
    await text(label)(page);
  },
});

async function noOverpass(page: Page) {
  await page.route(/overpass/, (route) => route.abort());
}

/** Screens `dark.ts` lacks: tools, the wizards, and what opens over a screen. */
export const EXTRA_SCREENS: SweepScreen[] = [
  { name: "tools", path: "/tools", ready: text(/Gauge/i) },
  {
    name: "gauge-catalog",
    path: "/tools/gauge-catalog",
    ready: text(/Gauge/i),
  },
  settings("account", /Account/i),
  settings("appearance", /Appearance|Theme/i),
  settings("tokens", /token/i),
  logStep(2, "Step 2 of 3 · Sections"),
  logStep(3, "Step 3 of 3"),
  {
    name: "suggest-section-name",
    path: `/waterways/suggest-section?waterway=${FIX.waterway}`,
    before: noOverpass,
    ready: async (page) => {
      await expect(page.getByLabel("Name").first()).toBeVisible();
    },
  },
  {
    name: "suggest-section-line",
    path: `/waterways/suggest-section?waterway=${FIX.waterway}`,
    before: noOverpass,
    ready: async (page) => {
      await expect(page.getByLabel("Name").first()).toBeVisible();
    },
    open: async (page) => {
      await page.getByLabel("Name").first().fill("Sweep Section");
      await page.getByRole("button", { name: "Next" }).click();
      await text("Step 2 of 3 · Section")(page);
    },
  },
  {
    name: "suggest-river",
    path: "/?panel=1",
    ready: async (page) => {
      await appReady(page);
    },
    open: async (page) => {
      const docked = visible(page.getByRole("button", { name: "New river" }));
      if (await docked.count()) await docked.first().click();
      else {
        await visible(page.getByPlaceholder("Name", { exact: true }))
          .first()
          .fill("zzzqqq");
        await visible(
          page.locator("button.MuiTab-root", {
            hasText: /^Rivers( \(\d+\))?$/,
          }),
        )
          .first()
          .click();
        await visible(
          page.getByRole("button", { name: "Can't find your river? Add it" }),
        )
          .first()
          .click();
      }
      await expect(visible(page.getByLabel("Name")).first()).toBeVisible();
    },
  },
  {
    name: "suggest-feature",
    path: `/?waterway=${FIX.waterway}&section=${FIX.sections.lower}`,
    ready: async (page) => {
      await appReady(page);
    },
    open: async (page) => {
      await visible(page.getByRole("button", { name: "New feature" }))
        .first()
        .click();
      await expect(
        visible(page.getByRole("radiogroup", { name: "Feature type" })).first(),
      ).toBeVisible();
    },
  },
  {
    name: "filters-sheet",
    path: "/?panel=1&q=Test",
    ready: text(/Test/),
    open: async (page) => {
      await visible(page.locator(".MuiChip-root", { hasText: /^Water/ }))
        .first()
        .click();
      await expect(
        visible(page.getByRole("dialog", { name: "Filters" })).first(),
      ).toBeVisible();
    },
    overlay: (page) => visible(page.getByRole("dialog", { name: "Filters" })),
  },
  {
    name: "confirm-dialog",
    path: "/logs",
    ready: text(/Test/),
    open: async (page) => {
      await page
        .getByTestId("descent-card")
        .filter({ hasText: "Private upper run" })
        .first()
        .click();
      await page.getByRole("button", { name: "Log actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
    overlay: (page) => page.getByRole("dialog"),
  },
  {
    name: "row-menu",
    path: "/logs",
    ready: text(/Test/),
    open: async (page) => {
      await page
        .getByTestId("descent-card")
        .filter({ hasText: "Private upper run" })
        .first()
        .click();
      await page.getByRole("button", { name: "Log actions" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
    overlay: (page) => page.getByRole("menu"),
  },
  {
    name: "trip-invite",
    path: `/trips/${FIX.trips[0]}`,
    ready: text("Oetztal week"),
    open: async (page) => {
      await page.getByRole("tab", { name: "Members", exact: true }).click();
      await page.getByRole("button", { name: "Add member" }).click();
      await expect(
        page.getByRole("button", { name: "New link" }),
      ).toBeVisible();
    },
  },
];

export const SWEEP_SCREENS: SweepScreen[] = [...SCREENS, ...EXTRA_SCREENS];

/** Opens a screen as a user would and waits for it to settle. */
export async function openScreen(page: Page, s: SweepScreen) {
  await s.before?.(page);
  await page.goto(s.path);
  await s.ready(page);
  await s.open?.(page);
  await page.waitForTimeout(600);
}

export type Finding = { selector: string; detail: string };

const OUT = "sweep-results";

/** Appends findings to the run's JSON lines and fails the test softly, so one
 * run lists every problem. */
export function report(
  info: TestInfo,
  screen: string,
  check: string,
  found: Finding[],
) {
  if (found.length) {
    mkdirSync(OUT, { recursive: true });
    for (const f of found)
      appendFileSync(
        `${OUT}/${info.project.name}.jsonl`,
        `${JSON.stringify({ screen, project: info.project.name, check, ...f })}\n`,
      );
  }
  expect.soft(found, `${check} on ${screen}`).toEqual([]);
}

/** Runs in the page. Visible, unclipped-by-hiding interactive elements. */
const INTERACTIVE =
  "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=radio], [role=switch], [role=checkbox], [role=link], [role=option], [tabindex]";

/** Interactive elements under 44px either way (inline links in prose are
 * exempt, as in WCAG 2.5.8). */
export async function smallTargets(page: Page, min = 44): Promise<Finding[]> {
  return page.evaluate(
    ([sel, m]) => {
      const name = (el: Element) => {
        const id = el.getAttribute("data-testid");
        const label =
          el.getAttribute("aria-label") ||
          (el.textContent ?? "").trim().slice(0, 30);
        const cls =
          typeof el.className === "string"
            ? (el.className.split(/\s+/).find((c) => c.startsWith("Mui")) ?? "")
            : "";
        return `${el.tagName.toLowerCase()}${id ? `[testid=${id}]` : ""}${cls ? `.${cls}` : ""} "${label}"`;
      };
      const out: { selector: string; detail: string }[] = [];
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (el.matches('canvas, [tabindex="-1"]:not(button, a, input)'))
          continue;
        if (el.closest("[aria-hidden='true'], [inert]")) continue;
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none") continue;
        if (el.tagName === "A" && s.display === "inline") continue;
        let r = el.getBoundingClientRect();
        // A hidden input (switch, checkbox) is judged by its drawn control.
        if (el.matches("input, textarea, select") && s.opacity !== "0") {
          // A text field is tapped on its whole box, not the bare input.
          const box = el.closest(".MuiInputBase-root");
          if (box) r = box.getBoundingClientRect();
        } else if (el.tagName === "INPUT") {
          const root = el.closest(
            "[class*=MuiSwitch], [class*=MuiCheckbox], [class*=MuiRadio], label",
          );
          if (root) r = root.getBoundingClientRect();
        }
        if (r.width < 1 || r.height < 1) continue;
        if (
          r.right < 0 ||
          r.bottom < 0 ||
          r.left > innerWidth ||
          r.top > innerHeight * 3
        )
          continue;
        if (r.width < m - 0.5 || r.height < m - 0.5)
          out.push({
            selector: name(el),
            detail: `${Math.round(r.width)}x${Math.round(r.height)}`,
          });
      }
      return out;
    },
    [INTERACTIVE, min] as const,
  );
}

/** Text cut off by its box (overflow hidden with more content than fits)
 * and not readable some other way (a title or aria-label). */
export async function clippedText(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { selector: string; detail: string }[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (el.closest("svg, canvas, [aria-hidden='true'], [inert]")) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
      );
      if (!hasText) continue;
      const h = el as HTMLElement;
      const clipsX =
        s.overflowX !== "visible" && h.scrollWidth > h.clientWidth + 1;
      const clipsY =
        s.overflowY !== "visible" &&
        s.textOverflow !== "ellipsis" &&
        h.scrollHeight > h.clientHeight + 3;
      if (!clipsX && !clipsY) continue;
      if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
      if (h.clientWidth === 0) continue;
      // Readable some other way only when the text itself, or the control it
      // sits in, is labelled; a labelled dialog or list around it says nothing.
      const own = el.closest(
        "button, a, [role='button'], [role='tab'], [role='menuitem'], [role='link'], [role='option']",
      );
      if (
        el.hasAttribute("title") ||
        el.hasAttribute("aria-label") ||
        own?.hasAttribute("title") ||
        own?.hasAttribute("aria-label")
      )
        continue;
      const cls =
        typeof el.className === "string"
          ? el.className.split(/\s+/).slice(0, 2).join(".")
          : "";
      out.push({
        selector: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`,
        detail: `${s.textOverflow === "ellipsis" ? "ellipsis" : "cut"} ${h.scrollWidth}x${h.scrollHeight} in ${h.clientWidth}x${h.clientHeight}`,
      });
    }
    return out;
  });
}

export async function overflowX(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const d = document.documentElement;
    const over = d.scrollWidth - d.clientWidth;
    if (over <= 0) return [];
    const wide = Array.from(document.body.querySelectorAll("*"))
      .filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1)
      .slice(0, 3)
      .map((e) => {
        const cls =
          typeof e.className === "string"
            ? e.className.split(/\s+/).slice(0, 2).join(".")
            : "";
        return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
      });
    return [
      {
        selector: wide.join(" | ") || "document",
        detail: `${over}px sideways`,
      },
    ];
  });
}

/** WCAG 2.0/2.1 A and AA; only serious and critical count. */
export async function axeViolations(page: Page): Promise<Finding[]> {
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return res.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes.slice(0, 6).map((n) => ({
        selector: `${v.id}: ${n.target.join(" ")} ${n.html.replace(/\s+/g, " ").slice(0, 110)}`,
        detail: `${v.impact}: ${v.help}`,
      })),
    );
}

type Seen = {
  id: string | null;
  sel: string;
  inView: boolean;
  shown: boolean;
  strong: boolean;
  top: number;
  vy: number;
  pane: number;
  isBody: boolean;
  inMap: boolean;
  handle: boolean;
  card: string;
};

type SweepWindow = Window & { __swEl?: HTMLElement; __swOn?: string[][] };

/** Presses Tab through the screen. Focus must land on shown elements with a
 * visible indicator, in reading order, and reach every interactive element. */
export async function tabThrough(page: Page, max = 90): Promise<Finding[]> {
  const found: Finding[] = [];
  // Style signature of an element and its three parents: a focus ring may sit
  // on a wrapper (a field). Each entry is [outline style, width, colour,
  // box-shadow, background, border colour, text colour].
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__swSig = (
      el: HTMLElement,
    ) => {
      const parts: string[][] = [];
      let n: HTMLElement | null = el;
      for (let d = 0; n && d < 4; d++, n = n.parentElement) {
        for (const pseudo of [null, "::before", "::after"]) {
          const c = getComputedStyle(n, pseudo);
          parts.push([
            c.outlineStyle,
            c.outlineWidth,
            c.outlineColor,
            c.boxShadow,
            c.backgroundColor,
            c.borderTopColor,
            c.color,
          ]);
        }
      }
      return parts;
    };
  });
  const all = await page.evaluate((sel) => {
    const keep: string[] = [];
    document.querySelectorAll(sel).forEach((el, i) => {
      const h = el as HTMLElement;
      if (
        el.getAttribute("tabindex") === "-1" ||
        (el as HTMLInputElement).disabled
      )
        return;
      if (el.matches("canvas") || el.closest("[aria-hidden='true'], [inert]"))
        return;
      const s = getComputedStyle(el);
      const r = h.getBoundingClientRect();
      if (
        s.visibility === "hidden" ||
        s.display === "none" ||
        r.width < 1 ||
        r.height < 1
      )
        return;
      // Covered by a panel or overlay: the user cannot see it to Tab to it.
      const top = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      if (
        r.top < innerHeight &&
        r.bottom > 0 &&
        top &&
        !h.contains(top) &&
        !top.contains(h)
      )
        return;
      h.setAttribute("data-sweep-id", String(i));
      keep.push(String(i));
    });
    return keep;
  }, INTERACTIVE);
  const reached = new Set<string>();
  const order: Seen[] = [];
  // Tab continues from where the last click landed; start at the page top.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
    // A focused-then-removed node at the top resets Chrome's starting point
    // for sequential focus, which blur() alone leaves where it was.
    const anchor = document.createElement("span");
    anchor.tabIndex = -1;
    document.body.prepend(anchor);
    anchor.focus();
    anchor.remove();
  });
  let ended = `stopped at the ${max}-stop cap`;
  let cycled = false;
  let bodyStops = 0;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    // Focus rings fade in (tokens.motion.fast): read them once they have.
    await page.waitForTimeout(220);
    const s: Seen | null = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const w = window as unknown as SweepWindow & {
        __swSig: (e: HTMLElement) => string[][];
      };
      const isBody = el === document.body || el === document.documentElement;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shown =
        !isBody &&
        r.width >= 1 &&
        r.height >= 1 &&
        cs.visibility !== "hidden" &&
        cs.display !== "none" &&
        !el.closest("[aria-hidden='true'], [inert]");
      w.__swEl = el;
      w.__swOn = w.__swSig(el);
      const cls =
        typeof el.className === "string"
          ? (el.className.split(/\s+/).find((c) => c.startsWith("Mui")) ?? "")
          : "";
      return {
        id: el.getAttribute("data-sweep-id"),
        sel: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28)}"`,
        inView:
          r.bottom > 0 &&
          r.top < innerHeight &&
          r.right > 0 &&
          r.left < innerWidth,
        shown,
        strong:
          cs.outlineStyle !== "none" &&
          Number.parseFloat(cs.outlineWidth) > 0 &&
          !cs.outlineColor.includes(", 0)"),
        // Position inside the nearest scrolling pane: a pane scrolls on its
        // own, so a row lower in a scrolled pane is not "up".
        ...(() => {
          let n = el.parentElement;
          while (n && n !== document.documentElement) {
            const o = getComputedStyle(n).overflowY;
            if (
              (o === "auto" || o === "scroll") &&
              n.scrollHeight > n.clientHeight
            )
              break;
            n = n.parentElement;
          }
          const pane = n && n !== document.documentElement ? n : null;
          if (pane) pane.setAttribute("data-sweep-pane", "");
          return {
            pane: pane
              ? [...document.querySelectorAll("[data-sweep-pane]")].indexOf(
                  pane,
                )
              : -1,
            vy: r.top,
            top: r.top + (pane ? pane.scrollTop : scrollY),
          };
        })(),
        isBody,
        card:
          el
            .closest("section[data-testid^='canvas-card-']")
            ?.getAttribute("data-testid") ?? "",
        handle: el.getAttribute("role") === "separator",
        inMap: Boolean(el.closest(".maplibregl-map, [data-testid='map-root']")),
      };
    });
    if (!s) {
      ended = "focus lost (no active element)";
      break;
    }
    if (s.isBody) {
      // Chrome's own stop between the page and its UI. Before anything was
      // reached it is the start, stepped past once; after, it is the page's
      // end, and the next stop would be the page's top again (a wrap, not a
      // jump in the order).
      bodyStops++;
      if (bodyStops < 2 && order.length === 0) continue;
      ended = "focus left the page";
      cycled = true;
      break;
    }
    // Native date and time inputs take several Tab stops on one element;
    // only coming back to an element after leaving it is a cycle.
    if (s.id && reached.has(s.id) && s.id !== order[order.length - 1]?.id) {
      ended = "focus cycled";
      cycled = true;
      break;
    }
    // A further stop on the same element (a date field's next segment) was
    // judged at the first one.
    if (s.id && s.id === order[order.length - 1]?.id) continue;
    if (s.id) reached.add(s.id);
    order.push(s);
    if (!s.shown)
      found.push({ selector: s.sel, detail: "focus on a hidden element" });
    else if (!s.inView)
      found.push({ selector: s.sel, detail: "focus off screen" });
    else if (!s.strong) {
      // No outline: compare against the same element unfocused.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
      );
      await page.waitForTimeout(60);
      const differs = await page.evaluate(() => {
        const w = window as unknown as SweepWindow & {
          __swSig: (e: HTMLElement) => string[][];
        };
        const el = w.__swEl;
        if (!el) return false;
        const off = w.__swSig(el);
        const on = w.__swOn ?? [];
        // r, g, b, alpha of a computed colour.
        const rgba = (css: string): number[] => {
          const n = css.match(/-?\d*\.?\d+/g)?.map(Number) ?? [0, 0, 0, 0];
          const k = css.startsWith("color(") ? 255 : 1;
          return [n[0] * k, n[1] * k, n[2] * k, n[3] ?? 1];
        };
        let ground = [255, 255, 255];
        for (let n: HTMLElement | null = el; n; n = n.parentElement) {
          const b = rgba(getComputedStyle(n).backgroundColor);
          if (b[3] >= 0.99) {
            ground = b.slice(0, 3);
            break;
          }
        }
        const flat = (css: string): number[] => {
          const c = rgba(css);
          return [0, 1, 2].map((k) => c[k] * c[3] + ground[k] * (1 - c[3]));
        };
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a: string, b: string) => {
          const [hi, lo] = [lum(flat(a)), lum(flat(b))].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        };
        el.focus();
        // An outline or a shadow that was not there, or a colour that moved
        // by at least 3:1; a faint wash alone is not an indicator.
        return on.some((p, k) => {
          const q = off[k] ?? [];
          const outlined =
            p[0] !== "none" &&
            Number.parseFloat(p[1]) > 0 &&
            rgba(p[2])[3] > 0 &&
            (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]);
          const shadowed = p[3] !== "none" && p[3] !== q[3];
          const moved = [4, 5, 6].some(
            (c) => p[c] !== q[c] && ratio(p[c], q[c]) >= 3,
          );
          return outlined || shadowed || moved;
        });
      });
      if (!differs)
        found.push({ selector: s.sel, detail: "no visible focus indicator" });
    }
  }
  for (let i = 1; i < order.length; i++)
    // Deliberate orders are not reading-order faults:
    // - The map's controls follow the cards (Tab reaches the cards before the
    //   map; e2e/a11y/desktop-keys.spec.ts holds that order), so a jump up
    //   into the map is expected.
    // - A card's resize handle is first in the card but sits on its edge at
    //   mid height, so the step to or from it is a jump by construction.
    // - Canvas cards are columns: from the foot of one card (its docked
    //   action) Tab moves to the card on its right, which starts at the top.
    if (
      // Only a step between two different cards is a column change.
      !(
        order[i].card &&
        order[i - 1].card &&
        order[i].card !== order[i - 1].card
      ) &&
      !order[i].inMap &&
      !order[i].handle &&
      !order[i - 1].handle &&
      (order[i].pane === order[i - 1].pane
        ? order[i].top < order[i - 1].top - 300
        : order[i].vy < order[i - 1].vy - 300)
    )
      found.push({
        selector: order[i].sel,
        detail: `order: jumps up ${Math.round(order[i - 1].pane === order[i].pane ? order[i - 1].top - order[i].top : order[i - 1].vy - order[i].vy)}px after ${order[i - 1].sel}`,
      });
  const missed = await page.evaluate(
    ([ids, seen]) =>
      ids
        .filter((id) => !seen.includes(id))
        .map((id) => {
          const el = document.querySelector(`[data-sweep-id="${id}"]`);
          // The map folds its attribution after it moves; what is hidden by
          // the end of the pass was not a stop the user could have missed.
          if (el && !(el as HTMLElement).getClientRects().length) return "";
          return el
            ? `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28)}"`
            : id;
        })
        .filter(Boolean),
    [all, [...reached]] as const,
  );
  // A cap hit says nothing about what is left; only a finished loop does.
  if (cycled)
    for (const m of missed)
      found.push({
        selector: m,
        detail: `not reached by Tab (${ended} after ${order.length} stops)`,
      });
  return found;
}

export { isDesktop };
