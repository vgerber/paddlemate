import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { listRowSx } from "@/components/canvas/flatRow";
import WaterLevelChip from "@/components/WaterLevelChip";
import GradeTag from "@/components/waterway/GradeTag";
import { sectionGradeText } from "@/components/waterway/section-details/grade";
import type { SectionWithFeatures } from "@/lib/api";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface SearchSectionRowProps {
  section: SectionWithFeatures;
  /** The river it belongs to, under the name. */
  riverName: string;
  selected: boolean;
  onClick: (sectionId: number) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (sectionId: number) => void;
  /** Rapid whose name matched the search, shown under the river. */
  matchedFeature?: string;
}

/** A search result as the design draws it: the section's name over its river
 * and grade, the level pill at the right spanning both lines. */
export default function SearchSectionRow({
  section,
  riverName,
  selected,
  onClick,
  isFavorite,
  onToggleFavorite,
  matchedFeature,
}: SearchSectionRowProps) {
  const grade = sectionGradeText(section);
  return (
    <ListItemButton
      data-testid="search-section-row"
      selected={selected}
      onClick={() => onClick(section.id)}
      sx={{
        ...listRowSx,
        minHeight: 64,
        display: "grid",
        gridTemplateColumns: onToggleFavorite
          ? `minmax(0, 1fr) auto ${tokens.touch.min}px`
          : "minmax(0, 1fr) auto",
        columnGap: 1.25,
        rowGap: 0.25,
        alignItems: "center",
      }}
    >
      <Typography variant="body1" noWrap sx={{ fontWeight: 500 }}>
        {localizedName(section.name, section.names)}
      </Typography>
      <Box sx={{ gridRow: "1 / 3", gridColumn: 2, justifySelf: "end" }}>
        <WaterLevelChip
          waterwayId={section.waterway_id}
          sectionId={section.id}
        />
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minWidth: 0,
          gridColumn: 1,
        }}
      >
        <Typography
          variant="body2"
          color="textSecondary"
          noWrap
          sx={{ minWidth: 0 }}
        >
          {riverName}
        </Typography>
        {grade && <GradeTag grade={grade} />}
      </Box>
      {matchedFeature && (
        <Typography
          variant="caption"
          color="textDisabled"
          noWrap
          sx={{ gridColumn: 1 }}
        >
          {`Rapid: ${matchedFeature}`}
        </Typography>
      )}
      {onToggleFavorite && (
        <IconButton
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(section.id);
          }}
          sx={{
            gridRow: "1 / 3",
            gridColumn: 3,
            width: tokens.touch.min,
            height: tokens.touch.min,
          }}
        >
          {isFavorite ? (
            <StarIcon fontSize="small" sx={{ color: tokens.tertiary }} />
          ) : (
            <StarBorderIcon fontSize="small" />
          )}
        </IconButton>
      )}
    </ListItemButton>
  );
}
