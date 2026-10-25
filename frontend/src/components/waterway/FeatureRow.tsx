import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { humanize, sentenceCase } from "@/lib/format";
import { CloseIcon } from "@/lib/icons";
import { labelSx } from "@/lib/theme";
import { coversWholeSection, fmtKm, fmtKmSpan } from "./section-details/utils";

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
    coversWholeSection(extent, totalM);

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
        <Typography sx={labelSx}>
          {sentenceCase(humanize(featureType))}
        </Typography>
        {description && (
          <Typography variant="caption" color="textSecondary">
            {description}
          </Typography>
        )}
        {gaugeName && (
          <Typography
            variant="caption"
            color="textSecondary"
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
        <Typography variant="caption" color="textSecondary">
          {placement}
        </Typography>
        {extent && (
          <Typography
            sx={{
              fontVariantNumeric: "tabular-nums",
              fontSize: "0.6875rem",
              color: "text.secondary",
            }}
          >
            {extent.isZone
              ? fmtKmSpan(extent.startM, extent.endM)
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
