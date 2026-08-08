// Signs in through the real Keycloak authorization-code + PKCE flow:
// app -> "Sign in" -> Keycloak login form -> callback -> app.
// Nothing is written to storage by hand; the session is whatever the
// identity server issued.
import { connect } from "./cdp";

const APP = "http://localhost:5173";
const USER = process.env.KC_USER ?? "vincent";
const PASS = process.env.KC_PASS ?? "paddle";

const p = await connect();

// Start from a clean slate so every run exercises the full form login:
// browser cookies carry Keycloak's SSO session, which would otherwise let
// the authorization endpoint issue a code without showing the form.
await p.send("Network.enable");
await p.send("Network.clearBrowserCookies");
await p.goto(`${APP}/`, 5000);
await p.evaluate("localStorage.clear(); sessionStorage.clear(); true");
await p.goto(`${APP}/`, 6000);

const clicked = await p.clickText("button, a", "sign in");
if (!clicked) throw new Error("no sign-in control found on the map page");
await p.sleep(4000);

const onKeycloak = String(await p.url()).includes("localhost:8080");
console.log("redirected to identity server:", onKeycloak);
if (!onKeycloak) throw new Error("expected a redirect to the identity server");

await p.shot("auth-1-keycloak.png");

// Fill Keycloak's own login form.
const filled = await p.evaluate(`(() => {
  const u = document.querySelector("#username");
  const pw = document.querySelector("#password");
  const form = document.querySelector("#kc-form-login");
  if (!u || !pw || !form) return false;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(u, ${JSON.stringify(USER)});
  u.dispatchEvent(new Event("input", { bubbles: true }));
  set.call(pw, ${JSON.stringify(PASS)});
  pw.dispatchEvent(new Event("input", { bubbles: true }));
  form.submit();
  return true;
})()`);
if (!filled) throw new Error("keycloak login form not found");

// The callback exchanges the code for tokens, then redirects into the app.
for (let i = 0; i < 20 && String(await p.url()).includes("/auth/callback"); i++) {
  await p.sleep(1000);
}
await p.sleep(2000);
console.log("after login:", await p.url());
console.log(
  "callback text:",
  String(await p.evaluate("document.body.innerText.slice(0,200)")).replace(/\n/g, " | "),
);

const session = await p.evaluate(`(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith("oidc.user:"));
  if (!key) return { signedIn: false };
  const u = JSON.parse(localStorage.getItem(key));
  const claims = JSON.parse(atob(u.access_token.split(".")[1]));
  return {
    signedIn: true,
    sub: claims.sub,
    username: claims.preferred_username,
    audience: claims.aud,
    roles: (claims.realm_access && claims.realm_access.roles) || [],
    issuer: claims.iss,
    expiresInSec: claims.exp - Math.floor(Date.now() / 1000),
    tokenIsJwtWithSignature: u.access_token.split(".").length === 3,
  };
})()`);

console.log("session:", JSON.stringify(session, null, 2));
await p.shot("auth-2-signed-in.png");
process.exit(0);
