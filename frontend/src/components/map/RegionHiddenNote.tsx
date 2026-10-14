import Box from "@mui/material/Box";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

const KIND_WORDS: Record<string, string> = {
  valley: "valleys",
  district: "districts",
  range: "mountain ranges",
  state: "states",
};

/** A quiet line on the map when the view is too wide to draw a kind of
 * region the search asks for. */
export default function RegionHiddenNote({ kinds }: { kinds: string[] }) {
  if (kinds.length === 0) return null;
  const words = kinds.map((k) => KIND_WORDS[k] ?? k).join(" and ");
  return (
    <Box
      role="status"
      data-testid="region-hidden-note"
      sx={{
        ...labelSx,
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        px: 1.5,
        py: 0.75,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        color: tokens.onSurfaceVariant,
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.pill}px`,
        boxShadow: tokens.elevation.e2,
      }}
    >
      Zoom in to see {words}
    </Box>
  );
}
