import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import type { WaterRangeWithStatus } from "@/lib/api";
import { useWaterway } from "@/lib/hooks/useWaterways";
import SuggestFeatureForm from "./SuggestFeatureForm";

interface SuggestFeaturePanelProps {
  waterwayId: number;
  sectionId: number;
  gaugeRanges?: WaterRangeWithStatus[];
  onClose: () => void;
  vertices: { lng: number; lat: number }[];
  geomType: "Point" | "LineString" | "Polygon";
  pickingActive: boolean;
  onStartPick: () => void;
  onStopPick: () => void;
  onRemoveVertex: (i: number) => void;
  onGeomTypeChange: (t: "Point" | "LineString" | "Polygon") => void;
  onDraftClear: () => void;
}

export default function SuggestFeaturePanel({
  waterwayId,
  sectionId,
  gaugeRanges,
  onClose,
  vertices,
  geomType,
  pickingActive,
  onStartPick,
  onStopPick,
  onRemoveVertex,
  onGeomTypeChange,
  onDraftClear,
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

  useEffect(() => {
    setCanSubmit(false);
  }, []);

  function handleClose() {
    onDraftClear();
    onStopPick();
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
          vertices={vertices}
          geomType={geomType}
          pickingActive={pickingActive}
          onRequestPick={onStartPick}
          onStopPick={onStopPick}
          onRemoveVertex={onRemoveVertex}
          onGeomTypeChange={onGeomTypeChange}
          onClearVertices={onDraftClear}
          onSubmitted={onClose}
          submitRef={submitRef}
          onCanSubmitChange={setCanSubmit}
        />
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          pt: 1,
          pb: "calc(8px + env(safe-area-inset-bottom))",
          borderTop: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          gap: 1,
        }}
      >
        <IconButton onClick={handleClose} aria-label="Cancel">
          <CloseIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
            {selectedSection?.name ?? waterway?.name ?? "…"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Suggest new feature
          </Typography>
        </Box>
        <IconButton
          size="large"
          onClick={() => submitRef.current?.()}
          disabled={!canSubmit}
          aria-label="Submit"
          sx={{
            borderRadius: "50%",
            bgcolor: "secondary.main",
            color: "secondary.contrastText",
            "&:hover": { bgcolor: "secondary.light" },
            "&.Mui-disabled": {
              bgcolor: "action.disabledBackground",
              color: "action.disabled",
            },
          }}
        >
          <CheckIcon fontSize="small" />
        </IconButton>
      </Box>
    </>
  );
}
