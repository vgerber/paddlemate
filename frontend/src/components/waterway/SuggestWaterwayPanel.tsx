import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import WaterIcon from "@mui/icons-material/Water";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GaugePin } from "@/components/map/GaugeMarkers";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import type { CatalogRiver } from "@/lib/api";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useCatalogRiverGauges, useCatalogRivers } from "@/lib/hooks/useGauges";
import { useSession } from "@/lib/hooks/useSession";
import { useCreateWaterway } from "@/lib/hooks/useWaterways";
import { type Coordinate, fetchOsmRiver } from "@/lib/riverSnap";
import { labelSx } from "@/lib/theme";

/** Max viewport span (degrees) for the OSM check - larger areas make Overpass
 * regex queries slow and ambiguous. */
const MAX_OSM_CHECK_SPAN_DEG = 3;

/** Gauge rows shown before the list collapses behind "Show all". */
const GAUGE_LIST_CAP = 5;

interface SuggestWaterwayPanelProps {
  /** Prefill from the search field. */
  initialName: string;
  /** Current map viewport, used as the OSM lookup area. */
  mapBounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null;
  onClose: () => void;
  /** Draws the matched river on the map while checking against OSM. */
  onPreviewCoordsChange: (coords: Coordinate[] | null) => void;
  /** Fits the map to a box, e.g. the picked river's gauge stations. */
  onFocusBounds?: (bounds: [[number, number], [number, number]] | null) => void;
  /** Publishes the matched river's stations as map pins. */
  onGaugePinsChange?: (pins: GaugePin[]) => void;
}

/** Union bounding box of the given catalog rivers' station boxes. */
function riverBounds(
  rivers: CatalogRiver[],
): [[number, number], [number, number]] | null {
  const boxes = rivers.filter(
    (r) =>
      r.min_lat != null &&
      r.min_lon != null &&
      r.max_lat != null &&
      r.max_lon != null,
  );
  if (boxes.length === 0) return null;
  return [
    [
      Math.min(...boxes.map((r) => r.min_lon as number)),
      Math.min(...boxes.map((r) => r.min_lat as number)),
    ],
    [
      Math.max(...boxes.map((r) => r.max_lon as number)),
      Math.max(...boxes.map((r) => r.max_lat as number)),
    ],
  ];
}

type OsmCheck =
  | { state: "idle" }
  | { state: "zoom-in" }
  | { state: "loading" }
  | { state: "found" }
  | { state: "not-found" };

