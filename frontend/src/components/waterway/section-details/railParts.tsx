import Box from "@mui/material/Box";
import { trailSlotSx } from "@/components/canvas/flatRow";
import FeatureTypeIcon from "@/components/FeatureTypeIcon";
import type { FeatureType } from "@/lib/api";
import { ExpandIcon } from "@/lib/icons";
import { css } from "@/lib/motion";
import { theme } from "@/lib/theme";
import { selectionFade } from "./Fold";

const { tokens } = theme;

/** Height of the first line of a row: the disc is centred on it. */
export const ROW_MIN = tokens.canvas.panel.row;
export const DISC = 28;
/** Width of the rail column. */
export const RAIL_COL = 36;

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

/** The number a feature carries on its row and its map pin. */
export function NumberDisc({ n, size = DISC }: { n: number; size?: number }) {
  return (
    <Box
      data-row-disc
      data-reduced-fade
      data-pin-number={n}
      sx={{
        position: "relative",
        zIndex: 1,
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: tokens.primaryFill,
        color: tokens.onPrimary,
        transition: selectionFade(["background-color", "color"]),
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {n}
    </Box>
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
      <FeatureTypeIcon type={type} size={18} />
    </Box>
  );
}

/** A range's icon tile; with members it carries the fold chevron badge. */
export function RangeTile({
  type,
  open,
  foldable,
  n,
}: {
  type: FeatureType;
  open: boolean;
  foldable: boolean;
  /** Its number, in place of the type icon. */
  n?: number;
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
      {n != null ? (
        <NumberDisc n={n} size={DISC} />
      ) : (
        <FeatureTypeIcon type={type} size={20} />
      )}
      {foldable && (
        <Box
          aria-hidden="true"
          sx={{
            // On a phone the fold cue is the row's trailing chevron (FoldCue):
            // a badge on the tile would sit over the disc and off the rail.
            display: { xs: "none", md: "grid" },
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 16,
            height: 16,
            borderRadius: "50%",
            bgcolor: tokens.surface,
            border: `1.5px solid ${tokens.primaryContainer}`,
            placeItems: "center",
            color: tokens.primary,
          }}
        >
          <ExpandIcon
            sx={{
              fontSize: 12,
              transform: open ? "none" : "rotate(-90deg)",
              transition: `transform ${css.base} ${css.easeInOut}`,
            }}
          />
        </Box>
      )}
    </Box>
  );
}

/** The phone row's trailing slot (md up draws none): a spacer on rows with no
 * control, so every value in the list ends on one line. */
export function TrailSlot({ open }: { open?: boolean }) {
  return (
    <Box
      aria-hidden="true"
      data-trail-slot
      sx={{
        ...trailSlotSx,
        display: { xs: "flex", md: "none" },
        color: tokens.primary,
      }}
    >
      {open != null && (
        <ExpandIcon
          sx={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: `transform ${css.base} ${css.easeInOut}`,
          }}
        />
      )}
    </Box>
  );
}
