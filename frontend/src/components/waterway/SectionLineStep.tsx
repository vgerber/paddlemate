import ReplayIcon from "@mui/icons-material/Replay";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import LocationPin, {
  PUT_IN_COLOR,
  TAKE_OUT_COLOR,
} from "@/components/map/LocationPin";
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

  return (
    <>
      {!hasLocation && (
        <>
          {snap.riverLookup === "searching" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                Searching for {waterwayName ?? "the river"} on OpenStreetMap…
              </Typography>
            </Box>
          )}
          {snap.riverLookup === "found" && (
            <Typography variant="caption" color="text.secondary">
              River course highlighted on the map — pick your points on it.
            </Typography>
          )}
          {snap.riverLookup === "not-found" && (
            <Typography variant="caption" color="text.secondary">
              Couldn't find {waterwayName ?? "the river"} in this map view — pan
              or zoom to it, or pick your points anyway.
            </Typography>
          )}
          {snap.riverLookup === "zoomed-out" && (
            <Typography variant="caption" color="text.secondary">
              Zoom in to preview the river course.
            </Typography>
          )}
        </>
      )}

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

      {hasLocation && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {snap.status === "failed" && (
            <Alert severity="warning" sx={{ py: 0.25, fontSize: "0.75rem" }}>
              Couldn't match this river on OpenStreetMap — a straight line
              between your points will be used.
            </Alert>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ToggleButtonGroup
              value={snapActive ? "snap" : "straight"}
              exclusive
              size="small"
              onChange={(_, v) => {
                if (v) onLineSourceChange(v);
              }}
              sx={{
                flex: 1,
                "& .MuiToggleButton-root": {
                  flex: 1,
                  py: { xs: 1.25, md: 0.5 },
                  fontSize: { xs: "0.75rem", md: "0.7rem" },
                },
              }}
            >
              <ToggleButton value="snap" disabled={snap.status !== "done"}>
                {snapInProgress && (
                  <CircularProgress
                    size={12}
                    color="inherit"
                    sx={{ mr: 0.75 }}
                  />
                )}
                Snapped course
              </ToggleButton>
              <ToggleButton value="straight">Straight line</ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title="Retry OSM matching">
              <span>
                <IconButton
                  size="small"
                  onClick={snap.retry}
                  disabled={snapInProgress}
                  sx={{ p: { xs: 1.25, md: 0.625 } }}
                >
                  <ReplayIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          {orderWrong && (
            <Alert severity="warning" sx={{ py: 0.25, fontSize: "0.75rem" }}>
              Put-in appears to be downstream of take-out — check the order.
            </Alert>
          )}
        </Box>
      )}
    </>
  );
}
