import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";
import { withAlpha } from "@/lib/alpha";
import { DeleteIcon } from "@/lib/icons";
import { durations } from "@/lib/motion";
import { theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";
import { ProposalDetail } from "./ProposalDetail";
import {
  DISC,
  IconDisc,
  NumberDisc,
  RAIL_COL,
  RailLine,
  type RailShape,
  RangeTile,
  ROW_MIN,
  TrailSlot,
} from "./railParts";
import type { ComputedFeature } from "./types";
import {
  featureDesc,
  featureName,
  featureTypeLabel,
  fmtKm,
  fmtKmSpan,
} from "./utils";

const { tokens } = theme;
const { panel } = tokens.canvas;

/** What every row of the list shares. */
export interface RowContext {
  activeId?: number | null;
  onItemClick?: (item: ComputedFeature) => void;
  /** Edit and delete, for signed-in users; proposals never get them. */
  onEditItem?: (item: ComputedFeature) => void;
  onDeleteItem?: (item: ComputedFeature) => void;
  /** Opens the feature's history. Not offered for a proposal: it has none. */
  onHistoryItem?: (item: ComputedFeature) => void;
  /** The number each feature carries (see `featureNumbers`). */
  numbers?: ReadonlyMap<number, number>;
  /** Features with a pending delete proposal. */
  pendingDeleteIds?: Set<number>;
}

/** Marker behind a feature name when a delete proposal is pending. */
export function PendingDeleteMarker() {
  return (
    <DeleteIcon
      titleAccess="Deletion proposed"
      sx={{ fontSize: 14, color: tokens.error, flexShrink: 0 }}
    />
  );
}

export const kmSx = {
  flexShrink: 0,
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: tokens.onSurfaceVariant,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
} as const;

/** One feature in the list: its icon on the rail, name and type, the km. A
 * range that holds nothing is a banded row without the fold. */
export function FeatureListRow({
  item,
  ctx,
  rail,
  inBand = false,
}: {
  item: ComputedFeature;
  ctx: RowContext;
  rail: RailShape;
  /** Sits inside a range band: on a phone the band's own inset is the row's
   * padding, so the disc stays on the head row's rail column. */
  inBand?: boolean;
}) {
  const typeLabel = featureTypeLabel(item.feature);
  const desc = featureDesc(item.feature);
  const isProposal = !!item.proposal;
  const isActive = ctx.activeId === item.feature.id;
  const type = item.feature.feature_type;
  const asRange = item.isZone && !isProposal;
  const n = ctx.numbers?.get(item.feature.id);

  return (
    <ButtonBase
      component="div"
      disableRipple
      data-row
      data-type={type}
      aria-expanded={isActive}
      onClick={() => ctx.onItemClick?.(item)}
      sx={{
        display: "flex",
        alignItems: "stretch",
        width: "100%",
        textAlign: "left",
        minHeight: ROW_MIN,
        gap: 1,
        pl: inBand ? { xs: 0.5, md: 1.5 } : 1.5,
        pr: inBand ? { xs: 1, md: `${panel.inner}px` } : `${panel.inner}px`,
        bgcolor: isActive ? withAlpha(tokens.primary, "tint") : "transparent",
        // The selected row's 2px teal ring, drawn inside so it never shifts.
        outline: isActive ? `2px solid ${tokens.primary}` : "none",
        outlineOffset: -2,
        borderRadius: `${tokens.radii.row}px`,
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: RAIL_COL,
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          pt: `${(ROW_MIN - (asRange ? DISC + 4 : DISC)) / 2}px`,
        }}
      >
        <RailLine {...rail} />
        {asRange ? (
          <RangeTile type={type} open={false} foldable={false} n={n} />
        ) : n != null && !isProposal ? (
          <NumberDisc n={n} />
        ) : (
          <IconDisc type={type} hollow={isProposal} />
        )}
      </Box>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          opacity: isProposal ? 0.6 : 1,
        }}
      >
        <Box sx={{ minHeight: ROW_MIN, display: "flex", alignItems: "center" }}>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <Typography
                  component="span"
                  sx={{ fontWeight: 500, fontSize: "0.9375rem", minWidth: 0 }}
                >
                  {featureName(item.feature)}
                </Typography>
                {ctx.pendingDeleteIds?.has(item.feature.id) && (
                  <PendingDeleteMarker />
                )}
              </Box>
              <Typography component="span" data-km sx={kmSx}>
                {item.isZone
                  ? fmtKmSpan(item.startM, item.endM)
                  : fmtKm(item.distM)}
              </Typography>
            </Box>
            {typeLabel && (
              <Typography
                sx={{ fontSize: "0.8125rem", color: tokens.onSurfaceVariant }}
              >
                {typeLabel}
              </Typography>
            )}
          </Box>
          <TrailSlot />
        </Box>
        {desc && (
          <Typography
            sx={{
              fontSize: "0.8125rem",
              color: tokens.onSurfaceVariant,
              mt: 0.5,
              pb: 0.75,
            }}
          >
            {desc}
          </Typography>
        )}
        <Collapse in={isActive} timeout={durations.base} unmountOnExit>
          {isProposal && item.proposal ? (
            <ProposalDetail
              proposal={item.proposal}
              coords={item.coords}
              featureType={item.feature.feature_type}
            />
          ) : (
            <CoordsInfo
              coords={item.coords}
              onHistory={ctx.onHistoryItem && (() => ctx.onHistoryItem?.(item))}
              onEdit={ctx.onEditItem && (() => ctx.onEditItem?.(item))}
              onDelete={ctx.onDeleteItem && (() => ctx.onDeleteItem?.(item))}
            />
          )}
        </Collapse>
      </Box>
    </ButtonBase>
  );
}
