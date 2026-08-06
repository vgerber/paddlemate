import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import { useRef, useState } from "react";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import type { Feature, WaterRangeWithStatus } from "@/lib/api";
import { useWaterway } from "@/lib/hooks/useWaterways";
import type { GeometryPicking } from "./GeometryPicker";
import SuggestFeatureForm from "./SuggestFeatureForm";

interface SuggestFeaturePanelProps {
  waterwayId: number;
  sectionId: number;
  gaugeRanges?: WaterRangeWithStatus[];
  onClose: () => void;
  geometry: GeometryPicking;
  /** Edit mode: the form is prefilled and submits an update proposal. */
  editFeature?: Feature | null;
}

export default function SuggestFeaturePanel({
  waterwayId,
  sectionId,
  gaugeRanges,
  onClose,
  geometry,
  editFeature,
}: SuggestFeaturePanelProps) {
  const { data: waterway } = useWaterway(waterwayId);
  const sections = waterway?.sections ?? [];

  const selectedSection = sections.find((s) => s.id === sectionId);
  const sectionLine = (() => {
    const geom = selectedSection?.location as unknown as
      | GeoJSON.LineString
      | undefined;
    return geom?.type === "LineString"
      ? geom.coordinates.map(([lng, lat]) => ({ lng, lat }))
      : undefined;
  })();

  const submitRef = useRef<(() => void) | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  function handleClose() {
    geometry.onClearVertices();
    geometry.onStopPick();
    onClose();
  }

  return (
    <>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          borderTop: "3px solid",
          borderColor: "divider",
          paddingTop: 2,
        }}
      >
        <SuggestFeatureForm
          key={editFeature?.id ?? "new"}
          editFeature={editFeature}
          waterwayId={waterwayId}
          sectionId={sectionId}
          sectionLine={sectionLine}
          nearPoint={
            sectionLine
              ? {
                  lat: sectionLine[Math.floor(sectionLine.length / 2)].lat,
                  lon: sectionLine[Math.floor(sectionLine.length / 2)].lng,
                }
              : undefined
          }
          gaugeRanges={gaugeRanges}
          geometry={geometry}
          onSubmitted={onClose}
          submitRef={submitRef}
          onCanSubmitChange={setCanSubmit}
        />
      </Box>
      <PanelBottomBar
        leftIcon={<CloseIcon />}
        onLeftClick={handleClose}
        leftLabel="Cancel"
        title={selectedSection?.name ?? waterway?.name ?? "…"}
        subtitle={editFeature ? "Edit feature" : "Suggest new feature"}
        action={
          <RoundActionButton
            onClick={() => submitRef.current?.()}
            disabled={!canSubmit}
            ariaLabel="Submit"
          >
            <CheckIcon fontSize="small" />
          </RoundActionButton>
        }
      />
    </>
  );
}
