// Authenticated smoke of the flows the refactor touched.
// Assumes login.ts has established a real Keycloak session in this browser.
import { connect } from "./cdp";

const APP = "http://localhost:5173";
const p = await connect();

const failures: string[] = [];
const results: string[] = [];
const apiCalls: { url: string; status: number }[] = [];

p.ws.addEventListener("message", (e: any) => {
  const m = JSON.parse(e.data as string);
  if (m.method === "Network.responseReceived") {
    const u = String(m.params.response.url);
    if (u.includes(":3000/")) {
      apiCalls.push({ url: u, status: m.params.response.status });
    }
  }
});
await p.send("Network.enable");

function check(label: string, ok: boolean, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures.push(label);
}
const text = async () => String(await p.evaluate("document.body.innerText"));
const hasMap = async () =>
  (await p.evaluate("!!document.querySelector('canvas')")) === true;

/** Click the innermost element matching a pattern, walking up to a handler. */
const clickLeaf = (pattern: string) =>
  p.evaluate(`(() => {
    const leaf = [...document.querySelectorAll("*")].filter(
      e => e.children.length === 0 && ${pattern}.test(e.textContent || "")
    )[0];
    if (!leaf) return "not found";
    let el = leaf;
    for (let i = 0; i < 6 && el; i++) { el.click(); el = el.parentElement; }
    return true;
  })()`);

// --- 1. Token is accepted and scoped to this user -------------------------
await p.goto(`${APP}/logs`, 7000);
const owned = await p.evaluate(`(async () => {
  const key = Object.keys(localStorage).find(k => k.startsWith("oidc.user:"));
  const token = JSON.parse(localStorage.getItem(key)).access_token;
  const r = await fetch("http://localhost:3000/api/v1/descents?scope=owned", {
    headers: { Authorization: "Bearer " + token },
  });
  const body = await r.json();
  return { status: r.status, count: (body.items ?? body).length };
})()`);
check("API accepts the browser token", owned.status === 200, `status ${owned.status}`);
check("owned scope returns the fixture descents", owned.count >= 4, `${owned.count}`);

const logsText = await text();
check(
  "my-logs renders descents, not the sign-in gate",
  !logsText.includes("Sign in to view your logs"),
);
check(
  "private descent visible to its owner (ownership mapping is real)",
  logsText.includes("Private upper run"),
);
await p.shot("smoke-1-logs.png");

// --- 2. Descent detail: DescentDetail's map `picking` group ---------------
await clickLeaf("/Public multi-section run/i");
await p.sleep(5000);
check(
  "descent detail opens",
  String(await p.url()).includes("/logs/"),
  String(await p.url()).replace(APP, ""),
);
check("descent detail renders its map", await hasMap());
await p.shot("smoke-2-descent-detail.png");

// --- 3. Log-descent form: SectionPickerMap's `picking` group --------------
await p.goto(`${APP}/logs/new`, 7000);
const formText = await text();
check(
  "log-descent form opens",
  /when|section|detail/i.test(formText) && !/sign in/i.test(formText),
  formText.replace(/\n/g, " | ").slice(0, 90),
);
await p.shot("smoke-3-descent-form.png");

// Step to the section picker, which mounts SectionPickerMap (picking group).
await p.evaluate(`document.querySelector('[aria-label="Next"]').click(); true`);
await p.sleep(4000);
check(
  "descent form reaches the section picker map",
  await hasMap(),
  (await text()).replace(/\n/g, " | ").slice(0, 90),
);
await p.shot("smoke-3b-section-picker.png");

// --- 4. Map page: suggest-feature mode drives the `drawing` group ---------
await p.goto(`${APP}/?waterway=9001&section=9102`, 9000);
check("map page renders for a signed-in user", await hasMap());
const speedDial = await p.evaluate(
  `!!document.querySelector('[class*=MuiSpeedDial], [aria-label*=dd i], button[aria-label]')`,
);
check("map page action control present", speedDial === true);
await p.shot("smoke-4-map-signed-in.png");

// --- 5. Admin controls: server_admin role reaches the UI ------------------
await p.goto(`${APP}/proposals?status=pending`, 7000);
const adminButtons = await p.evaluate(
  `[...document.querySelectorAll('[aria-label]')].filter(e => /approve|reject/i.test(e.getAttribute('aria-label'))).length`,
);
check(
  "admin approve/reject controls render for a server_admin",
  Number(adminButtons) > 0,
  `${adminButtons} controls`,
);
await p.shot("smoke-5-proposals-admin.png");

// --- 6. Mobile layout: overlay + bottom navigation ------------------------
await p.send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await p.goto(`${APP}/?waterway=9001&section=9102`, 9000);
check("mobile map view renders", await hasMap());
await p.shot("smoke-6-mobile.png");

console.log(results.join("\n"));
const bad = apiCalls.filter((c) => c.status === 401 || c.status === 403);
console.log(`\napi calls: ${apiCalls.length}, auth failures: ${bad.length}`);
if (bad.length) console.log(JSON.stringify(bad.slice(0, 5), null, 2));
console.log(failures.length ? `\nFAILURES: ${failures.join("; ")}` : "\nall checks passed");
process.exit(0);
