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
      {difficultyChip}
      <WaterLevelChip
        ranges={waterStatus?.ranges}
        loading={waterLoading}
      />
    </ListItemButton>
  );
}
