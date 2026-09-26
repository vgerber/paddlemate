import Box from "@mui/material/Box";
import { useEffect, useMemo, useState } from "react";
import LocationPin, {
  PUT_IN_COLOR,
  TAKE_OUT_COLOR,
} from "@/components/map/LocationPin";
import SectionAdder from "@/components/search/SectionAdder";
import type { SectionWithFeatures } from "@/lib/api";
import { toPseudoSection } from "@/lib/descents";
import { useWaterway } from "@/lib/hooks/useWaterways";
import {
  coordsFromStrings,
  makeDraft,
  type SectionDraft,
  type SectionLocation,
  type StepProps,
} from "./model";
import SectionDraftList from "./SectionDraftList";
import SectionPickerMap from "./SectionPickerMap";

interface Props extends StepProps {
  initialWaterwayId?: number | null;
}

/** Step 2: waterway search, section picking on the map, section order,
 * put-in/take-out points. */
export default function StepSections({
  form,
  onChange,
  initialWaterwayId = null,
}: Props) {
  const [selectedWaterwayId, setSelectedWaterwayId] = useState<number | null>(
    initialWaterwayId,
  );
  const { data: selectedWaterway } = useWaterway(selectedWaterwayId);

  const mapSections = useMemo<SectionWithFeatures[]>(
    () => selectedWaterway?.sections ?? [],
    [selectedWaterway],
  );
  const selectedIds = new Set(form.sections.map((s) => s.section_id));

  // Auto-derive put-in/take-out from section geometry whenever sections change
  const sectionIds = form.sections.map((s) => s.section_id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: sectionIds is a stable derived key; onChange and form.sections are intentionally omitted to avoid infinite loops
  useEffect(() => {
    const withLoc = form.sections.filter(
      (s) => s.location?.type === "LineString",
    );
    if (withLoc.length === 0) return;
    const first = withLoc[0];
    const last = withLoc[withLoc.length - 1];
    const putInCoords = (first.location as SectionLocation).coordinates[0];
    const takeOutCoords = (last.location as SectionLocation).coordinates[
      (last.location as SectionLocation).coordinates.length - 1
    ];
    onChange({
      put_in_lon: putInCoords[0].toFixed(6),
      put_in_lat: putInCoords[1].toFixed(6),
      take_out_lon: takeOutCoords[0].toFixed(6),
      take_out_lat: takeOutCoords[1].toFixed(6),
    });
  }, [sectionIds]);

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
  const sectionsForMap =
    mapSections.length > 0 ? mapSections : formSectionsForMap;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <SectionAdder
        waterwayId={selectedWaterwayId}
        onWaterwayChange={setSelectedWaterwayId}
        sections={mapSections}
        addedIds={selectedIds}
        onAdd={addSection}
      >
        <SectionPickerMap
          sections={sectionsForMap}
          selectedIds={selectedIds}
          putIn={coordsFromStrings(form.put_in_lat, form.put_in_lon)}
          takeOut={coordsFromStrings(form.take_out_lat, form.take_out_lon)}
          onSectionToggle={toggleSection}
          onPickPutIn={(lat, lon) =>
            onChange({ put_in_lat: lat.toFixed(6), put_in_lon: lon.toFixed(6) })
          }
          onPickTakeOut={(lat, lon) =>
            onChange({
              take_out_lat: lat.toFixed(6),
              take_out_lon: lon.toFixed(6),
            })
          }
        />
      </SectionAdder>

      <SectionDraftList
        sections={form.sections}
        onChange={(sections) => onChange({ sections })}
      />

      <Box sx={{ display: "flex", gap: 1.5 }}>
        <LocationPin
          num={1}
          color={PUT_IN_COLOR}
          title="PUT-IN"
          coords={coordsFromStrings(form.put_in_lat, form.put_in_lon)}
          label={form.put_in_label}
          onClear={() =>
            onChange({ put_in_lat: "", put_in_lon: "", put_in_label: "" })
          }
          onLabelChange={(v) => onChange({ put_in_label: v })}
        />
        <LocationPin
          num={2}
          color={TAKE_OUT_COLOR}
          title="TAKE-OUT"
          coords={coordsFromStrings(form.take_out_lat, form.take_out_lon)}
          label={form.take_out_label}
          onClear={() =>
            onChange({ take_out_lat: "", take_out_lon: "", take_out_label: "" })
          }
          onLabelChange={(v) => onChange({ take_out_label: v })}
        />
      </Box>
    </Box>
  );
}
