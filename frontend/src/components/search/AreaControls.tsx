import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import type { AreaCircle } from "@/lib/geo";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { LockIcon, UnlockIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";

const { tokens } = theme;

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
  const verb = useMapVerb();
  const [localRadius, setLocalRadius] = useState(areaCircle?.radiusKm ?? 10);
  const debouncedRadius = useDebouncedValue(localRadius, 400);

  // Sync if parent updates radius externally (e.g. map drag)
  useEffect(() => {
    if (areaCircle?.radiusKm != null) setLocalRadius(areaCircle.radiusKm);
  }, [areaCircle?.radiusKm]);

  // The latest callback, without making it a trigger of the effect below.
  const radiusChange = useRef(onRadiusChange);
  radiusChange.current = onRadiusChange;
  const circleRadius = useRef(areaCircle?.radiusKm);
  circleRadius.current = areaCircle?.radiusKm;

  // Fire the query-triggering callback only after debounce, and not to echo
  // back a radius the parent already holds.
  useEffect(() => {
    if (debouncedRadius !== circleRadius.current) {
      radiusChange.current(debouncedRadius);
    }
  }, [debouncedRadius]);

  return (
    <Box sx={{ display: "grid", gap: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Slider
          data-no-swipe=""
          aria-label="Radius"
          value={localRadius}
          min={1}
          max={200}
          step={1}
          onChange={(_, v) => {
            const km = v as number;
            setLocalRadius(km);
            onRadiusPreview?.(km);
          }}
          sx={{
            flex: 1,
            // The dot's left edge, not the track's, sits on the grid line.
            ml: { xs: "14px", md: 0 },
            // 28px to look at, a 44px band to hit.
            py: `${(tokens.touch.min - 4) / 2}px`,
            // The thumb element is the 44px hit area; the dot is its ::after.
            "& .MuiSlider-thumb": {
              width: tokens.touch.min,
              height: tokens.touch.min,
              bgcolor: "transparent",
              boxShadow: "none",
              "&::after": {
                width: 28,
                height: 28,
                bgcolor: tokens.primary,
              },
              "&:hover::after, &.Mui-focusVisible::after, &.Mui-active::after":
                { boxShadow: `0 0 0 8px ${tokens.primary}29` },
            },
          }}
        />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            whiteSpace: "nowrap",
            minWidth: 52,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {localRadius} km
        </Typography>
        <Tooltip title={locked ? "Unlock area" : "Lock area"}>
          <span>
            <IconButton
              onClick={() => onLockedChange(!locked)}
              disabled={!areaCircle}
              aria-label={locked ? "Unlock area" : "Lock area"}
              color={locked ? "default" : "primary"}
              sx={{
                width: tokens.touch.min,
                height: tokens.touch.min,
                mr: { xs: `-${tokens.phone.trailInset}px`, md: 0 },
              }}
            >
              {locked ? <LockIcon /> : <UnlockIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Typography variant="body2" color="textSecondary">
        {locked
          ? "The search center is locked."
          : `${verb} the map to move the search center.`}
      </Typography>
    </Box>
  );
}
