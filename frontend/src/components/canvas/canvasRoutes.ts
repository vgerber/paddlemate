const GEOGRAPHY_PREFIXES = ["/logs", "/trips", "/proposals"];

/** The log form has its own picker map, so the canvas map steps aside for it
 * and only one map draws. */
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
export function isGeographyRoute(
  pathname: string,
  search: Record<string, unknown> = {},
): boolean {
  if (import.meta.env.DEV && pathname === "/dev/canvas") return true;
  if (isLogFormRoute(pathname, search)) return false;
  if (pathname === "/") return true;
  return GEOGRAPHY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
