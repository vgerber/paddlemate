export interface NavItem {
  to: string;
  label: string;
  /** Whether a path belongs under this item. */
  match: (pathname: string) => boolean;
}

const under = (prefix: string) => (pathname: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const MAP: NavItem = { to: "/", label: "Map", match: (p) => p === "/" };
const LOGS: NavItem = { to: "/logs", label: "Logs", match: under("/logs") };
const TRIPS: NavItem = { to: "/trips", label: "Trips", match: under("/trips") };

/** Proposals are reached from Tools, so both bars keep their Tools or
 * Profile item lit there. */
const toolPaths = ["/tools", "/proposals", "/admin/proposals"].map(under);
const isToolPath = (pathname: string) => toolPaths.some((m) => m(pathname));

/** The desktop top bar. */
export const DESKTOP_NAV: readonly NavItem[] = [
  MAP,
  LOGS,
  TRIPS,
  { to: "/tools", label: "Tools", match: isToolPath },
];

/** The phone bottom bar: Tools and proposals live under Profile. */
export const PHONE_NAV: readonly NavItem[] = [
  MAP,
  LOGS,
  TRIPS,
  {
    to: "/settings",
    label: "Profile",
    match: (p) => under("/settings")(p) || isToolPath(p),
  },
];

/** The `to` of the item a path belongs to, or null. */
export function activeNav(
  items: readonly NavItem[],
  pathname: string,
): string | null {
  return items.find((item) => item.match(pathname))?.to ?? null;
}
