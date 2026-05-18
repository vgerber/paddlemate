import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import type { AreaCircle } from "@/lib/geo";

interface AreaControlsProps {
  areaCircle: AreaCircle | null;
  locked: boolean;
  onLockedChange: (locked: boolean) => void;
  onRadiusChange: (radiusKm: number) => void;
}

export default function AreaControls({
  areaCircle,
  locked,
  onLockedChange,
  onRadiusChange,
}: AreaControlsProps) {
  if (!areaCircle) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        Click on the map to set the search center.
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Radius: {areaCircle.radiusKm} km
        </Typography>
        <Tooltip title={locked ? "Unlock area" : "Lock area"}>
          <IconButton
            size="small"
            onClick={() => onLockedChange(!locked)}
            color={locked ? "primary" : "default"}
          >
            {locked ? (
              <LockIcon fontSize="small" />
            ) : (
              <LockOpenIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Box>
      <Slider
        value={areaCircle.radiusKm}
        min={1}
        max={200}
        step={1}
        size="small"
        onChange={(_, v) => onRadiusChange(v as number)}
        sx={{ mt: 0.5 }}
      />
    </Box>
  );
}
