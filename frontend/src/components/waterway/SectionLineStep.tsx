import ReplayIcon from "@mui/icons-material/Replay";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import LocationPin, {
  PUT_IN_COLOR,
  TAKE_OUT_COLOR,
} from "@/components/map/LocationPin";
import FormSection from "@/components/waterway/FormSection";
import type { useRiverSnap } from "@/lib/hooks/useRiverSnap";

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

/** Section-line step of the suggest-section wizard: river lookup status,
 * put-in/take-out cards, and the snapped-vs-straight line choice. The map
 * itself stays on the wizard page. */
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
  const hasLocation = putIn != null && takeOut != null;
  const snapInProgress =
    snap.status === "searching" || snap.status === "routing";

  const lookupHint =
    snap.riverLookup === "searching"
      ? `Searching for ${waterwayName ?? "the river"} on OpenStreetMap…`
      : snap.riverLookup === "found"
        ? "The river course is highlighted - tap the map to set each point on it."
        : snap.riverLookup === "not-found"
          ? `Couldn't find ${waterwayName ?? "the river"} in this view - pan or zoom to it, or pick your points anyway.`
          : snap.riverLookup === "zoomed-out"
            ? "Zoom in to preview the river course."
            : "Tap the map to set where you get on and off the water.";

  return (
    <>
      <FormSection
        label="Put-in and take-out"
        hint={
          snap.riverLookup === "searching" ? (
            <Box
              component="span"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
            >
              <CircularProgress size={12} />
              {lookupHint}
            </Box>
          ) : (
            lookupHint
          )
        }
      >
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <LocationPin
            num={1}
            color={PUT_IN_COLOR}
            title="PUT-IN"
            coords={putIn}
            onClear={onClearPutIn}
          />
          <LocationPin
            num={2}
            color={TAKE_OUT_COLOR}
            title="TAKE-OUT"
            coords={takeOut}
            onClear={onClearTakeOut}
          />
        </Box>
      </FormSection>

      {hasLocation && (
        <FormSection
          label="Section line"
          hint="How the line between your points is drawn."
          action={
            <Tooltip title="Retry OSM matching">
              <span>
                <IconButton
                  size="small"
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
            size="small"
            onChange={(_, v) => {
              if (v) onLineSourceChange(v);
            }}
            sx={{
              "& .MuiToggleButton-root": {
                flex: 1,
                py: { xs: 1.25, md: 0.5 },
                fontSize: { xs: "0.75rem", md: "0.7rem" },
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
