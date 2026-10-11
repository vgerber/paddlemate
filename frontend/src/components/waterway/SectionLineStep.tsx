import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { PUT_IN_COLOR, TAKE_OUT_COLOR } from "@/components/map/LocationPin";
import NumberBadge from "@/components/NumberBadge";
import FormSection from "@/components/waterway/FormSection";
import type { useRiverSnap } from "@/lib/hooks/useRiverSnap";
import { theme } from "@/lib/theme";
import { useMapVerb } from "./useMapVerb";

const { tokens } = theme;

type RiverSnap = ReturnType<typeof useRiverSnap>;

interface SectionLineStepProps {
  waterwayName?: string;
  snap: RiverSnap;
  putIn: { lat: number; lon: number } | null;
  takeOut: { lat: number; lon: number } | null;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  /** True when the snapped course is selected and available. */
  snapActive: boolean;
  onLineSourceChange: (source: "snap" | "straight") => void;
  /** True when the picked points look upstream-ordered. */
  orderWrong: boolean;
}

/** The instruction for the next point to pick, in the device's own verb. */
export function pickHint(
  verb: "Tap" | "Click",
  putIn: unknown,
  takeOut: unknown,
): string {
  if (!putIn) return `${verb} the map to set the put-in`;
  if (!takeOut) return `${verb} the map to set the take-out`;
  return "Both points are set";
}

/** One picked (or still missing) access point as a calm chip: numbered
 * badge, name, coordinates and a 44px clear control. */
function PointChip({
  num,
  color,
  name,
  slug,
  coords,
  onClear,
}: {
  num: number;
  color: string;
  name: string;
  slug: string;
  coords: { lat: number; lon: number } | null;
  onClear: () => void;
}) {
  return (
    <Box
      data-testid={coords ? `picked-${slug}` : `unpicked-${slug}`}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        pl: 1.5,
        minHeight: tokens.touch.min,
        borderRadius: `${tokens.radii.sm}px`,
        bgcolor: coords ? tokens.primaryContainer : tokens.surfaceLow,
        color: coords ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
      }}
    >
      <NumberBadge num={num} color={color} size={20} />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {name}
      </Typography>
      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {coords
          ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`
          : "not set"}
      </Typography>
      {coords && (
        <IconButton
          aria-label={`Clear ${slug}`}
          onClick={onClear}
          sx={{
            color: "inherit",
            width: tokens.touch.min,
            height: tokens.touch.min,
          }}
        >
          <DeleteOutlinedIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

/** Section-line step of the suggest-section wizard: the next point to pick,
 * the picked points as chips, river lookup status, and the snapped-vs-
 * straight line choice. The map itself stays on the wizard page. */
export default function SectionLineStep({
  waterwayName,
  snap,
  putIn,
  takeOut,
  onClearPutIn,
  onClearTakeOut,
  snapActive,
  onLineSourceChange,
  orderWrong,
}: SectionLineStepProps) {
  const verb = useMapVerb();
  const hasLocation = putIn != null && takeOut != null;
  const snapInProgress =
    snap.status === "searching" || snap.status === "routing";

  const lookupHint =
    snap.riverLookup === "searching"
      ? `Searching for ${waterwayName ?? "the river"} on OpenStreetMap...`
      : snap.riverLookup === "found"
        ? "The river course is highlighted on the map."
        : snap.riverLookup === "not-found"
          ? `Couldn't find ${waterwayName ?? "the river"} in this view - pan or zoom to it, or pick your points anyway.`
          : snap.riverLookup === "zoomed-out"
            ? "Zoom in to preview the river course."
            : null;

  return (
    <>
      <FormSection
        label="Put-in and take-out"
        hint={
          <span data-testid="pick-hint">{pickHint(verb, putIn, takeOut)}</span>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <PointChip
            num={1}
            color={PUT_IN_COLOR}
            name="Put-in"
            slug="put-in"
            coords={putIn}
            onClear={onClearPutIn}
          />
          <PointChip
            num={2}
            color={TAKE_OUT_COLOR}
            name="Take-out"
            slug="take-out"
            coords={takeOut}
            onClear={onClearTakeOut}
          />
        </Box>
        {lookupHint && (
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
          >
            {snap.riverLookup === "searching" && <CircularProgress size={12} />}
            {lookupHint}
          </Typography>
        )}
      </FormSection>

      {hasLocation && (
        <FormSection
          label="Section line"
          hint="How the line between your points is drawn."
          action={
            <Tooltip title="Retry OSM matching">
              <span>
                <IconButton
                  aria-label="Retry OSM matching"
                  onClick={snap.retry}
                  disabled={snapInProgress}
                >
                  <ReplayIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          }
        >
          {snap.status === "failed" && (
            <Alert severity="warning">
              Couldn't match this river on OpenStreetMap - a straight line
              between your points will be used.
            </Alert>
          )}
          <ToggleButtonGroup
            value={snapActive ? "snap" : "straight"}
            exclusive
            fullWidth
            onChange={(_, v) => {
              if (v) onLineSourceChange(v);
            }}
            sx={{
              "& .MuiToggleButton-root": {
                flex: 1,
                minHeight: tokens.touch.min,
                fontSize: "0.875rem",
                textTransform: "none",
              },
            }}
          >
            <ToggleButton value="snap" disabled={snap.status !== "done"}>
              {snapInProgress && (
                <CircularProgress size={12} color="inherit" sx={{ mr: 0.75 }} />
              )}
              Snapped course
            </ToggleButton>
            <ToggleButton value="straight">Straight line</ToggleButton>
          </ToggleButtonGroup>
          {orderWrong && (
            <Alert severity="warning">
              Put-in appears to be downstream of take-out - check the order.
            </Alert>
          )}
        </FormSection>
      )}
    </>
  );
}
