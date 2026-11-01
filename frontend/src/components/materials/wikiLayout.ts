import type { Crumb } from "@/components/Breadcrumb";

/** Widest the wiki's pages grow on a desktop, px: the list, an entry, the
 * comparison and the form share one left edge and one card gap. */
export const WIKI_WIDTH = 1440;

/** The trail above a wiki page on a desktop: Tools, the wiki, then the
 * page's own steps (the last one is where the reader is). */
export function wikiPageTrail(
  nav: { onTools: () => void; onWiki: () => void },
  ...steps: Crumb[]
): Crumb[] {
  return [
    { label: "Tools", onClick: nav.onTools },
    { label: "Material wiki", onClick: nav.onWiki },
    ...steps,
  ];
}
