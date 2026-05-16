import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import type { SectionWithFeatures } from "@/lib/api";
import { useWaterStatus } from "@/lib/hooks/useWaterways";
import WaterLevelChip from "./WaterLevelChip";

interface SectionListItemProps {
  section: SectionWithFeatures;
  waterwayId: number;
  selected: boolean;
  onClick: (sectionId: number) => void;
}

export default function SectionListItem({
  section,
  waterwayId,
  selected,
  onClick,
}: SectionListItemProps) {
  const { data: waterStatus, isLoading: waterLoading } = useWaterStatus(
    waterwayId,
    section.id,
  );

  const difficultyChip = (() => {
    const ww = section.features?.find((f) => f.feature_type === "whitewater");
    const meta = ww?.metadata as Record<string, unknown> | null | undefined;
    const diff = meta?.difficulty as string | undefined;
    return diff ? <Chip label={diff} size="small" sx={{ ml: 0.5 }} /> : null;
  })();

  const isRivermap = section.features?.some(
    (f) => f.created_by === "rivermap-import",
  );

  return (
    <ListItemButton
      selected={selected}
      onClick={() => onClick(section.id)}
      sx={{ borderRadius: 1, py: 0.5 }}
    >
      <ListItemText
        primary={section.name}
        secondary={
          [section.region, section.country].filter(Boolean).join(", ") ||
          undefined
        }
        slotProps={{
          primary: { variant: "body2" },
          secondary: { variant: "caption" },
        }}
      />
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.25 }}>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {difficultyChip}
          <WaterLevelChip
            ranges={waterStatus?.ranges}
            loading={waterLoading}
          />
        </Box>
        {isRivermap && (
          <Chip
            label="rivermap"
            size="small"
            variant="outlined"
            sx={{ fontSize: "0.6rem", height: 16, borderColor: "rgba(0,0,0,0.2)", color: "text.secondary" }}
          />
        )}
      </Box>
    </ListItemButton>
  );
}
