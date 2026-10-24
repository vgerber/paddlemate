import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface SegmentTrackProps {
  label?: string;
  /** Outline the track; for one on a white card rather than on a tint. */
  bordered?: boolean;
  children: ReactNode;
}

/** A recessed track holding segments; the set ones are white pills. */
export function SegmentTrack({ label, bordered, children }: SegmentTrackProps) {
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: "flex",
        gap: "2px",
        p: "2px",
        bgcolor: tokens.surfaceLow,
        border: bordered ? `1px solid ${tokens.outlineVariant}` : "none",
        borderRadius: `${tokens.radii.sm}px`,
      }}
    >
      {children}
    </Box>
  );
}

interface SegmentProps {
  active: boolean;
  onClick: () => void;
  title?: string;
  /** Share the track's width evenly with the other segments. */
  fill?: boolean;
  /** A 32px pill whose hit area is still 44px high. */
  compact?: boolean;
  children: ReactNode;
}

export function Segment({
  active,
  onClick,
  title,
  fill,
  compact,
  children,
}: SegmentProps) {
  return (
    <ButtonBase
      onClick={onClick}
      title={title}
      aria-pressed={active}
      sx={{
        position: "relative",
        flex: fill ? 1 : "0 1 auto",
        px: 1.5,
        minWidth: compact ? tokens.touch.min : undefined,
        minHeight: compact ? 32 : tokens.touch.min,
        height: compact ? 32 : undefined,
        whiteSpace: "nowrap",
        fontSize: "0.8125rem",
        fontWeight: active ? 600 : 500,
        color: active ? tokens.onSurface : tokens.onSurfaceVariant,
        bgcolor: active ? tokens.segmentThumb : "transparent",
        boxShadow: active ? tokens.elevation.e1 : "none",
        borderRadius: `${tokens.radii.segment}px`,
        "&:hover": {
          bgcolor: active ? tokens.segmentThumb : tokens.surfaceHighest,
        },
        ...(compact && {
          "&::after": { content: '""', position: "absolute", inset: "-6px 0" },
        }),
      }}
    >
      {children}
    </ButtonBase>
  );
}
