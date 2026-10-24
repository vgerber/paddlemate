import Box from "@mui/material/Box";
import { withAlpha } from "@/lib/alpha";
import { type DotLevel, dotsLabel } from "@/lib/levelDots";
import { theme } from "@/lib/theme";
import { levelMarkerColor } from "@/lib/waterLevel";

const { tokens } = theme;

/** More dots than this read as noise: the rest collapse into a count. */
const MAX_DOTS = 12;

function dotSx(level: DotLevel) {
  if (level === "unknown") return { bgcolor: withAlpha(tokens.outline, 50.2) };
  if (level === "empty") {
    return { border: `2px solid ${levelMarkerColor("empty")}` };
  }
  return { bgcolor: levelMarkerColor(level) };
}

/** One small dot per section, coloured by its level, so a closed row answers
 * "is anything in here high enough?". Grey is unknown (no gauge, no
 * thresholds, no fresh reading), a grey ring is too low. The dots are
 * decoration for the eye; the row carries one spoken label. Not a target. */
export default function LevelDots({
  levels,
  names,
}: {
  levels: DotLevel[];
  /** Section names, same order, for the hover title of each dot. */
  names?: string[];
}) {
  if (levels.length === 0) return null;
  const shown = levels.slice(0, MAX_DOTS);
  const more = levels.length - shown.length;
  return (
    <Box
      role="img"
      aria-label={dotsLabel(levels)}
      data-testid="level-dots"
      sx={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
    >
      {shown.map((level, i) => (
        <Box
          key={i}
          data-level={level}
          title={names?.[i]}
          sx={{
            width: 8,
            height: 8,
            boxSizing: "border-box",
            borderRadius: "50%",
            ...dotSx(level),
          }}
        />
      ))}
      {more > 0 && (
        <Box
          component="span"
          sx={{ fontSize: "0.75rem", color: tokens.onSurfaceVariant }}
        >
          +{more}
        </Box>
      )}
    </Box>
  );
}
