import type { GaugeSource } from "@/lib/api";

export interface LicenseLink {
  label: string;
  href: string | null;
}

/** What to show beside a data source's name.
 *
 * Most providers state no formal license, so there is often nothing to name -
 * then we point at the distributor's own site instead, which is the only
 * terms the reader can actually check. */
export function licenseLink(source: GaugeSource): LicenseLink | null {
  if (source.license_name) {
    return { label: source.license_name, href: source.license_url ?? null };
  }
  if (source.license_url) {
    return { label: "Terms", href: source.license_url };
  }
  if (source.website) return { label: "Terms", href: source.website };
  return null;
}
