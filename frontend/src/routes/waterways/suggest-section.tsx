import ReplayIcon from "@mui/icons-material/Replay";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import LocationPin, {
  PUT_IN_COLOR,
  TAKE_OUT_COLOR,
} from "@/components/map/LocationPin";
import WaterwayMap from "@/components/map/Map";
import SuggestSectionForm from "@/components/waterway/SuggestSectionForm";
import type { SectionWithFeatures } from "@/lib/api";
import { useRiverSnap } from "@/lib/hooks/useRiverSnap";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway } from "@/lib/hooks/useWaterways";
import type { BoundingBox, Coordinate } from "@/lib/riverSnap";

export const Route = createFileRoute("/waterways/suggest-section")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway != null ? Number(search.waterway) : undefined,
  }),
  component: SuggestSectionPage,
});

/** Dot product of proposed direction vs. estimated river flow.
 *  Negative → proposed take-out is upstream of put-in. */
function downstreamDot(
  sections: SectionWithFeatures[],
  putIn: { lat: number; lon: number },
  takeOut: { lat: number; lon: number },
): number {
  let dx = 0;
  let dy = 0;
  for (const s of sections) {
    const coords = (s.location as unknown as GeoJSON.LineString).coordinates;
    if (coords.length >= 2) {
      const start = coords[0];
      const end = coords[coords.length - 1];
      dx += end[0] - start[0];
      dy += end[1] - start[1];
    }
  }
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return 1;
  const fx = dx / len;
  const fy = dy / len;
  return (takeOut.lon - putIn.lon) * fx + (takeOut.lat - putIn.lat) * fy;
}

