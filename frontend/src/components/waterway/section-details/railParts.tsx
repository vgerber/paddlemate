import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import FeatureTypeIcon from "@/components/FeatureTypeIcon";
import type { FeatureType } from "@/lib/api";
import { css } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** Height of the first line of a row: the disc is centred on it. */
export const ROW_MIN = tokens.touch.row;
export const DISC = 32;
/** Width of the rail column. */
export const RAIL_COL = 40;

export interface RailShape {
  /** The line continues up to the previous row. */
  top: boolean;
  /** The line continues down to the next row. */
  bottom: boolean;
  /** A portage walks the bank: its rail is dashed. */
  dashed: boolean;
}

/** One row's piece of the rail. It is painted first and the disc sits above
 * it, so the line never shows through an icon. */
export function RailLine({ top, bottom, dashed }: RailShape) {
  const half = ROW_MIN / 2;
  return (
    <Box
      data-rail
      aria-hidden="true"
      sx={{
        position: "absolute",
        zIndex: 0,
        left: "50%",
        width: 0,
        top: top ? 0 : half,
        bottom: bottom ? 0 : `calc(100% - ${half}px)`,
        borderLeft: `2px ${dashed ? "dashed" : "solid"} ${tokens.outlineVariant}`,
        transform: "translateX(-1px)",
      }}
    />
  );
}

/** A point feature's icon in a white disc on the rail. */
export function IconDisc({
  type,
  hollow = false,
}: {
  type: FeatureType;
  hollow?: boolean;
}) {
  return (
    <Box
      data-row-disc
      sx={{
        position: "relative",
        zIndex: 1,
        width: DISC,
        height: DISC,
        borderRadius: "50%",
        bgcolor: tokens.surface,
        border: `1.5px ${hollow ? "dashed" : "solid"} ${tokens.outlineVariant}`,
        color: tokens.onSurfaceVariant,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <FeatureTypeIcon type={type} size={20} />
    </Box>
  );
}

/** A range's icon tile; with members it carries the fold chevron badge. */
export function RangeTile({
  type,
  open,
  foldable,
}: {
  type: FeatureType;
  open: boolean;
  foldable: boolean;
}) {
  return (
    <Box
      data-row-disc
      sx={{
        position: "relative",
        zIndex: 1,
        width: DISC + 4,
        height: DISC + 4,
        borderRadius: `${tokens.radii.sm}px`,
        bgcolor: tokens.primaryContainer,
        color: tokens.onPrimaryContainer,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <FeatureTypeIcon type={type} size={20} />
      {foldable && (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            bgcolor: tokens.surface,
            border: `1.5px solid ${tokens.primaryContainer}`,
            display: "grid",
            placeItems: "center",
            color: tokens.primary,
          }}
        >
          <ExpandMoreIcon
            sx={{
              fontSize: 14,
              transform: open ? "none" : "rotate(-90deg)",
              transition: `transform ${css.fast} ${css.easeOut}`,
            }}
          />
        </Box>
      )}
    </Box>
  );
}
