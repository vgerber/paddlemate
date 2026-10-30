import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { announce } from "@/components/charts/water/announce";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import { withAlpha } from "@/lib/alpha";
import type { AreaCircle, LngLat } from "@/lib/geo";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { LockIcon, MyLocationIcon, PlaceIcon, UnlockIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import { fromDisplay, toDisplay, unitLabel, useUnits } from "@/lib/units";

const { tokens } = theme;

const MAX_RADIUS_KM = 200;

interface AreaControlsProps {
  areaCircle: AreaCircle | null;
  locked: boolean;
  onLockedChange: (locked: boolean) => void;
  onRadiusChange: (radiusKm: number) => void;
  onRadiusPreview?: (radiusKm: number) => void;
  /** Moves the centre to a point, keeping the radius. */
  onCentreChange: (point: LngLat) => void;
  /** Moves the centre to the middle of the map in view; absent until the map
   * has reported its view. */
  onCentreOnView?: () => void;
}

/** Why the device position could not be read, in words for the person. */
export function locationErrorText(code: number | undefined): string {
  if (code === 1) {
    return "Location access is blocked. Allow it in the browser settings to start at your position.";
  }
  if (code === 2 || code === undefined) {
    return "Your position is not available on this device.";
  }
  return "Could not get your position in time. Try again.";
}

export default function AreaControls({
  areaCircle,
  locked,
  onLockedChange,
  onRadiusChange,
  onRadiusPreview,
  onCentreChange,
  onCentreOnView,
}: AreaControlsProps) {
  const verb = useMapVerb();
  const [units] = useUnits();
  const unit = unitLabel("distance", units);
  const [localRadius, setLocalRadius] = useState(areaCircle?.radiusKm ?? 10);
  const shown = Math.round(toDisplay("distance", localRadius, units));
  const debouncedRadius = useDebouncedValue(localRadius, 400);

  // Sync if parent updates radius externally (e.g. map drag). The circle's
  // first arrival is not a change: it would undo a radius picked before it.
  const parentRadius = useRef(areaCircle?.radiusKm);
  useEffect(() => {
    const previous = parentRadius.current;
    parentRadius.current = areaCircle?.radiusKm;
    if (previous != null && areaCircle?.radiusKm != null) {
      setLocalRadius(areaCircle.radiusKm);
    }
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

  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Say where the centre went, whichever way it moved (tap, key, location).
  const centre = useRef<number[] | undefined>(
    areaCircle ? [areaCircle.lat, areaCircle.lon] : undefined,
  );
  const lat = areaCircle?.lat;
  const lon = areaCircle?.lon;
  useEffect(() => {
    const before = centre.current;
    centre.current = lat != null && lon != null ? [lat, lon] : undefined;
    if (before && lat != null && lon != null) {
      if (before[0] !== lat || before[1] !== lon) {
        announce(`Search centre set to ${lat.toFixed(3)}, ${lon.toFixed(3)}`);
      }
    }
  }, [lat, lon]);

  // Only a tap asks for the position; the browser prompts then, not before.
  const useMyLocation = () => {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError(locationErrorText(undefined));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive.current) return;
        setLocating(false);
        onCentreChange([pos.coords.longitude, pos.coords.latitude]);
      },
      (err) => {
        if (!alive.current) return;
        setLocating(false);
        setLocationError(locationErrorText(err.code));
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <Box sx={{ display: "grid", gap: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Slider
          data-no-swipe=""
          aria-label="Radius"
          value={shown}
          min={1}
          max={Math.round(toDisplay("distance", MAX_RADIUS_KM, units))}
          step={1}
          getAriaValueText={(v) => `${v} ${unit}`}
          onChange={(_, v) => {
            const km = fromDisplay("distance", v as number, units, 3);
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
                { boxShadow: `0 0 0 8px ${withAlpha(tokens.primary, 16.08)}` },
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
          {shown} {unit}
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
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        <Button
          size="small"
          startIcon={<MyLocationIcon />}
          onClick={useMyLocation}
          disabled={locked || locating}
          sx={{ minHeight: tokens.touch.min }}
        >
          {locating ? "Finding you..." : "Use my location"}
        </Button>
        <Button
          size="small"
          startIcon={<PlaceIcon />}
          onClick={onCentreOnView}
          disabled={locked || !onCentreOnView}
          sx={{ minHeight: tokens.touch.min }}
        >
          Set centre here
        </Button>
      </Box>
      {locationError && (
        <Typography
          role="alert"
          variant="body2"
          sx={{ color: tokens.error }}
          data-testid="location-error"
        >
          {locationError}
        </Typography>
      )}
      <Typography variant="body2" color="textSecondary">
        {locked
          ? "The search center is locked."
          : `${verb} the map to move the search center. With the map focused, the arrow keys pan it and Enter sets the center.`}
      </Typography>
    </Box>
  );
}
