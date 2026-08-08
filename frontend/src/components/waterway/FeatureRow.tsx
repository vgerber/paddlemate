import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { humanize } from "@/lib/format";
import { fonts, labelSx } from "@/lib/theme";
import { fmtKm } from "./section-details/utils";

/** Position along the section line - the subset of ComputedFeature the row
 * needs, so callers can also pass hand-built extents (e.g. endpoints). */
export interface FeatureExtent {
  distM: number;
  startM: number;
  endM: number;
  isZone: boolean;
}

interface FeatureRowProps {
  /** Feature type key, e.g. "whitewater" - rendered as the small label. */
  featureType: string;
  name?: string | null;
  difficulty?: string | null;
  description?: string | null;
  /** Display-only gauge hint, e.g. the selected gauge's name. */
  gaugeName?: string | null;
  locationType: "Point" | "LineString" | "Polygon";
  /** Position along the section line, when a line is available. */
  extent?: FeatureExtent | null;
  /** Total section length in metres - for full-section detection. */
  totalM?: number;
  onRemove?: () => void;
  leading?: ReactNode;
  /** Rendered after the right stack, e.g. a spacer aligning rows without a
   * remove button next to rows that have one. */
  trailing?: ReactNode;
}

/** Tolerance (m) when detecting that a zone spans the whole section. */
const FULL_SECTION_TOLERANCE_M = 50;

/** One feature in a compact list row: name (difficulty) over the type label,
 * placement + km position on the right, optional remove action. Shared by
 * the suggest-section wizard and the proposal detail view so both render
 * features identically. */
export default function FeatureRow({
  featureType,
  name,
  difficulty,
  description,
  gaugeName,
  locationType,
  extent,
  totalM,
  onRemove,
  leading,
  trailing,
}: FeatureRowProps) {
  const detail = name
    ? difficulty
      ? `${name} (${difficulty})`
      : name
    : (difficulty ?? "");

  const isFullSection =
    extent != null &&
    totalM != null &&
    extent.isZone &&
    extent.startM < FULL_SECTION_TOLERANCE_M &&
    totalM - extent.endM < FULL_SECTION_TOLERANCE_M;

  const placement = isFullSection
    ? "Full section"
    : locationType === "LineString"
      ? "Line"
      : locationType === "Polygon"
        ? "Area"
        : "Point";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {detail && (
          <Typography variant="body2" noWrap>
            {detail}
          </Typography>
        )}
        <Typography sx={labelSx}>{humanize(featureType)}</Typography>
        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
        {gaugeName && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Gauge · {gaugeName}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {placement}
        </Typography>
        {extent && (
          <Typography
            sx={{
              fontFamily: fonts.mono,
              fontSize: "0.65rem",
              color: "text.disabled",
            }}
          >
            {extent.isZone
              ? `${fmtKm(extent.startM)} – ${fmtKm(extent.endM)}`
              : fmtKm(extent.distM)}
          </Typography>
        )}
      </Box>
      {onRemove && (
        <IconButton aria-label="Remove feature" onClick={onRemove}>
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
      {trailing}
    </Box>
  );
}
