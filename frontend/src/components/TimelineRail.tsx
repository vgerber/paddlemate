import Box from "@mui/material/Box";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** How an entry's dot reads: filled for a change that happened (or a plain
 * stop), hollow grey for where the entry began, hollow teal for something
 * not yet real. */
export type DotKind = "done" | "origin" | "pending" | "gone";

const DOT = 12;

function dotSx(kind: DotKind, top: number) {
  const hollow = kind === "origin" || kind === "pending";
  const color = {
    done: tokens.primary,
    pending: tokens.primary,
    origin: tokens.onSurfaceVariant,
    gone: tokens.onSurfaceVariant,
  }[kind];
  return {
    position: "relative",
    zIndex: 1,
    mt: `${top}px`,
    width: DOT,
    height: DOT,
    boxSizing: "border-box",
    borderRadius: "50%",
    border: `2px solid ${color}`,
    bgcolor: hollow ? tokens.surface : color,
    // The halo keeps the line from touching the dot.
    outline: `3px solid ${tokens.surface}`,
  } as const;
}

/** The left rail of a timeline entry: a dot on the entry's first line and a
 * connector up to the previous entry and down to the next one. `dotTop` is
 * where the dot starts below the top of the entry. */
export default function TimelineRail({
  kind = "done",
  isFirst = true,
  isLast = false,
  dotTop = 12,
}: {
  kind?: DotKind;
  isFirst?: boolean;
  isLast?: boolean;
  dotTop?: number;
}) {
  const lineEnd = dotTop + DOT / 2;
  return (
    <Box
      aria-hidden
      sx={{
        position: "relative",
        display: "grid",
        justifyItems: "center",
        alignContent: "start",
        minWidth: 16,
        flexShrink: 0,
        "&::before": {
          content: '""',
          position: "absolute",
          left: "calc(50% - 1px)",
          width: 2,
          top: isFirst ? `${lineEnd}px` : 0,
          bottom: isLast ? `calc(100% - ${lineEnd}px)` : 0,
          bgcolor: tokens.outlineVariant,
        },
      }}
    >
      <Box
        data-testid="history-dot"
        data-kind={kind}
        sx={dotSx(kind, dotTop)}
      />
    </Box>
  );
}
