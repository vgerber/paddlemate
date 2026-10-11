import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface LabelModeToggleProps {
  labelMode: "section" | "river";
  /** When omitted, the section/river label switch is hidden. */
  onChange?: (mode: "section" | "river") => void;
  satellite: boolean;
  onSatelliteChange: (v: boolean) => void;
  /** Whether feature name labels are shown on the map. When the change
   * handler is omitted, the toggle is hidden. */
  featureNames?: boolean;
  onFeatureNamesChange?: (v: boolean) => void;
  bottomOffset?: number;
  anchor?: "top" | "bottom";
}

const captionSx = {
  px: 1.5,
  pt: 1,
  pb: 0.25,
  fontSize: "0.75rem",
  fontWeight: 600,
  color: tokens.onSurfaceVariant,
  lineHeight: 1.4,
} as const;

const rule = `1px solid ${tokens.outlineVariant}`;

/** Map layer controls: what section labels say, feature-name visibility,
 * and the satellite base layer. A white floating group like the zoom
 * buttons, every button a full touch target. */
export default function LabelModeToggle({
  labelMode,
  onChange,
  satellite,
  onSatelliteChange,
  featureNames,
  onFeatureNamesChange,
  bottomOffset = 0,
  anchor = "bottom",
}: LabelModeToggleProps) {
  const btn = (active: boolean) =>
    ({
      px: 1.5,
      minHeight: tokens.touch.min,
      whiteSpace: "nowrap",
      fontSize: "0.8125rem",
      fontWeight: active ? 600 : 500,
      color: active ? tokens.onPrimaryContainer : tokens.onSurface,
      bgcolor: active ? tokens.primaryContainer : "transparent",
      "&:hover": {
        bgcolor: active ? tokens.primaryContainer : tokens.surfaceHigh,
      },
    }) as const;

  const showLabelsGroup = onChange || onFeatureNamesChange;

  return (
    <Box
      data-testid="map-layer-toggle"
      sx={{
        position: "absolute",
        ...(anchor === "top" ? { top: 14 } : { bottom: 14 + bottomOffset }),
        left: 10,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: `${tokens.radii.sm}px`,
        boxShadow: tokens.elevation.e2,
        bgcolor: tokens.surface,
      }}
    >
      {showLabelsGroup && (
        <>
          <Typography sx={captionSx}>Labels</Typography>
          {onChange && (
            <Box sx={{ display: "flex" }}>
              <ButtonBase
                onClick={() => onChange("section")}
                title="Label sections with their own name"
                sx={{ ...btn(labelMode === "section"), flex: 1 }}
              >
                Section
              </ButtonBase>
              <ButtonBase
                onClick={() => onChange("river")}
                title="Label sections with their river's name"
                sx={{
                  ...btn(labelMode === "river"),
                  flex: 1,
                  borderLeft: rule,
                }}
              >
                River
              </ButtonBase>
            </Box>
          )}
          {onFeatureNamesChange && (
            <ButtonBase
              onClick={() => onFeatureNamesChange(!featureNames)}
              title="Show names of rapids, put-ins and other features"
              sx={{
                ...btn(!!featureNames),
                ...(onChange ? { borderTop: rule } : {}),
              }}
            >
              Features
            </ButtonBase>
          )}
        </>
      )}
      <ButtonBase
        onClick={() => onSatelliteChange(!satellite)}
        title="Satellite base map"
        sx={{
          ...btn(satellite),
          ...(showLabelsGroup ? { borderTop: rule } : {}),
        }}
      >
        Satellite
      </ButtonBase>
    </Box>
  );
}
