import Box from "@mui/material/Box";
import { hiddenKindsLabel } from "@/lib/regionKinds";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** A quiet line on the map when the view is too wide to draw a kind of
 * region the search asks for. */
export default function RegionHiddenNote({ kinds }: { kinds: string[] }) {
  if (kinds.length === 0) return null;
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
      Zoom in to see {hiddenKindsLabel(kinds)}
    </Box>
  );
}
