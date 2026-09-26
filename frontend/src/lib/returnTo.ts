/**
 * Where to go back to after signing in: the page the person started from, so
 * opening an invite link and signing up lands them back on the invite rather
 * than on the map.
 *
 * The value travels through the identity provider and back, so it is treated
 * as untrusted. Only a path on this site is accepted, never a URL: "//evil"
 * and "/\\evil" both read as another host to a browser, and following them
 * would make sign-in an open redirect.
 */
export function safeReturnTo(state: unknown): string | null {
  if (typeof state !== "object" || state === null || !("returnTo" in state)) {
    return null;
  }
  const to = state.returnTo;
  if (typeof to !== "string" || !to.startsWith("/")) return null;
  if (to.startsWith("//") || to.includes("\\")) return null;
  // The callback itself is no place to come back to.
  if (to.startsWith("/auth/")) return null;
  return to;
}

/** The state to send along with a sign-in started from this page. */
export function returnState(location: { pathname: string; search: string }) {
  return { returnTo: `${location.pathname}${location.search}` };
}
