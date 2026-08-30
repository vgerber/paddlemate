import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { fonts } from "@/lib/theme";

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
  pt: 0.75,
  pb: 0.5,
  fontFamily: fonts.label,
  fontSize: "0.625rem",
  fontWeight: 600,
  letterSpacing: "0.12em",
  color: "text.disabled",
  textTransform: "uppercase",
  lineHeight: 1.4,
} as const;

/** Map layer controls: what section labels say, feature-name visibility,
 * and the satellite base layer. */
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
      py: 0.6,
      fontFamily: fonts.label,
      fontSize: "0.6875rem",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: active ? "text.primary" : "text.secondary",
      bgcolor: active ? "action.selected" : "transparent",
    }) as const;

  const showLabelsGroup = onChange || onFeatureNamesChange;

  return (
    <Box
      sx={{
        position: "absolute",
        ...(anchor === "top" ? { top: 14 } : { bottom: 14 + bottomOffset }),
        left: 10,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
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
                  borderLeft: "1px solid",
                  borderColor: "divider",
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
                ...(onChange
                  ? { borderTop: "1px solid", borderColor: "divider" }
                  : {}),
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
          ...(showLabelsGroup
            ? { borderTop: "1px solid", borderColor: "divider" }
            : {}),
        }}
      >
        Satellite
      </ButtonBase>
    </Box>
  );
}
