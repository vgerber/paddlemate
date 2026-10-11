const GEOGRAPHY_PREFIXES = ["/logs", "/trips", "/proposals"];

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