function SuggestSectionPage() {
  const router = useRouter();
  const { waterway: waterwayId } = Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading, login } = useSession();
  const { data: waterway } = useWaterway(waterwayId ?? null);
  const sections = waterway?.sections ?? [];

  const [putIn, setPutIn] = useState<{ lat: number; lon: number } | null>(null);
  const [takeOut, setTakeOut] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [lineSource, setLineSource] = useState<"snap" | "straight">("snap");
  const [submitted, setSubmitted] = useState(false);
  const [mapBounds, setMapBounds] = useState<BoundingBox | null>(null);
  const snap = useRiverSnap(waterway?.name ?? "", putIn, takeOut, mapBounds);

  const submitRef = useRef<(() => void) | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  const hasLocation = putIn != null && takeOut != null;
  const snapActive = lineSource === "snap" && snap.status === "done";
  const snapInProgress =
    snap.status === "searching" || snap.status === "routing";

  const finalCoords: Coordinate[] | null = useMemo(
    () =>
      lineSource === "snap" &&
      snap.snappedCoords &&
      snap.snappedCoords.length >= 2
        ? snap.snappedCoords
        : putIn && takeOut
          ? [
              [putIn.lon, putIn.lat],
              [takeOut.lon, takeOut.lat],
            ]
          : null,
    [lineSource, snap.snappedCoords, putIn, takeOut],
  );

  const orderWrong =
    hasLocation &&
    sections.length > 0 &&
    downstreamDot(sections, putIn, takeOut) < 0;

  const backToMap = () =>
    router.navigate({
      to: "/",
      search: {
        waterway: waterwayId,
        section: undefined,
        q: undefined,
        country: undefined,
        min_diff: undefined,
        max_diff: undefined,
        mode: undefined,
        lat: undefined,
        lon: undefined,
        radius: undefined,
        panel: undefined,
      },
    });

  if (waterwayId == null) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 3 }}>
        <Typography color="text.secondary">No waterway selected.</Typography>
      </Box>
    );
  }

  if (sessionLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pt: 10,
          px: 2,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          Sign in to suggest a section
        </Typography>
        <Button variant="contained" color="secondary" onClick={login}>
          Sign In
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mb: 3,
          pb: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontFamily: '"Space Grotesk", monospace',
            fontWeight: 700,
            fontSize: "0.9rem",
            letterSpacing: "0.05em",
          }}
          noWrap
        >
          Suggest section · {waterway?.name ?? "…"}
        </Typography>
        <Button onClick={backToMap} sx={{ ml: "auto", borderRadius: 0 }}>
          Cancel
        </Button>
      </Box>

      {submitted ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Alert severity="success">
            Thanks! Your section was submitted and is pending review. It will
            appear on the river once an admin approves it.
          </Alert>
          <Button
            variant="contained"
            color="secondary"
            onClick={backToMap}
            sx={{ alignSelf: "flex-start", borderRadius: 0 }}
          >
            Back to map
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Pick the put-in and take-out on the map — the section line is
            matched to the riverbed from OpenStreetMap automatically.
          </Typography>

          {/* Map with ①/② pick buttons */}
          <Box
            sx={{
              height: 380,
              border: "1px solid",
              borderColor: "divider",
              position: "relative",
            }}
          >
            <WaterwayMap
              sections={sections}
              putIn={putIn}
              takeOut={takeOut}
              onPickPutIn={(lat, lon) => setPutIn({ lat, lon })}
              onPickTakeOut={(lat, lon) => setTakeOut({ lat, lon })}
              sectionPreviewCoords={finalCoords ?? undefined}
              riverHighlightCoords={snap.river}
              onBoundsChange={setMapBounds}
            />
          </Box>

          {/* River-course lookup — guides the picking before both points are set */}
          {!hasLocation && (
            <>
              {snap.riverLookup === "searching" && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={14} />
                  <Typography variant="caption" color="text.secondary">
                    Searching for {waterway?.name ?? "the river"} on
                    OpenStreetMap…
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
                  Couldn't find {waterway?.name ?? "the river"} in this map
                  view — pan or zoom to it, or pick your points anyway.
                </Typography>
              )}
              {snap.riverLookup === "zoomed-out" && (
                <Typography variant="caption" color="text.secondary">
                  Zoom in to preview the river course.
                </Typography>
              )}
            </>
          )}

          {/* Picked points */}
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <LocationPin
              num={1}
              color={PUT_IN_COLOR}
              title="PUT-IN"
              coords={putIn}
              onClear={() => setPutIn(null)}
            />
            <LocationPin
              num={2}
              color={TAKE_OUT_COLOR}
              title="TAKE-OUT"
              coords={takeOut}
              onClear={() => setTakeOut(null)}
            />
          </Box>

          {/* Riverbed matching */}
          {hasLocation && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {snapInProgress && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    {snap.status === "searching"
                      ? `Looking up ${waterway?.name ?? "the river"} on OpenStreetMap…`
                      : "A point is past a confluence — following the connecting rivers…"}
                  </Typography>
                </Box>
              )}
              {snap.status === "done" && (
                <Alert
                  severity="success"
                  sx={{ py: 0.25, fontSize: "0.75rem" }}
                >
                  {snap.crossedConfluence
                    ? `Snapped along ${waterway?.name ?? "the river"} and across the confluence onto the connecting river.`
                    : `Snapped to the riverbed of ${waterway?.name ?? "the river"}.`}
                </Alert>
              )}
              {snap.status === "failed" && (
                <Alert
                  severity="warning"
                  sx={{ py: 0.25, fontSize: "0.75rem" }}
                >
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
                    if (v) setLineSource(v);
                  }}
                  sx={{
                    flex: 1,
                    "& .MuiToggleButton-root": {
                      flex: 1,
                      py: 0.5,
                      fontSize: "0.7rem",
                    },
                  }}
                >
                  <ToggleButton value="snap" disabled={snap.status !== "done"}>
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
                    >
                      <ReplayIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              {orderWrong && (
                <Alert
                  severity="warning"
                  sx={{ py: 0.25, fontSize: "0.75rem" }}
                >
                  Put-in appears to be downstream of take-out — check the order.
                </Alert>
              )}
            </Box>
          )}

          {/* Details */}
          <SuggestSectionForm
            waterwayId={waterwayId}
            putIn={putIn}
            takeOut={takeOut}
            finalCoords={finalCoords}
            onSubmitted={() => setSubmitted(true)}
            submitRef={submitRef}
            onCanSubmitChange={setCanSubmit}
          />

          {/* Footer */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              pt: 1.5,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              color="secondary"
              disabled={!canSubmit}
              onClick={() => submitRef.current?.()}
              sx={{ borderRadius: 0 }}
            >
              Suggest section
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
