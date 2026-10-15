import Box from "@mui/material/Box";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** How a step's dot reads: filled for a change that happened, hollow grey
 * for where the entry began, hollow teal for something not yet real. */
export type DotKind = "done" | "origin" | "pending" | "gone";

const DOT = 12;
// The dot sits on the first text line; the rail line runs to its centre.
const DOT_TOP = 12;
const LINE_END = DOT_TOP + DOT / 2;

function dotSx(kind: DotKind) {
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
    mt: `${DOT_TOP}px`,
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

/** The dot-and-connector rail of one history step. */
export default function HistoryRail({
  kind,
  first,
  last,
}: {
  kind: DotKind;
  first: boolean;
  last: boolean;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        position: "relative",
        display: "grid",
        justifyItems: "center",
        alignContent: "start",
        "&::before": {
          content: '""',
          position: "absolute",
          left: "calc(50% - 1px)",
          width: 2,
          top: first ? `${LINE_END}px` : 0,
          bottom: last ? `calc(100% - ${LINE_END}px)` : 0,
          bgcolor: tokens.outlineVariant,
        },
      }}
    >
      <Box data-testid="history-dot" data-kind={kind} sx={dotSx(kind)} />
    </Box>
  );
}
