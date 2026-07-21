import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import WaterLevelChip from "@/components/WaterLevelChip";
import type { SectionWithFeatures } from "@/lib/api";
import { localizedName } from "@/lib/localization";

interface SectionListItemProps {
  section: SectionWithFeatures;
  waterwayId: number;
  selected: boolean;
  onClick: (sectionId: number) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (sectionId: number) => void;
  descentCount?: number;
}

export default function SectionListItem({
  section,
  waterwayId,
  selected,
  onClick,
  isFavorite,
  onToggleFavorite,
  descentCount,
}: SectionListItemProps) {
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
        primary={localizedName(section.name, section.names)}
        secondary={
          [section.region, section.country].filter(Boolean).join(", ") ||
          undefined
        }
        slotProps={{
          primary: { variant: "body2" },
          secondary: { variant: "caption" },
        }}
      />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 0.25,
        }}
      >
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {descentCount != null && descentCount > 0 && (
            <Chip
              icon={<DirectionsBoatOutlinedIcon sx={{ fontSize: 12 }} />}
              label={descentCount}
              size="small"
              variant="outlined"
              title={`Paddled ${descentCount} ${descentCount === 1 ? "time" : "times"}`}
              sx={{ ml: 0.5, color: "text.secondary" }}
            />
          )}
          {difficultyChip}
          <WaterLevelChip waterwayId={waterwayId} sectionId={section.id} />
          {onToggleFavorite && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(section.id);
              }}
              sx={{ p: 0.25 }}
            >
              {isFavorite ? (
                <StarIcon fontSize="small" sx={{ color: "warning.main" }} />
              ) : (
                <StarBorderIcon fontSize="small" />
              )}
            </IconButton>
          )}
        </Box>
        {isRivermap && (
          <Chip
            label="rivermap"
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.6rem",
              height: 16,
              borderColor: "rgba(0,0,0,0.2)",
              color: "text.secondary",
            }}
          />
        )}
      </Box>
    </ListItemButton>
  );
}
