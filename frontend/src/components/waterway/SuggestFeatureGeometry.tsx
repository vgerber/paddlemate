import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { plural } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { CloseIcon, PlaceIcon } from "@/lib/icons";
import { alphas, theme } from "@/lib/theme";
import {
  type GeometryPicking,
  type GeomType,
  minVerticesFor,
} from "./geometryPicking";
import { useMapVerb } from "./useMapVerb";

const { tokens } = theme;

const coordLabel = ([lng, lat]: LngLat) =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

function pointsLabel(count: number, min: number): string {
  if (count === 0) return `At least ${min} points needed`;
  if (count < min)
    return `${plural(count, "point")} - ${min - count} more needed`;
  return `${plural(count, "point")} placed`;
}

/** A picked point as a calm chip row with a 44px remove control. */
function PointChip({
  label,
  index,
  onRemove,
  testId,
}: {
  label: string;
  index?: number;
  onRemove?: () => void;
  testId?: string;
}) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        pl: 1.5,
        minHeight: tokens.touch.min,
        bgcolor: tokens.primaryContainer,
        color: tokens.onPrimaryContainer,
        borderRadius: `${tokens.radii.sm}px`,
      }}
    >
      <PlaceIcon sx={{ fontSize: 18, flexShrink: 0 }} />
      <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
        {index != null && `${index + 1}. `}
        {label}
      </Typography>
      {onRemove && (
        <IconButton
          aria-label={`Remove point ${index != null ? index + 1 : ""}`.trim()}
          onClick={onRemove}
          sx={{
            color: "inherit",
            width: tokens.touch.min,
            height: tokens.touch.min,
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

/** Where a feature sits: point, line or area, drawn on the map. Replaces the
 * old picker's cramped controls with the calm form's chips and 44px targets. */
export default function SuggestFeatureGeometry({
  geometry,
  sectionLine,
  useSectionLine,
  onUseSectionLineChange,
  disabled = false,
}: {
  geometry: GeometryPicking;
  sectionLine?: { lng: number; lat: number }[];
  useSectionLine: boolean;
  onUseSectionLineChange: (use: boolean) => void;
  disabled?: boolean;
}) {
  const verb = useMapVerb();
  const {
    vertices,
    geomType,
    pickingActive,
    onGeomTypeChange,
    onRequestPick,
    onStopPick,
    onRemoveVertex,
    onClearVertices,
  } = geometry;
  const min = minVerticesFor(geomType);
  const isPoint = geomType === "Point";

  function changeType(next: GeomType) {
    if (next === geomType) return;
    onUseSectionLineChange(false);
    onGeomTypeChange(next);
  }

  return (
    <>
      <ToggleButtonGroup
        value={geomType}
        exclusive
        fullWidth
        aria-label="Shape"
        onChange={(_, v) => v && changeType(v as GeomType)}
        sx={{
          "& .MuiToggleButton-root": {
            flex: 1,
            minHeight: tokens.touch.min,
            fontSize: "0.875rem",
            textTransform: "none",
          },
        }}
      >
        <ToggleButton value="Point">Point</ToggleButton>
        <ToggleButton value="LineString">Line</ToggleButton>
        <ToggleButton value="Polygon">Area</ToggleButton>
      </ToggleButtonGroup>

      {geomType === "LineString" && sectionLine && (
        <FormControlLabel
          control={
            <Checkbox
              checked={useSectionLine}
              disabled={disabled}
              onChange={(e) => {
                onUseSectionLineChange(e.target.checked);
                if (e.target.checked) onClearVertices();
              }}
            />
          }
          label="Use the full section line"
        />
      )}

      {!useSectionLine && (
        <>
          {vertices.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {vertices.map((v, i) => (
                <PointChip
                  key={`${v[1]},${v[0]}`}
                  testId={isPoint ? "placed-point" : "placed-vertex"}
                  label={coordLabel(v)}
                  index={isPoint ? undefined : i}
                  onRemove={
                    disabled
                      ? undefined
                      : isPoint
                        ? () => {
                            onClearVertices();
                            onRequestPick();
                          }
                        : onRemoveVertex && (() => onRemoveVertex(i))
                  }
                />
              ))}
            </Box>
          )}

          {!isPoint && (
            <Typography
              variant="body2"
              color={vertices.length >= min ? tokens.success : "text.secondary"}
            >
              {pointsLabel(vertices.length, min)}
            </Typography>
          )}

          {(!isPoint || vertices.length === 0) && (
            <ButtonBase
              data-testid="place-button"
              onClick={pickingActive ? onStopPick : onRequestPick}
              disabled={disabled}
              sx={{
                width: "100%",
                minHeight: 48,
                gap: 1,
                borderRadius: `${tokens.radii.row}px`,
                bgcolor: `${tokens.primary}${alphas.hover}`,
                color: tokens.primary,
                fontSize: "0.875rem",
                fontWeight: 600,
                "&:hover": { bgcolor: `${tokens.primary}${alphas.strong}` },
                "&.Mui-disabled": { opacity: 0.5 },
              }}
            >
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: tokens.primary,
                  boxShadow: pickingActive
                    ? `0 0 0 4px ${tokens.primary}${alphas.strong}`
                    : "none",
                }}
              />
              {pickingActive
                ? `${verb} the map to place...`
                : isPoint
                  ? "Place on map"
                  : vertices.length === 0
                    ? "Start drawing"
                    : "Add another point"}
            </ButtonBase>
          )}

          {pickingActive && !isPoint && (
            <Button onClick={onStopPick} sx={{ minHeight: tokens.touch.min }}>
              Done
            </Button>
          )}
        </>
      )}
    </>
  );
}
