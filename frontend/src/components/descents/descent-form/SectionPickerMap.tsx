import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import WaterwayMap from "@/components/map/Map";
import type { SectionWithFeatures } from "@/lib/api";

interface Props {
  sections: SectionWithFeatures[];
  selectedIds: Set<number>;
  putIn: { lat: number; lon: number } | null;
  takeOut: { lat: number; lon: number } | null;
  onSectionToggle: (section: SectionWithFeatures) => void;
  onPickPutIn: (lat: number, lon: number) => void;
  onPickTakeOut: (lat: number, lon: number) => void;
}

/** Map for toggling sections and picking put-in/take-out points. */
export default function SectionPickerMap({
  sections,
  selectedIds,
  putIn,
  takeOut,
  onSectionToggle,
  onPickPutIn,
  onPickTakeOut,
}: Props) {
  const [labelMode, setLabelMode] = useState<"section" | "river">("section");

  return (
    <Box
      sx={{
        height: 380,
        border: "1px solid",
        borderColor: "divider",
        position: "relative",
      }}
    >
      {sections.length === 0 && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Search a waterway to see its sections
          </Typography>
        </Box>
      )}
      <WaterwayMap
        sections={sections}
        selectedSectionIds={selectedIds}
        labelMode={labelMode}
        onLabelModeChange={setLabelMode}
        onSectionToggle={(id) => {
          const section = sections.find((s) => s.id === id);
          if (section) onSectionToggle(section);
        }}
        putIn={putIn}
        takeOut={takeOut}
        onPickPutIn={onPickPutIn}
        onPickTakeOut={onPickTakeOut}
      />
    </Box>
  );
}
