import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export const PUT_IN_COLOR = "#0072B2";
export const TAKE_OUT_COLOR = "#D55E00";

interface LocationPinProps {
  num: number;
  color: string;
  title: string;
  coords: { lat: number; lon: number } | null;
  onClear: () => void;
  /** Optional free-text label; the field is hidden when onLabelChange is absent. */
  label?: string;
  onLabelChange?: (v: string) => void;
}

/** Numbered pick-target card matching the on-map ①/② pick buttons. */
export default function LocationPin({
  num,
  color,
  title,
  coords,
  onClear,
  label,
  onLabelChange,
}: LocationPinProps) {
  const hasCoords = coords != null;
  return (
    <Box
      sx={{
        flex: 1,
        border: "1px solid",
        borderColor: hasCoords ? color : "divider",
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        transition: "border-color 0.2s",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: color,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {num}
        </div>
        <Typography
          variant="caption"
          sx={{
            fontFamily: '"Space Grotesk", monospace',
            letterSpacing: "0.06em",
            fontWeight: 600,
            flex: 1,
          }}
        >
          {title}
        </Typography>
        {hasCoords && (
          <IconButton size="small" onClick={onClear} sx={{ p: 0.25 }}>
            <DeleteOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>
      {hasCoords ? (
        <Typography
          variant="caption"
          sx={{
            fontFamily: '"Space Grotesk", monospace',
            color: "text.secondary",
            fontSize: "0.7rem",
          }}
        >
          {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
        </Typography>
      ) : (
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontStyle: "italic" }}
        >
          Click ①/② on map to set
        </Typography>
      )}
      {onLabelChange && (
        <TextField
          label="Label (optional)"
          value={label ?? ""}
          onChange={(e) => onLabelChange(e.target.value)}
          size="small"
          fullWidth
        />
      )}
    </Box>
  );
}
