import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import type { AreaCircle } from "@/lib/geo";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface AreaControlsProps {
  areaCircle: AreaCircle | null;
  locked: boolean;
  onLockedChange: (locked: boolean) => void;
  onRadiusChange: (radiusKm: number) => void;
  onRadiusPreview?: (radiusKm: number) => void;
  /** Where the map is behind the panel (a phone): the card goes to it. */
  onShowMap?: () => void;
}

/** Radius at the slider's end, which fills the preview's frame. */
const PREVIEW_MAX_KM = 200;

/** A drawn stand-in for the map: the search centre as a pin inside a dashed
 * ring that grows with the radius. */
function AreaPreview({ radiusKm }: { radiusKm: number }) {
  const r = 12 + (Math.min(radiusKm, PREVIEW_MAX_KM) / PREVIEW_MAX_KM) * 44;
  return (
    <Box
      component="svg"
      viewBox="0 0 160 96"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <rect width="160" height="96" fill={tokens.surfaceLow} />
      <path
        d="M-4 70 C 30 50, 50 84, 84 58 S 130 30, 164 44"
        fill="none"
        stroke={tokens.primaryContainer}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle
        cx="80"
        cy="48"
        r={r}
        fill={`${tokens.primary}1f`}
        stroke={tokens.primary}
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      <circle cx="80" cy="48" r="5" fill={tokens.primary} />
      <circle cx="80" cy="48" r="2" fill={tokens.surface} />
    </Box>
  );
}

/** The map card where the name field sits in the other modes. The map itself
 * is the real one behind the panel, so on a phone the card takes you to it. */
function MapCard({
  areaCircle,
  radiusKm,
  onShowMap,
}: {
  areaCircle: AreaCircle | null;
  radiusKm: number;
  onShowMap?: () => void;
}) {
  return (
    <ButtonBase
      data-testid="area-map-card"
      disabled={!onShowMap}
      onClick={onShowMap}
      aria-label="Map"
      sx={{
        width: "100%",
        position: "relative",
        overflow: "hidden",
        minHeight: 96,
        gap: 1,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
        color: tokens.onSurfaceVariant,
        "&.Mui-disabled": { color: tokens.onSurfaceVariant },
      }}
    >
      <AreaPreview radiusKm={radiusKm} />
      {areaCircle && (
        <Typography
          variant="body2"
          sx={{
            position: "absolute",
            left: 10,
            bottom: 6,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {areaCircle.lat.toFixed(2)}, {areaCircle.lon.toFixed(2)}
        </Typography>
      )}
    </ButtonBase>
  );
}

export default function AreaControls({
  areaCircle,
  locked,
  onLockedChange,
  onRadiusChange,
  onRadiusPreview,
  onShowMap,
}: AreaControlsProps) {
  const verb = useMapVerb();
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

  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <MapCard
        areaCircle={areaCircle}
        radiusKm={localRadius}
        onShowMap={onShowMap}
      />
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
            // 28px to look at, a 44px band to hit.
            py: `${(tokens.touch.min - 4) / 2}px`,
            "& .MuiSlider-thumb": { width: 28, height: 28 },
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
              color={locked ? "default" : "secondary"}
              sx={{ width: tokens.touch.min, height: tokens.touch.min }}
            >
              {locked ? <LockIcon /> : <LockOpenIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Typography variant="body2" color="textSecondary" sx={{ px: 0.25 }}>
        {verb} on the map to set the search center.
      </Typography>
    </Box>
  );
}
