import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SectionListItem from "@/components/SectionListItem";
import { useWaterway } from "@/lib/hooks/useWaterways";

interface WaterwayDetailPanelProps {
  waterwayId: number;
  selectedSectionId: number | undefined;
  onBack: () => void;
  onSectionClick: (sectionId: number) => void;
}

export default function WaterwayDetailPanel({
  waterwayId,
  selectedSectionId,
  onBack,
  onSectionClick,
}: WaterwayDetailPanelProps) {
  const { data: waterway, isLoading } = useWaterway(waterwayId);
  const sections = waterway?.sections ?? [];

  return (
    <>
      <Box
        sx={{
          px: 1.5,
          pt: 1.5,
          pb: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <IconButton size="small" onClick={onBack} aria-label="Back to rivers">
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
            {waterway?.name ?? "…"}
          </Typography>
          {waterway && (
            <Typography variant="caption" color="text.secondary">
              {waterway.waterway_type}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : sections.length === 0 ? (
          <Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
            No sections found.
          </Typography>
        ) : (
          <List dense disablePadding>
            {sections.map((section) => (
              <SectionListItem
                key={section.id}
                section={section}
                waterwayId={waterwayId}
                selected={section.id === selectedSectionId}
                onClick={onSectionClick}
              />
            ))}
          </List>
        )}
      </Box>
    </>
  );
}
