import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { AreaCircle } from "@/lib/geo";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

interface AreaControlsProps {
  areaCircle: AreaCircle | null;
  locked: boolean;
  onLockedChange: (locked: boolean) => void;
  onRadiusChange: (radiusKm: number) => void;
  onRadiusPreview?: (radiusKm: number) => void;
}

export default function AreaControls({
  areaCircle,
  locked,
  onLockedChange,
  onRadiusChange,
  onRadiusPreview,
}: AreaControlsProps) {
  const [localRadius, setLocalRadius] = useState(areaCircle?.radiusKm ?? 10);
  const debouncedRadius = useDebouncedValue(localRadius, 400);

  // Sync if parent updates radius externally (e.g. map drag)
  useEffect(() => {
    if (areaCircle?.radiusKm != null) setLocalRadius(areaCircle.radiusKm);
  }, [areaCircle?.radiusKm]);

  // Fire the query-triggering callback only after debounce
  // biome-ignore lint/correctness/useExhaustiveDependencies: onRadiusChange is intentionally omitted; only the debounced value should trigger the callback
  useEffect(() => {
    onRadiusChange(debouncedRadius);
  }, [debouncedRadius]);

  if (!areaCircle) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Slider
        value={localRadius}
        min={1}
        max={200}
        step={1}
        size="small"
        onChange={(_, v) => {
          const km = v as number;
          setLocalRadius(km);
          onRadiusPreview?.(km);
        }}
        sx={{ flex: 1 }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }}
      >
        {localRadius} km
      </Typography>
      <Tooltip title={locked ? "Unlock area" : "Lock area"}>
        <IconButton
          size="small"
          onClick={() => onLockedChange(!locked)}
          color={locked ? "default" : "secondary"}
        >
          {locked ? (
            <LockIcon fontSize="small" />
          ) : (
            <LockOpenIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
