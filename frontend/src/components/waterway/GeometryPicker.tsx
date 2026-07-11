import CloseIcon from "@mui/icons-material/Close";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { fonts } from "@/lib/theme";

export type GeomType = "Point" | "LineString" | "Polygon";

/** Map-driven geometry drawing state, owned by the page/panel that owns the
 * map. Passed as one object so form components stay decoupled from the map
 * wiring. */
export interface GeometryPicking {
  vertices: { lng: number; lat: number }[];
  geomType: GeomType;
  pickingActive: boolean;
  onGeomTypeChange: (t: GeomType) => void;
  onRequestPick: () => void;
  onStopPick: () => void;
  onRemoveVertex?: (i: number) => void;
  onClearVertices: () => void;
}

interface GeometryPickerProps {
  geometry: GeometryPicking;
  /** Full line of the section, offered as a one-click fill for line features. */
  sectionLine?: { lng: number; lat: number }[];
  useSectionLine: boolean;
  onUseSectionLineChange: (use: boolean) => void;
  disabled?: boolean;
}

export function minVerticesFor(geomType: GeomType): number {
  return geomType === "Point" ? 1 : geomType === "LineString" ? 2 : 3;
}

const coordLabel = (v: { lng: number; lat: number }) =>
  `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`;

/** Geometry type toggle + vertex picking UI for point/line/area features. */
export default function GeometryPicker({
  geometry,
  sectionLine,
  useSectionLine,
  onUseSectionLineChange,
  disabled = false,
}: GeometryPickerProps) {
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
  const minVertices = minVerticesFor(geomType);

  function handleGeomTypeChange(newType: GeomType) {
    if (newType === geomType) return;
    onUseSectionLineChange(false);
    onGeomTypeChange(newType); // parent resets vertices
  }

  return (
    <>
      <ToggleButtonGroup
        value={geomType}
        exclusive
        onChange={(_, v) => v && handleGeomTypeChange(v as GeomType)}
        size="small"
        fullWidth
        sx={{
          "& .MuiToggleButton-root": { flex: 1, py: 0.5, fontSize: "0.75rem" },
        }}
      >
        <ToggleButton value="Point">Point</ToggleButton>
        <ToggleButton value="LineString">Line</ToggleButton>
        <ToggleButton value="Polygon">Area</ToggleButton>
      </ToggleButtonGroup>

      {geomType === "Point" ? (
        vertices.length > 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "action.hover",
              borderRadius: 1,
              px: 1,
              py: 0.5,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <LocationOnIcon
              fontSize="small"
              sx={{ color: "text.disabled", flexShrink: 0 }}
            />
            <Typography
              variant="body2"
              sx={{ flex: 1, fontFamily: fonts.mono, fontSize: "0.75rem" }}
            >
              {coordLabel(vertices[0])}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                onClearVertices();
                onRequestPick();
              }}
              disabled={disabled}
            >
              Move
            </Button>
          </Box>
        ) : (
          <Button
            variant={pickingActive ? "contained" : "outlined"}
            size="small"
            color="primary"
            fullWidth
            startIcon={<LocationOnIcon />}
            onClick={pickingActive ? onStopPick : onRequestPick}
            disabled={disabled}
          >
            {pickingActive ? "Tap the map to place…" : "Place on map"}
          </Button>
        )
      ) : (
        <>
          {geomType === "LineString" && sectionLine && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={useSectionLine}
                  onChange={(e) => {
                    onUseSectionLineChange(e.target.checked);
                    if (e.target.checked) onClearVertices();
                  }}
                  disabled={disabled}
                />
              }
              label={
                <Typography variant="caption">Use full section line</Typography>
              }
            />
          )}
          {!useSectionLine && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                  variant="caption"
                  color={
                    vertices.length === 0
                      ? "text.secondary"
                      : vertices.length < minVertices
                        ? "warning.main"
                        : "success.main"
                  }
                  sx={{ flex: 1 }}
                >
                  {vertices.length === 0
                    ? `Min. ${minVertices} points required`
                    : vertices.length < minVertices
                      ? `${vertices.length} point${vertices.length !== 1 ? "s" : ""} - ${minVertices - vertices.length} more needed`
                      : `${vertices.length} point${vertices.length !== 1 ? "s" : ""} placed`}
                </Typography>
              </Box>
              {vertices.length > 0 && (
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                >
                  {vertices.map((v, i) => (
                    <Box
                      key={`${v.lat},${v.lng}`}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        px: 1,
                        py: 0.5,
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.disabled",
                          minWidth: "1rem",
                          textAlign: "center",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          flex: 1,
                          fontFamily: fonts.mono,
                          fontSize: "0.75rem",
                        }}
                      >
                        {coordLabel(v)}
                      </Typography>
                      {onRemoveVertex && (
                        <Box
                          component="span"
                          onClick={() => !disabled && onRemoveVertex(i)}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 20,
                            height: 20,
                            borderRadius: 0.5,
                            bgcolor: "action.selected",
                            color: "text.disabled",
                            fontSize: "0.8rem",
                            cursor: disabled ? "default" : "pointer",
                            flexShrink: 0,
                            "&:hover": disabled
                              ? {}
                              : { color: "text.secondary" },
                          }}
                        >
                          <CloseIcon sx={{ fontSize: "0.75rem" }} />
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <Button
                variant={pickingActive ? "contained" : "outlined"}
                color="primary"
                size="small"
                fullWidth
                startIcon={<LocationOnIcon />}
                onClick={pickingActive ? onStopPick : onRequestPick}
                disabled={disabled}
              >
                {pickingActive
                  ? "Done adding points"
                  : vertices.length === 0
                    ? "Start drawing"
                    : "Add another point"}
              </Button>
            </>
          )}
        </>
      )}
    </>
  );
}
