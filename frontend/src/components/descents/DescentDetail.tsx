import { useMemo } from "react";
import type { Descent, SectionWithFeatures } from "@/lib/api";
import { toPseudoSection } from "@/lib/descents";
import DescentCanvasDetail from "./DescentCanvasDetail";
import DescentPhoneDetail from "./DescentPhoneDetail";

/** Full view of one descent: facts, the sections in paddled order with their
 * notes and the water levels captured when it was logged. A phone shows its
 * own route map; on the canvas the host map already draws it. */
export default function DescentDetail({
  descent,
  onCanvas = false,
}: {
  descent: Descent;
  /** The canvas map draws this log, so the card leaves the route out. */
  onCanvas?: boolean;
}) {
  const sections = useMemo(
    () => [...descent.sections].sort((a, b) => a.sort_order - b.sort_order),
    [descent.sections],
  );

  // The section lines travel with the descent, so the route renders without
  // fetching each waterway.
  const mapSections = useMemo(
    () =>
      sections
        .filter(
          (s): s is typeof s & { location: SectionWithFeatures["location"] } =>
            s.location?.type === "LineString",
        )
        .map((s) =>
          toPseudoSection({
            id: s.section_id,
            name: s.section_name ?? `Section #${s.section_id}`,
            location: s.location,
          }),
        ),
    [sections],
  );

  if (onCanvas) {
    return <DescentCanvasDetail descent={descent} sections={sections} />;
  }
  return (
    <DescentPhoneDetail
      descent={descent}
      sections={sections}
      mapSections={mapSections}
    />
  );
}
