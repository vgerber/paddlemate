import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import { waterwaysApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { proposalKeys } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { type Coordinate, fetchOsmRiver } from "@/lib/riverSnap";
import { normalizeForSearch } from "@/lib/text";

/** Max viewport span (degrees) for the OSM check — larger areas make Overpass
 * regex queries slow and ambiguous. */
const MAX_OSM_CHECK_SPAN_DEG = 3;

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
}: SuggestWaterwayPanelProps) {
  const { isAuthenticated, login } = useSession();
  const queryClient = useQueryClient();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [osmCheck, setOsmCheck] = useState<OsmCheck>({ state: "idle" });
  const [submitting, setSubmitting] = useState(false);
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

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Pre-check for an existing river with the same (normalized) name
      const existing = await waterwaysApi.list({
        name: trimmedName,
        per_page: 100,
      });
      const normalized = normalizeForSearch(trimmedName);
      if (
        existing.items.some((w) => normalizeForSearch(w.name) === normalized)
      ) {
        setSubmitError(
          `"${trimmedName}" already exists — search for it instead.`,
        );
        return;
      }

      await waterwaysApi.create({
        name: trimmedName,
        description: description.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: proposalKeys.all });
      onPreviewCoordsChange(null);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError(
          `"${trimmedName}" already exists — search for it instead.`,
        );
      } else {
        setSubmitError("Failed to submit. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
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
            <TextField
              label="Description"
              size="small"
              multiline
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
            />

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
                Found "{name.trim()}" on OpenStreetMap — it's highlighted on the
                map.
              </Alert>
            )}
            {osmCheck.state === "not-found" && (
              <Alert severity="info" sx={{ py: 0.25, fontSize: "0.75rem" }}>
                Not found in the visible map area — you can still submit.
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
