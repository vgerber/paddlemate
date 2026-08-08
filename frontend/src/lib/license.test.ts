import { describe, expect, test } from "bun:test";
import type { GaugeSource } from "./api";
import { licenseLink } from "./license";

const source = (overrides: Partial<GaugeSource> = {}): GaugeSource =>
  ({
    id: "s1",
    name: "Test Hydrographic Service",
    short_name: "THS",
    licensing_terms: null,
    website: null,
    country_code: null,
    license_name: null,
    license_url: null,
    ...overrides,
  }) as GaugeSource;

describe("licenseLink", () => {
  test("names the license and links its text", () => {
    expect(
      licenseLink(
        source({
          license_name: "CC BY 4.0",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
        }),
      ),
    ).toEqual({
      label: "CC BY 4.0",
      href: "https://creativecommons.org/licenses/by/4.0/",
    });
  });

  test("a named license without a URL still shows its name", () => {
    expect(licenseLink(source({ license_name: "NLOD" }))).toEqual({
      label: "NLOD",
      href: null,
    });
  });

  test("no license but a terms page links the terms", () => {
    expect(
      licenseLink(source({ license_url: "https://example.org/terms" })),
    ).toEqual({ label: "Terms", href: "https://example.org/terms" });
  });

  test("falls back to the distributor's own site", () => {
    expect(licenseLink(source({ website: "https://example.org" }))).toEqual({
      label: "Terms",
      href: "https://example.org",
    });
  });

  test("nothing to link renders nothing", () => {
    expect(licenseLink(source())).toBeNull();
  });
});
