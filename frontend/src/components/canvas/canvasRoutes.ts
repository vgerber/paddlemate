const GEOGRAPHY_PREFIXES = ["/logs", "/trips", "/proposals"];

/** The log form: a card over the canvas whose scene is the section picker. */
export function isLogFormRoute(
  pathname: string,
  search: Record<string, unknown> = {},
): boolean {
  if (pathname === "/logs/new") return true;
  return /^\/logs\/\d+$/.test(pathname) && isTrue(search.edit);
}

const isTrue = (v: unknown) => v === true || v === "true";

/** Routes whose screen is about places, so on a wide window the map fills it
 * and the content floats over. Everything else (settings, tools, admin, the
 * pickers and wizards with their own maps) keeps its own layout. */
export function isGeographyRoute(pathname: string): boolean {
  if (import.meta.env.DEV && pathname === "/dev/canvas") return true;
  if (pathname === "/") return true;
  return GEOGRAPHY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
