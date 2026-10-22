import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { cardRowSx, desktopFlatRow } from "@/components/canvas/flatRow";
import WaterLevelChip from "@/components/WaterLevelChip";
import type { SectionWithFeatures } from "@/lib/api";
import { plural, sectionPlace } from "@/lib/format";
import { LogIcon, StarIcon, StarOutlineIcon } from "@/lib/icons";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";
import GradeTag from "./GradeTag";
import { sectionGradeText } from "./section-details/grade";

const { tokens } = theme;

/** Below this list width the row stacks (name on top, count and grade
 * beneath, the pill at the right). Text at 130% stacks sooner on its own,
 * because the name column is what shrinks. */
const STACK_BELOW = 330;

interface SectionListItemProps {
  section: SectionWithFeatures;
  waterwayId: number;
  selected: boolean;
  onClick: (sectionId: number) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (sectionId: number) => void;
  descentCount?: number;
  /** Rapid whose name matched the search, shown under the location so the
   * reader can see why this section is in the results. */
  matchedFeature?: string;
  /** The river it belongs to. Worth showing where a list mixes rivers - a
   * trip's watch list - and redundant inside one waterway's own section
   * list, which is why it is the caller's call. */
  riverName?: string;
}

export default function SectionListItem({
  section,
  waterwayId,
  selected,
  onClick,
  isFavorite,
  onToggleFavorite,
  descentCount,
  matchedFeature,
  riverName,
}: SectionListItemProps) {
  const grade = sectionGradeText(section);

  // Only a list that mixes rivers names the place (river first: it tells two
  // "Upper" runs apart). Inside one river's own list the row is just a name.
  const place = riverName
    ? [riverName, ...sectionPlace(section.country, section.regions)]
        .filter(Boolean)
        .join(" · ")
    : "";

  const isRivermap = section.features?.some(
    (f) => f.created_by === "rivermap-import",
  );

  const hasStar = onToggleFavorite != null;
  const star = hasStar ? ` ${tokens.touch.min}px` : "";
  const star2 = hasStar ? " s" : "";

  return (
    // Each row is its own container, so the stacked layout follows the width
    // the row is given wherever it is listed.
    <Box sx={{ containerType: "inline-size", mb: { xs: 1, md: 0 } }}>
      <ListItemButton
        selected={selected}
        onClick={() => onClick(section.id)}
        sx={{
          ...cardRowSx,
          ...desktopFlatRow,
          display: "grid",
          alignItems: "center",
          minHeight: 56,
          columnGap: 1,
          rowGap: 0.5,
          gridTemplateColumns: `minmax(0, 1fr) 30px 46px 74px${star}`,
          gridTemplateAreas: `"n k g c${star2}"`,
          [`@container (max-width: ${STACK_BELOW}px)`]: {
            gridTemplateColumns: `auto auto minmax(0, 1fr) auto${star}`,
            gridTemplateAreas: `"n n n c${star2}" "k g . c${star2}"`,
            minHeight: 64,
            py: 1.25,
          },
        }}
      >
        <Box sx={{ gridArea: "n", minWidth: 0 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 500,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 1,
              [`@container (max-width: ${STACK_BELOW}px)`]: {
                WebkitLineClamp: 2,
              },
            }}
          >
            {localizedName(section.name, section.names)}
          </Typography>
          {place && (
            <Typography
              variant="caption"
              color="textSecondary"
              noWrap
              sx={{ display: "block" }}
            >
              {place}
            </Typography>
          )}
          {matchedFeature && (
            <Typography
              variant="caption"
              color="textDisabled"
              noWrap
              sx={{ display: "block" }}
            >
              {`Rapid: ${matchedFeature}`}
            </Typography>
          )}
          {isRivermap && (
            <Chip
              label="rivermap"
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.625rem", height: 16, color: "text.secondary" }}
            />
          )}
        </Box>

        <Box
          data-testid="boat-count"
          title={
            descentCount ? `Paddled ${plural(descentCount, "time")}` : undefined
          }
          sx={{
            gridArea: "k",
            justifySelf: "end",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            color: "text.secondary",
            fontSize: "0.8125rem",
            fontWeight: 500,
            [`@container (max-width: ${STACK_BELOW}px)`]: {
              justifySelf: "start",
            },
          }}
        >
          {descentCount != null && descentCount > 0 && (
            <>
              <LogIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              {descentCount}
            </>
          )}
        </Box>

        <Box
          sx={{
            gridArea: "g",
            justifySelf: "end",
            [`@container (max-width: ${STACK_BELOW}px)`]: {
              justifySelf: "start",
            },
          }}
        >
          {grade && <GradeTag grade={grade} />}
        </Box>

        <Box sx={{ gridArea: "c", justifySelf: "end", alignSelf: "center" }}>
          <WaterLevelChip waterwayId={waterwayId} sectionId={section.id} />
        </Box>

        {hasStar && (
          <IconButton
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(section.id);
            }}
            sx={{
              gridArea: "s",
              width: tokens.touch.min,
              height: tokens.touch.min,
            }}
          >
            {isFavorite ? (
              <StarIcon fontSize="small" sx={{ color: tokens.primary }} />
            ) : (
              <StarOutlineIcon fontSize="small" />
            )}
          </IconButton>
        )}
      </ListItemButton>
    </Box>
  );
}
