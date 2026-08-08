// Authenticated end-to-end test of drawing a feature geometry on the map:
// open suggest-feature, pick the Line tool, place two vertices by clicking
// the map, and assert the draft renders. Run login.ts first to establish a
// session. Exits non-zero on any failed check.
import { connect } from "./cdp";

const APP = "http://localhost:5173";
const p = await connect();

const results: string[] = [];
const failures: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

// A maplibre click comes through the canvas' own event system; synthetic
// Input.dispatchMouseEvent does not reach it in this headless setup, but a
// real DOM MouseEvent does (same path section-selection uses).
const mapClick = (x: number, y: number) =>
  p.evaluate(`(() => {
    const c = document.querySelector('.maplibregl-canvas');
    const o = { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, button: 0, buttons: 1, view: window };
    c.dispatchEvent(new MouseEvent('mousedown', o));
    c.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
    c.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
    return true;
  })()`);

// Click the innermost element matching a pattern, walking up to a handler.
const clickText = (pattern: string) =>
  p.evaluate(`(() => {
    const leaf = [...document.querySelectorAll("button, [role=menuitem], [role=button], span, div")]
      .filter(e => e.children.length === 0 && ${pattern}.test((e.textContent || "").trim()))[0];
    if (!leaf) return "not found";
    let el = leaf;
    for (let i = 0; i < 6 && el; i++) { el.click(); el = el.parentElement; }
    return true;
  })()`);

await p.goto(`${APP}/?waterway=9001&section=9102`, 9000);

const signedIn = await p.evaluate(
  `!!Object.keys(localStorage).find(k => k.startsWith("oidc.user:"))`,
);
check("a signed-in session exists (run login.ts first)", signedIn === true);
if (!signedIn) {
  console.log(results.join("\n"));
  process.exit(1);
}

// Open the speed dial. MUI's SpeedDial needs the full pointer sequence, not
// a bare .click(), to toggle open.
await p.evaluate(`(() => {
  const fab = document.querySelector('.MuiSpeedDial-fab');
  if (!fab) return false;
  const r = fab.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window };
  fab.dispatchEvent(new PointerEvent('pointerdown', o));
  fab.dispatchEvent(new MouseEvent('mousedown', o));
  fab.dispatchEvent(new PointerEvent('pointerup', o));
  fab.dispatchEvent(new MouseEvent('mouseup', o));
  fab.dispatchEvent(new MouseEvent('click', o));
  return true;
})()`);
await p.sleep(800);
await p.evaluate(
  `[...document.querySelectorAll('.MuiSpeedDialAction-fab')].find(e => (e.getAttribute('aria-label') || e.getAttribute('title')) === 'Add feature')?.click(); true`,
);
await p.sleep(2500);

// Both the desktop sidebar and the mobile overlay mount the picker; only one
// is visible. Click the visible copy by filtering on offsetParent.
const clickVisible = (selector: string, text: string) =>
  p.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter(e => e.offsetParent !== null)
      .find(e => (e.textContent || "").trim() === ${JSON.stringify(text)});
    if (!el) return "not found";
    el.click();
    return true;
  })()`);

const toggleCount = await p.evaluate(
  `[...document.querySelectorAll(".MuiToggleButton-root")].filter(e => e.textContent.trim() === "Line").length`,
);
check(
  "suggest-feature panel with the geometry picker opened",
  Number(toggleCount) >= 1,
);

// Choose the Line tool, then arm placement.
check("selected the Line geometry tool", (await clickVisible(".MuiToggleButton-root", "Line")) === true);
await p.sleep(600);
check("armed map placement", (await clickVisible("button", "Start drawing")) === true);
await p.sleep(1500);

// Place three vertices along the visible section line.
for (const [x, y] of [
  [900, 300],
  [880, 360],
  [850, 430],
]) {
  await mapClick(x, y);
  await p.sleep(900);
}

// The draft renders as numbered markers (map/MapNumberMarker) plus the
// feature-draft line source; count the markers as the user-visible proof.
const markerCount = await p.evaluate(`(() => {
  return [...document.querySelectorAll(".maplibregl-marker")]
    .filter(m => /^[0-9]+$/.test((m.textContent || "").trim())).length;
})()`);
check(
  "placed vertices render as numbered markers on the map",
  Number(markerCount) >= 2,
  `${markerCount} markers`,
);
await p.shot("draw-feature.png");

console.log(results.join("\n"));
console.log(failures.length ? `\nFAILURES: ${failures.join("; ")}` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
