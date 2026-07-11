import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";

interface LabelModeToggleProps {
  labelMode: "section" | "river";
  /** When omitted, only the satellite toggle is shown. */
  onChange?: (mode: "section" | "river") => void;
  satellite: boolean;
  onSatelliteChange: (v: boolean) => void;
  /** Whether feature name labels are shown on the map. */
  featureNames?: boolean;
  onFeatureNamesChange?: (v: boolean) => void;
  bottomOffset?: number;
  anchor?: "top" | "bottom";
}

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
      fontSize: "0.75rem",
      fontWeight: 500,
      color: active ? "text.primary" : "text.secondary",
      bgcolor: active ? "action.selected" : "transparent",
    }) as const;

  return (
    <Box
      sx={{
        position: "absolute",
        ...(anchor === "top" ? { top: 14 } : { bottom: 14 + bottomOffset }),
        left: 10,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        gap: 0.5,
      }}
    >
      {onChange && (
        <Box sx={{ display: "flex" }}>
          {(["section", "river"] as const).map((m) => (
            <ButtonBase
              key={m}
              onClick={() => onChange(m)}
              sx={btn(labelMode === m)}
            >
              {m === "section" ? "Section" : "River"}
            </ButtonBase>
          ))}
        </Box>
      )}
      <ButtonBase
        onClick={() => onSatelliteChange(!satellite)}
        sx={btn(satellite)}
      >
        Satellite
      </ButtonBase>
      {onFeatureNamesChange && (
        <ButtonBase
          onClick={() => onFeatureNamesChange(!featureNames)}
          sx={btn(!!featureNames)}
        >
          Names
        </ButtonBase>
      )}
    </Box>
  );
}
