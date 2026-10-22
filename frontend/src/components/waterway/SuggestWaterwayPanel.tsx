import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import type { GaugePin } from "@/components/map/GaugeMarkers";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import EmptyState from "@/components/states/EmptyState";
import SignInGate from "@/components/states/SignInGate";
import FormSection from "@/components/waterway/FormSection";
import ProposalNoteField from "@/components/waterway/ProposalNoteField";
import { proposalNoteValue } from "@/components/waterway/proposalNote";
import type { CatalogRiver } from "@/lib/api";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { plural } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import {
  useCatalogGaugeSearch,
  useCatalogRiverGauges,
  useCatalogRivers,
} from "@/lib/hooks/useGauges";
import { useSession } from "@/lib/hooks/useSession";
import { useCreateWaterway } from "@/lib/hooks/useWaterways";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** Gauge rows shown before the list collapses behind "Show all". */
const GAUGE_LIST_CAP = 5;

/** Radius for surrounding-gauge context pins around the matched river. */
const NEARBY_RADIUS_KM = 75;
const NEARBY_LIMIT = 50;

interface SuggestWaterwayPanelProps {
  /** Prefill from the search field. */
  initialName: string;
  onClose: () => void;
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

export default function SuggestWaterwayPanel({
  initialName,
  onClose,
  onFocusBounds,
  onGaugePinsChange,
}: SuggestWaterwayPanelProps) {
  const { isAuthenticated } = useSession();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");

  // Gauge-backed river suggestions: rivers the gauge catalog knows by name.
  // The exact match ranks first server-side, so it is always present.
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
  // (the user may have framed the area already). The match card and every
  // listed gauge carry an explicit focus control instead.

  // The matched river's stations, listed in the panel and shown highlighted
  // on the map; surrounding catalog gauges appear as neutral context pins.
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

  const matchedBounds = useMemo(
    () => riverBounds(exactMatches),
    [exactMatches],
  );
  const nearbyCenter = matchedBounds
    ? {
        lat: (matchedBounds[0][1] + matchedBounds[1][1]) / 2,
        lon: (matchedBounds[0][0] + matchedBounds[1][0]) / 2,
      }
    : undefined;
  const { data: nearbyOptions } = useCatalogGaugeSearch(
    "",
    nearbyCenter,
    NEARBY_RADIUS_KM,
    NEARBY_LIMIT,
  );

  const gaugePins = useMemo(() => {
    const pins: GaugePin[] = riverGauges.flatMap((g, index) =>
      g.lat != null && g.lon != null
        ? [
            {
              id: index,
              lat: g.lat,
              lon: g.lon,
              name: g.name || `Station ${g.station_id}`,
              level: null,
              highlighted: true,
              info: {
                river: g.river,
                provider: g.provider,
                params: g.params ?? [],
              },
            },
          ]
        : [],
    );
    // Surrounding gauges for context: everything nearby that is not on the
    // matched river, in the default neutral style.
    const seen = new Set(pins.map((p) => `${p.lat},${p.lon}`));
    for (const [index, o] of (nearbyOptions ?? []).entries()) {
      if (o.kind === "catalog") {
        if (o.river?.toLowerCase() === matchedRiverName?.toLowerCase())
          continue;
        if (o.lat == null || o.lon == null) continue;
        const key = `${o.lat},${o.lon}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pins.push({
          id: 10_000 + index,
          lat: o.lat,
          lon: o.lon,
          name: o.name || `Station ${o.station_id}`,
          level: null,
          info: {
            river: o.river,
            provider: o.provider,
            params: o.params ?? [],
          },
        });
      } else if (o.gauge.lat != null && o.gauge.lon != null) {
        const key = `${o.gauge.lat},${o.gauge.lon}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pins.push({
          id: 10_000 + index,
          lat: o.gauge.lat,
          lon: o.gauge.lon,
          name: o.gauge.name,
          level: null,
          info: { river: null, provider: o.gauge.provider, params: [] },
        });
      }
    }
    return pins;
  }, [riverGauges, nearbyOptions, matchedRiverName]);

  useEffect(() => {
    if (!onGaugePinsChange) return;
    onGaugePinsChange(gaugePins);
    return () => onGaugePinsChange([]);
  }, [gaugePins, onGaugePinsChange]);

  const createWaterway = useCreateWaterway();
  const submitting = createWaterway.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitError(null);
    // No pre-check: the API rejects a duplicate name with 409, handled in
    // onError. Checking here as well would cost a request and, because the
    // server compares case-insensitively rather than ignoring diacritics,
    // could refuse a name the server would have accepted.
    createWaterway.mutate(
      {
        name: trimmed,
        description: description.trim() || null,
        proposal_note: proposalNoteValue(note),
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setSubmitError(
              `"${trimmed}" already exists - search for it instead.`,
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
          px: { xs: `${tokens.phone.line}px`, md: 1.5 },
          pt: 1.5,
          pb: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
        }}
      >
        {!isAuthenticated ? (
          <SignInGate title="Sign in to suggest a river" pt={3} />
        ) : submitted ? (
          <Box
            data-testid="river-submitted"
            sx={{
              bgcolor: tokens.surface,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: tokens.elevation.e1,
            }}
          >
            <EmptyState
              icon={
                <CheckCircleOutlineIcon
                  sx={{ fontSize: 40, color: tokens.success }}
                />
              }
              title="River submitted"
              caption="It appears in search once an admin approves it."
            />
          </Box>
        ) : (
          <>
            <FormSection
              label="River name"
              hint="Missing from PaddleMate? Name it - after approval you can add sections."
            >
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                slotProps={{ htmlInput: { "aria-required": true } }}
                fullWidth
              />
            </FormSection>

            {exactGaugeMatch && riverGauges.length > 0 && (
              <Box
                data-testid="river-gauges"
                sx={{
                  bgcolor: tokens.surface,
                  borderRadius: `${tokens.radii.md}px`,
                  boxShadow: `inset 0 0 0 1px ${tokens.outlineVariant}`,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    pl: 1.5,
                    pr: 0.5,
                    pt: 0.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: tokens.outline,
                    }}
                  />
                  <Typography
                    sx={{ ...labelSx, flex: 1 }}
                    title="Live water levels can be linked to this river's sections"
                  >
                    {plural(riverGauges.length, "gauge")} on "{matchedRiverName}
                    "
                  </Typography>
                  {matchedBounds && (
                    <IconButton
                      aria-label="Show all on map"
                      title="Show all on map"
                      sx={{ width: tokens.touch.min, height: tokens.touch.min }}
                      onClick={() => onFocusBounds?.(matchedBounds)}
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
                      sx={{
                        minHeight: tokens.touch.min,
                        px: { xs: 0, md: 1.5 },
                        borderTop: "1px solid",
                        borderColor: tokens.outlineVariant,
                      }}
                    >
                      <ListItemText
                        primary={g.name || `Station ${g.station_id}`}
                        slotProps={{ primary: { variant: "body2" } }}
                      />
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        data-testid="gauge-params"
                      >
                        {g.params?.join(", ")}
                      </Typography>
                      <CenterFocusStrongIcon
                        sx={{ fontSize: 16, color: "text.disabled", ml: 1 }}
                      />
                    </ListItemButton>
                  ))}
                </List>
                {riverGauges.length > GAUGE_LIST_CAP && (
                  <Button
                    fullWidth
                    onClick={() => setShowAllGauges((v) => !v)}
                    sx={{
                      ...labelSx,
                      minHeight: tokens.touch.min,
                      color: tokens.primary,
                      borderTop: "1px solid",
                      borderColor: tokens.outlineVariant,
                      borderRadius: 0,
                    }}
                  >
                    {showAllGauges
                      ? "Show fewer"
                      : `Show all ${riverGauges.length}`}
                  </Button>
                )}
              </Box>
            )}

            {suggestionChips.length > 0 && (
              <FormSection
                label="Similar rivers with gauges"
                hint="Pick one to use its exact name."
              >
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                  {suggestionChips.map((r) => (
                    <Chip
                      data-testid="similar-river"
                      key={`${r.river}|${r.country ?? ""}`}
                      variant="outlined"
                      label={`${r.river}${r.country ? ` (${r.country})` : ""}`}
                      title={`${plural(r.gauge_count, "gauge")} in the catalog`}
                      onClick={() => setName(r.river)}
                      sx={{ maxWidth: "100%" }}
                    />
                  ))}
                </Box>
              </FormSection>
            )}

            <FormSection
              label="Description"
              hint="Optional - what makes this river worth paddling."
            >
              <TextField
                label="Description"
                multiline
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
              />
            </FormSection>

            <ProposalNoteField value={note} onChange={setNote} />

            {submitError && <Alert severity="error">{submitError}</Alert>}
          </>
        )}
      </Box>
      <PanelBottomBar
        onLeftClick={onClose}
        leftLabel={submitted ? "Close" : "Cancel"}
        title={submitted ? "River submitted" : "New river"}
        subtitle={submitted ? "Pending review" : "Suggest a missing river"}
        action={
          <RoundActionButton
            onClick={submitted ? onClose : handleSubmit}
            disabled={!submitted && (!canSubmit || !isAuthenticated)}
            ariaLabel={submitted ? "Done" : "Submit"}
          >
            <CheckIcon fontSize="small" />
          </RoundActionButton>
        }
      />
    </>
  );
}
