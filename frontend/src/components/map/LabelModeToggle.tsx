import ButtonBase from "@mui/material/ButtonBase";
import Box from "@mui/material/Box";

interface LabelModeToggleProps {
  labelMode: "section" | "river";
  onChange: (mode: "section" | "river") => void;
  satellite: boolean;
  onSatelliteChange: (v: boolean) => void;
  bottomOffset?: number;
}

export default function LabelModeToggle({
  labelMode,
  onChange,
  satellite,
  onSatelliteChange,
  bottomOffset = 0,
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
        bottom: 14 + bottomOffset,
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
      <ButtonBase
        onClick={() => onSatelliteChange(!satellite)}
        sx={btn(satellite)}
      >
        Satellite
      </ButtonBase>
    </Box>
  );
}