export default function SuggestWaterwayPanel({
  initialName,
  mapBounds,
  onClose,
  onPreviewCoordsChange,
  onFocusBounds,
  onGaugePinsChange,
}: SuggestWaterwayPanelProps) {
  const { isAuthenticated, login } = useSession();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [osmCheck, setOsmCheck] = useState<OsmCheck>({ state: "idle" });

  // Gauge-backed river suggestions: rivers the gauge catalog knows by name.
  // Picking one means live water levels can be linked once sections exist.
  const debouncedName = useDebouncedValue(name);
  const { data: riverSuggestions } = useCatalogRivers(debouncedName);
  const trimmedName = name.trim().toLowerCase();
  const exactMatches = (riverSuggestions ?? []).filter(
    (r) => r.river.toLowerCase() === trimmedName,
  );
  const exactGaugeMatch = exactMatches.length > 0;
  const suggestionChips = (riverSuggestions ?? []).filter(
    (r) => r.river.toLowerCase() !== trimmedName,
  );

  // Picking a chip only fills the name - the map never moves on its own
  // (the user may have framed the area already). Each chip, the exact match
  // alert and every listed gauge carry an explicit focus control instead.

  // All catalog stations of the matched river, listed below the alert and
  // shown as neutral pins on the map.
  const matchedRiverName = exactGaugeMatch ? exactMatches[0].river : null;
  const { data: riverGaugeOptions } = useCatalogRiverGauges(matchedRiverName);
  const riverGauges = useMemo(
    () =>
      (riverGaugeOptions ?? []).flatMap((o) =>
        o.kind === "catalog" ? [o] : [],
      ),
    [riverGaugeOptions],
  );
  const [showAllGauges, setShowAllGauges] = useState(false);
  const visibleGauges = showAllGauges
    ? riverGauges
    : riverGauges.slice(0, GAUGE_LIST_CAP);

  useEffect(() => {
    if (!onGaugePinsChange) return;
    onGaugePinsChange(
      riverGauges.flatMap((g, index) =>
        g.lat != null && g.lon != null
          ? [
              {
                id: index,
                lat: g.lat,
                lon: g.lon,
                name: g.name || g.station_id,
                level: null,
              },
            ]
          : [],
      ),
    );
    return () => onGaugePinsChange([]);
  }, [riverGauges, onGaugePinsChange]);
  const createWaterway = useCreateWaterway();
  const submitting = createWaterway.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const osmAbortRef = useRef<AbortController | null>(null);

  // Clear the OSM result when the name changes and abort any in-flight check
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on name change
  useEffect(() => {
    osmAbortRef.current?.abort();
    setOsmCheck({ state: "idle" });
    onPreviewCoordsChange(null);
  }, [name]);

  useEffect(() => () => osmAbortRef.current?.abort(), []);

  async function handleOsmCheck() {
    if (!mapBounds) return;
    const spanLat = mapBounds.north - mapBounds.south;
    const spanLon = mapBounds.east - mapBounds.west;
    if (spanLat > MAX_OSM_CHECK_SPAN_DEG || spanLon > MAX_OSM_CHECK_SPAN_DEG) {
      setOsmCheck({ state: "zoom-in" });
      return;
    }

    osmAbortRef.current?.abort();
    const controller = new AbortController();
    osmAbortRef.current = controller;
    setOsmCheck({ state: "loading" });
    try {
      const river = await fetchOsmRiver(
        name.trim(),
        mapBounds,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (river) {
        setOsmCheck({ state: "found" });
        onPreviewCoordsChange(river);
      } else {
        setOsmCheck({ state: "not-found" });
        onPreviewCoordsChange(null);
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof Error && err.name === "AbortError")
      )
        return;
      setOsmCheck({ state: "not-found" });
      onPreviewCoordsChange(null);
    }
  }

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    setSubmitError(null);
    // No pre-check: the API rejects a duplicate name with 409, handled in
    // onError. Checking here as well would cost a request and, because the
    // server compares case-insensitively rather than ignoring diacritics,
    // could refuse a name the server would have accepted.
    createWaterway.mutate(
      { name: trimmedName, description: description.trim() || null },
      {
        onSuccess: () => {
          onPreviewCoordsChange(null);
          setSubmitted(true);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setSubmitError(
              `"${trimmedName}" already exists - search for it instead.`,
            );
          } else {
            setSubmitError(
              apiErrorMessage(err, "Failed to submit. Please try again."),
            );
          }
        },
      },
    );
  }

  const canSubmit = !!name.trim() && !submitting && !submitted;

  return (
    <>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 1.5,
          pt: 1.5,
          pb: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          "& .MuiInputBase-inputSizeSmall": {
            py: { xs: "12px", md: "8.5px" },
          },
        }}
      >
        {!isAuthenticated ? (
          <Box sx={{ textAlign: "center", py: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Sign in to suggest a new river.
            </Typography>
            <Button variant="contained" size="small" onClick={login}>
              Sign in
            </Button>
          </Box>
        ) : submitted ? (
          <Box sx={{ textAlign: "center", py: 3 }}>
            <Alert severity="success" sx={{ mb: 2, textAlign: "left" }}>
              Thanks! Your river was submitted and is pending review. It will
              appear in search once an admin approves it.
            </Alert>
            <Button variant="contained" size="small" onClick={onClose}>
              Done
            </Button>
          </Box>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary">
              Suggest a river that's missing from PaddleMate. After approval you
              can add sections to it.
            </Typography>
            <TextField
              label="Name"
              size="small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />

            {suggestionChips.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {suggestionChips.map((r) => (
                  <Chip
                    key={`${r.river}|${r.country ?? ""}`}
                    variant="outlined"
                    label={`${r.river}${r.country ? ` (${r.country})` : ""}`}
                    title={`${r.gauge_count} gauge${r.gauge_count === 1 ? "" : "s"} in the catalog`}
                    onClick={() => setName(r.river)}
                  />
                ))}
              </Box>
            )}

            <TextField
              label="Description"
              size="small"
              multiline
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
            />

            {exactGaugeMatch && riverGauges.length > 0 && (
              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1,
                    pt: 0.75,
                    pb: 0.25,
                  }}
                >
                  <WaterIcon sx={{ fontSize: 14, color: "success.main" }} />
                  <Typography
                    sx={{ ...labelSx, flex: 1 }}
                    title="Live water levels can be linked to this river's sections"
                  >
                    {riverGauges.length} gauge
                    {riverGauges.length === 1 ? "" : "s"} on this river
                  </Typography>
                  {riverBounds(exactMatches) && (
                    <IconButton
                      size="small"
                      aria-label="Show all on map"
                      title="Show all on map"
                      onClick={() => onFocusBounds?.(riverBounds(exactMatches))}
                    >
                      <CenterFocusStrongIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </Box>
                <List dense disablePadding>
                  {visibleGauges.map((g) => (
                    <ListItemButton
                      key={`${g.provider}:${g.station_id}`}
                      disabled={g.lat == null || g.lon == null}
                      onClick={() =>
                        g.lat != null &&
                        g.lon != null &&
                        onFocusBounds?.([
                          [g.lon, g.lat],
                          [g.lon, g.lat],
                        ])
                      }
                      title="Show on map"
                      sx={{ py: 0.75, px: 1.5 }}
                    >
                      <ListItemText
                        primary={g.name || `Station ${g.station_id}`}
                        secondary={
                          g.params && g.params.length > 0
                            ? `${g.provider} · ${g.params.join(", ")}`
                            : g.provider
                        }
                        slotProps={{
                          primary: { variant: "body2" },
                          secondary: { variant: "caption" },
                        }}
                      />
                      <CenterFocusStrongIcon
                        sx={{ fontSize: 16, color: "text.disabled", ml: 1 }}
                      />
                    </ListItemButton>
                  ))}
                </List>
                {riverGauges.length > GAUGE_LIST_CAP && (
                  <Button
                    size="small"
                    fullWidth
                    onClick={() => setShowAllGauges((v) => !v)}
                    sx={{ ...labelSx, py: 1, color: "text.secondary" }}
                  >
                    {showAllGauges
                      ? "Show fewer"
                      : `Show all ${riverGauges.length}`}
                  </Button>
                )}
              </Box>
            )}

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  osmCheck.state === "loading" ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <TravelExploreIcon fontSize="small" />
                  )
                }
                onClick={handleOsmCheck}
                disabled={
                  !name.trim() || !mapBounds || osmCheck.state === "loading"
                }
              >
                Check on OSM
              </Button>
              <Typography variant="caption" color="text.disabled">
                optional
              </Typography>
            </Box>

            {osmCheck.state === "zoom-in" && (
              <Alert severity="info" sx={{ py: 0.25, fontSize: "0.75rem" }}>
                Zoom the map to your river's area first, then check again.
              </Alert>
            )}
            {osmCheck.state === "found" && (
              <Alert severity="success" sx={{ py: 0.25, fontSize: "0.75rem" }}>
                Found "{name.trim()}" on OpenStreetMap - it's highlighted on the
                map.
              </Alert>
            )}
            {osmCheck.state === "not-found" && (
              <Alert severity="info" sx={{ py: 0.25, fontSize: "0.75rem" }}>
                Not found in the visible map area - you can still submit.
              </Alert>
            )}

            {submitError && (
              <Alert severity="error" sx={{ py: 0.25, fontSize: "0.75rem" }}>
                {submitError}
              </Alert>
            )}
          </>
        )}
      </Box>
      <PanelBottomBar
        leftIcon={<CloseIcon />}
        onLeftClick={onClose}
        leftLabel="Cancel"
        title="New river"
        subtitle="Suggest a missing river"
        action={
          <RoundActionButton
            onClick={handleSubmit}
            disabled={!canSubmit || !isAuthenticated}
            ariaLabel="Submit"
          >
            <CheckIcon fontSize="small" />
          </RoundActionButton>
        }
      />
    </>
  );
}
