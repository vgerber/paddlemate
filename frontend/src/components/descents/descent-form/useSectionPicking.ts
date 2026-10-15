import { useMemo, useState } from "react";
import type { SectionWithFeatures } from "@/lib/api";
import { toPseudoSection } from "@/lib/descents";
import type { LngLat } from "@/lib/geo";
import { useWaterway } from "@/lib/hooks/useWaterways";
import {
  coordsFromStrings,
  type LogForm,
  makeDraft,
  type SectionDraft,
  type SectionLocation,
} from "./model";

/** What the sections step and the picker map share: the waterway being
 * browsed, the sections picked from it, and the put-in and take-out. Held
 * by the form so the map can sit beside the steps on a wide screen. */
export function useSectionPicking(
  form: LogForm,
  onChange: (update: Partial<LogForm>) => void,
  initialWaterwayId: number | null = null,
) {
  const [selectedWaterwayId, setSelectedWaterwayId] = useState<number | null>(
    initialWaterwayId,
  );
  const { data: selectedWaterway } = useWaterway(selectedWaterwayId);

  const mapSections = useMemo<SectionWithFeatures[]>(
    () => selectedWaterway?.sections ?? [],
    [selectedWaterway],
  );
  const selectedIds = new Set(form.sections.map((s) => s.section_id));

  function addSection(section: SectionWithFeatures) {
    if (selectedIds.has(section.id)) return;
    onChange({
      sections: [
        ...form.sections,
        makeDraft(section, form.sections.length + 1),
      ],
    });
  }

  function toggleSection(section: SectionWithFeatures) {
    if (selectedIds.has(section.id)) {
      onChange({
        sections: form.sections.filter((s) => s.section_id !== section.id),
      });
    } else {
      addSection(section);
    }
  }

  // Edited descents carry section geometry in the form itself; fall back to
  // that when no waterway is loaded so the map still shows the route.
  const formSectionsForMap = useMemo(
    () =>
      form.sections
        .filter(
          (s): s is SectionDraft & { location: SectionLocation } =>
            !!s.location,
        )
        .map((s) =>
          toPseudoSection({
            id: s.section_id,
            name: s.display_name,
            location: s.location as SectionWithFeatures["location"],
          }),
        ),
    [form.sections],
  );

  return {
    selectedWaterwayId,
    setSelectedWaterwayId,
    mapSections,
    selectedIds,
    addSection,
    toggleSection,
    sectionsForMap: mapSections.length > 0 ? mapSections : formSectionsForMap,
    putIn: coordsFromStrings(form.put_in_lat, form.put_in_lon),
    takeOut: coordsFromStrings(form.take_out_lat, form.take_out_lon),
    pickPutIn: ([lon, lat]: LngLat) =>
      onChange({ put_in_lat: lat.toFixed(6), put_in_lon: lon.toFixed(6) }),
    pickTakeOut: ([lon, lat]: LngLat) =>
      onChange({ take_out_lat: lat.toFixed(6), take_out_lon: lon.toFixed(6) }),
  };
}

export type SectionPicking = ReturnType<typeof useSectionPicking>;
