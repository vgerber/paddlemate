import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect } from "react";
import LocationPin, {
  PUT_IN_COLOR,
  TAKE_OUT_COLOR,
} from "@/components/map/LocationPin";
import SectionAdder from "@/components/search/SectionAdder";
import { endpointName } from "@/lib/descents";
import type { SectionLocation, StepProps } from "./model";
import SectionDraftList from "./SectionDraftList";
import SectionPickerMap from "./SectionPickerMap";
import type { SectionPicking } from "./useSectionPicking";

interface Props extends StepProps {
  picking: SectionPicking;
  /** The map is drawn beside the steps instead of inside this one. */
  mapBeside?: boolean;
}

/** Step 2: waterway search, section picking on the map, section order,
 * put-in/take-out points. */
export default function StepSections({
  form,
  onChange,
  picking,
  mapBeside,
}: Props) {
  const {
    selectedWaterwayId,
    setSelectedWaterwayId,
    mapSections,
    selectedIds,
    addSection,
    putIn,
    takeOut,
  } = picking;

  const pickedIds = form.sections.map((s) => s.section_id);

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

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Typography variant="body2" color="textSecondary">
        Pick the river, then the sections you ran.
      </Typography>
      <SectionAdder
        waterwayId={selectedWaterwayId}
        onWaterwayChange={setSelectedWaterwayId}
        sections={mapSections}
        addedIds={selectedIds}
        onAdd={addSection}
      >
        <Box
          data-testid="sections-map-block"
          sx={{
            // SectionAdder puts the search first; the map and the picked
            // list lead and the search follows them.
            order: -1,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {!mapBeside && <SectionPickerMap picking={picking} />}
          <SectionDraftList
            sections={form.sections}
            onChange={(sections) => onChange({ sections })}
          />
          {(form.sections.length > 0 || putIn || takeOut) && (
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <LocationPin
                num={1}
                color={PUT_IN_COLOR}
                title="Put in"
                coords={putIn}
                place={endpointName(pickedIds, mapSections, "put_in")}
                onClear={() =>
                  onChange({ put_in_lat: "", put_in_lon: "", put_in_label: "" })
                }
              />
              <LocationPin
                num={2}
                color={TAKE_OUT_COLOR}
                title="Take out"
                coords={takeOut}
                place={endpointName(pickedIds, mapSections, "take_out")}
                onClear={() =>
                  onChange({
                    take_out_lat: "",
                    take_out_lon: "",
                    take_out_label: "",
                  })
                }
              />
            </Box>
          )}
        </Box>
      </SectionAdder>
    </Box>
  );
}
