import Box from "@mui/material/Box";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { regionKindSingular } from "@/lib/regionKinds";
import { labelSx, theme } from "@/lib/theme";
import { REGION_FILL_LAYER } from "./layerIds";

const { tokens } = theme;

/** The region under the mouse and where the pointer is. */
export interface RegionHover {
  id: number;
  label: string;
  kind: string;
  x: number;
  y: number;
}

/** The innermost region under the pointer; the browse layer draws the
 * smallest last, which is first in the hit list. */
export function hoverUnder(event: MapLayerMouseEvent): RegionHover | null {
  const hit = event.features?.find((f) => f.layer.id === REGION_FILL_LAYER);
  const { id, label, kind } = hit?.properties ?? {};
  if (typeof id !== "number") return null;
  return {
    id,
    label: typeof label === "string" ? label : "",
    kind: typeof kind === "string" ? kind : "",
    x: event.point.x,
    y: event.point.y,
  };
}

/** What a click would pick, named beside the pointer: the name and its kind. */
export default function RegionHoverTag({ hover }: { hover: RegionHover }) {
  const kind = regionKindSingular(hover.kind);
  return (
    <Box
      data-testid="region-hover-tag"
      sx={{
        ...labelSx,
        position: "absolute",
        left: hover.x + 14,
        top: hover.y + 18,
        zIndex: 5,
        px: 1.5,
        py: 0.5,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        color: tokens.onSurfaceVariant,
        bgcolor: tokens.surface,
        border: `1px solid ${tokens.outlineVariant}`,
        borderRadius: `${tokens.radii.pill}px`,
      }}
    >
      <Box
        component="span"
        sx={{ color: tokens.onSurface, fontWeight: 700, mr: 0.75 }}
      >
        {hover.label}
      </Box>
      {kind.charAt(0).toUpperCase() + kind.slice(1)}
    </Box>
  );
}
