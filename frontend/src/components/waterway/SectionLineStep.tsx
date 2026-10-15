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
import FormSection from "@/components/waterway/FormSection";
import SectionPointCard from "@/components/waterway/SectionPointCard";
import { fmtKm } from "@/components/waterway/section-details/utils";
import { distanceAlongLineM } from "@/lib/geo";
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
  /** The line the section will use, for its length. */
  finalCoords: [number, number][] | null;
  /** The river lookup ran past its time limit. */
  lookupStalled: boolean;
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
  finalCoords,
  lookupStalled,
}: SectionLineStepProps) {
  const verb = useMapVerb();
  const hasLocation = putIn != null && takeOut != null;
  const snapInProgress =
    snap.status === "searching" || snap.status === "routing";

  const lookupBusy = snap.riverLookup === "searching" && !lookupStalled;
  const lookupHint = lookupStalled
    ? `Not found on OpenStreetMap - ${verb.toLowerCase()} the map to place your points freely.`
    : snap.riverLookup === "searching"
      ? `Searching for ${waterwayName ?? "the river"} on OpenStreetMap...`
      : snap.riverLookup === "found"
        ? "The river course is highlighted on the map."
        : snap.riverLookup === "not-found"
          ? `Couldn't find ${waterwayName ?? "the river"} in this view - pan or zoom to it, or pick your points anyway.`
          : snap.riverLookup === "zoomed-out"
            ? "Zoom in to preview the river course."
            : null;
  const lengthM =
    finalCoords && finalCoords.length >= 2
      ? distanceAlongLineM(finalCoords[finalCoords.length - 1], finalCoords)
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
          <SectionPointCard
            num={1}
            color={PUT_IN_COLOR}
            name="Put-in"
            testId={putIn ? "picked-put-in" : "unpicked-put-in"}
            detail={putIn ? fmtKm(0) : "Not set"}
            clearLabel="Clear put-in"
            onClear={putIn ? onClearPutIn : undefined}
          />
          <SectionPointCard
            num={2}
            color={TAKE_OUT_COLOR}
            name="Take-out"
            testId={takeOut ? "picked-take-out" : "unpicked-take-out"}
            detail={takeOut && lengthM != null ? fmtKm(lengthM) : "Not set"}
            clearLabel="Clear take-out"
            onClear={takeOut ? onClearTakeOut : undefined}
          />
        </Box>
        {lookupHint && (
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
          >
            {lookupBusy && <CircularProgress size={12} />}
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
              {snapInProgress && !lookupStalled && (
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
