import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import NumberBadge from "@/components/NumberBadge";
import { useMapVerb } from "@/components/waterway/useMapVerb";
import { DeleteIcon } from "@/lib/icons";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

// Put-in and take-out share the accent; the number tells them apart.
export const PUT_IN_COLOR = tokens.primary;
export const TAKE_OUT_COLOR = tokens.primary;

interface LocationPinProps {
  num: number;
  color: string;
  title: string;
  coords: { lat: number; lon: number } | null;
  /** A name for the spot (a put-in feature, say); shown in place of the
   * raw coordinates, which move to the tooltip. */
  place?: string;
  onClear: () => void;
  /** Optional free-text label; the field is hidden when onLabelChange is absent. */
  label?: string;
  onLabelChange?: (v: string) => void;
}

/** Numbered pick-target card matching the on-map pick buttons. */
export default function LocationPin({
  num,
  color,
  title,
  coords,
  place,
  onClear,
  label,
  onLabelChange,
}: LocationPinProps) {
  const verb = useMapVerb();
  const hasCoords = coords != null;
  return (
    <Box
      sx={{
        flex: 1,
        border: "1px solid",
        borderColor: hasCoords ? color : "divider",
        borderRadius: `${tokens.radii.sm}px`,
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        transition: `border-color ${tokens.motion.fast}ms`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <NumberBadge num={num} color={color} size={16} />
        <Typography variant="caption" sx={{ ...labelSx, flex: 1 }}>
          {title}
        </Typography>
        {hasCoords && (
          <IconButton
            aria-label={`Clear ${title}`}
            onClick={onClear}
            sx={{
              width: tokens.touch.min,
              height: tokens.touch.min,
              my: -1,
              mr: -1,
            }}
          >
            <DeleteIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>
      {hasCoords ? (
        <Typography
          variant="caption"
          title={`${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`}
          sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
        >
          {place ?? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`}
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {verb} the map to set
        </Typography>
      )}
      {onLabelChange && (
        <TextField
          label="Label (optional)"
          value={label ?? ""}
          onChange={(e) => onLabelChange(e.target.value)}
          fullWidth
          sx={{
            "& .MuiInputBase-root": { minHeight: tokens.touch.min },
            "& .MuiInputBase-input": { fontSize: 16 },
          }}
        />
      )}
    </Box>
  );
}
