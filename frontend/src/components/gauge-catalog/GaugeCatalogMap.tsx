import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { GeoJSONSource } from "maplibre-gl";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import AccessibleMarker from "@/components/map/AccessibleMarker";
import { cameraEasing, screensTo } from "@/components/map/cameraMotion";
import { LIBERTY_STYLE } from "@/components/map/mapStyles";
import { useCalmBaseMap } from "@/components/map/useMutedBaseMap";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import type { GaugeMapState } from "@/lib/api";
import { useGaugeMap } from "@/lib/hooks/useGauges";
import { CloseIcon } from "@/lib/icons";
import { cameraMs, SPINNER_DELAY_MS } from "@/lib/motion";
import { labelSx, theme } from "@/lib/theme";
import { useTokens } from "@/lib/useTokens";
import { DonutCluster } from "./DonutCluster";
import { gaugeStates, stateMeta } from "./gaugeStates";
import { groupByProximity, type MapGroup } from "./groupByProximity";
import { toFeatureCollection } from "./toFeatureCollection";

const SOURCE_ID = "gauge-points-src";
const POINT_LAYER = "gauge-points";

interface ClusterInfo {
  id: number;
  lng: number;
  lat: number;
  total: number;
  counts: Record<GaugeMapState, number>;
}

/** Read-only coverage map: points colored by state (used/fetched/available),
 * clustered into donut charts; legend rows toggle each state. */
export default function GaugeCatalogMap() {
  const tokens = useTokens();
  const states = useMemo(() => gaugeStates(tokens), [tokens]);
  const mapRef = useRef<MapRef>(null);
  const { data: points, isLoading, isError, error, refetch } = useGaugeMap();
  const [mapLoaded, setMapLoaded] = useState(false);
  useCalmBaseMap(mapRef, mapLoaded, true, "liberty");
  const [hidden, setHidden] = useState<Set<GaugeMapState>>(new Set());
  const [selected, setSelected] = useState<MapGroup | null>(null);
  // On a phone the legend starts folded to a chip so it does not cover the map.
  const phone = !useMediaQuery(theme.breakpoints.up("md"));
  const [legendOpen, setLegendOpen] = useState<boolean | null>(null);
  const noData = isError || (!isLoading && !points?.length);
  const expanded = legendOpen ?? !phone;
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  // Signature of the last cluster set, so frequent render events only trigger a
  // React update when the clusters actually changed.
  const lastSig = useRef("");

  // Merge points within ~250m into one marker (same station, many providers).
  const groups = useMemo(() => groupByProximity(points ?? []), [points]);
  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );

  const counts = useMemo(() => {
    const c: Record<GaugeMapState, number> = {
      used: 0,
      fetched: 0,
      available: 0,
    };
    for (const g of groups) c[g.state] += 1;
    return c;
  }, [groups]);

  const data = useMemo(
    () => toFeatureCollection(groups.filter((g) => !hidden.has(g.state))),
    [groups, hidden],
  );

  // Re-read the clusters MapLibre generated for the current viewport, with the
  // per-state tallies from `clusterProperties`, and drive the donut markers.
  // Only called on load/idle (gesture settled), never mid-pan/zoom -
  // querySourceFeatures is too expensive to run on every render frame.
  const refreshClusters = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Skip until the source exists and has (re)clustered for the current view.
    if (!map.getSource(SOURCE_ID) || !map.isSourceLoaded(SOURCE_ID)) return;
    const feats = map.querySourceFeatures(SOURCE_ID, {
      filter: ["has", "point_count"],
    });
    const seen = new Set<number>();
    const next: ClusterInfo[] = [];
    for (const f of feats) {
      const p = f.properties as Record<string, number>;
      if (seen.has(p.cluster_id)) continue;
      seen.add(p.cluster_id);
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      next.push({
        id: p.cluster_id,
        lng,
        lat,
        total: p.point_count,
        counts: {
          used: p.used ?? 0,
          fetched: p.fetched ?? 0,
          available: p.available ?? 0,
        },
      });
    }
    next.sort((a, b) => a.id - b.id);
    const sig = next
      .map(
        (c) =>
          `${c.id}:${c.total}:${c.counts.used}.${c.counts.fetched}.${c.counts.available}`,
      )
      .join("|");
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    setClusters(next);
  }, []);

  const toggle = (state: GaugeMapState) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });

  const zoomToCluster = async (id: number, lng: number, lat: number) => {
    const source = mapRef.current?.getSource(SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    if (!source) return;
    const zoom = await source.getClusterExpansionZoom(id);
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [lng, lat],
      zoom,
      duration: cameraMs(screensTo(map, [lng, lat], zoom)),
      easing: cameraEasing,
    });
  };

  const handleClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.group_id as string | undefined;
    setSelected(id ? (groupsById.get(id) ?? null) : null);
  };

  return (
    <Box sx={{ position: "absolute", inset: 0 }}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 11, latitude: 47, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={LIBERTY_STYLE}
        interactiveLayerIds={[POINT_LAYER]}
        onClick={handleClick}
        onLoad={() => {
          setMapLoaded(true);
          refreshClusters();
        }}
        onIdle={refreshClusters}
      >
        <NavigationControl position="top-right" />
        <Source
          id={SOURCE_ID}
          type="geojson"
          data={data}
          cluster
          clusterRadius={42}
          clusterMaxZoom={8}
          clusterProperties={{
            used: ["+", ["case", ["==", ["get", "state"], "used"], 1, 0]],
            fetched: ["+", ["case", ["==", ["get", "state"], "fetched"], 1, 0]],
            available: [
              "+",
              ["case", ["==", ["get", "state"], "available"], 1, 0],
            ],
          }}
        >
          {/* Unclustered points, colored by state. Also keeps the source loaded
              so querySourceFeatures can read the clusters for the donuts. */}
          <Layer
            id={POINT_LAYER}
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                5,
                3,
                12,
                6,
              ],
              "circle-color": [
                "match",
                ["get", "state"],
                "used",
                tokens.success,
                "fetched",
                tokens.gaugeTracked,
                tokens.gaugeUntracked,
              ],
              "circle-stroke-width": 1,
              "circle-stroke-color": tokens.surface,
            }}
          />
          {/* Gauge names, once zoomed in. Collision detection hides overlaps
              so dense areas stay legible. */}
          <Layer
            id="gauge-labels"
            type="symbol"
            filter={["!", ["has", "point_count"]]}
            minzoom={9}
            layout={{
              // River as the headline, then "(provider · name)" behind it for
              // context. Falls back to the name, then "provider id", and never
              // repeats a value that is already the headline.
              "text-field": [
                "concat",
                [
                  "case",
                  ["!=", ["get", "river"], ""],
                  ["get", "river"],
                  ["!=", ["get", "name"], ""],
                  ["get", "name"],
                  ["concat", ["get", "provider"], " ", ["get", "station_id"]],
                ],
                [
                  "case",
                  [
                    "all",
                    ["!=", ["get", "river"], ""],
                    ["!=", ["get", "name"], ""],
                  ],
                  [
                    "concat",
                    " (",
                    ["get", "provider"],
                    " · ",
                    ["get", "name"],
                    ")",
                  ],
                  [
                    "any",
                    ["!=", ["get", "river"], ""],
                    ["!=", ["get", "name"], ""],
                  ],
                  ["concat", " (", ["get", "provider"], ")"],
                  "",
                ],
              ],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-offset": [0, 0.9],
              "text-anchor": "top",
              "text-allow-overlap": false,
              "text-optional": true,
            }}
            paint={{
              "text-color": tokens.mapLabelText,
              "text-halo-color": tokens.mapLabelHalo,
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        {clusters.map((c) => (
          <AccessibleMarker
            label={`${c.total} gauges, zoom in`}
            key={c.id}
            longitude={c.lng}
            latitude={c.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              zoomToCluster(c.id, c.lng, c.lat);
            }}
          >
            <DonutCluster counts={c.counts} total={c.total} />
          </AccessibleMarker>
        ))}
      </MapGL>

      {/* Legend + per-state filter (bottom-left, mirrors LabelModeToggle). */}
      {!noData && (
        <Box
          data-testid="gauge-legend"
          sx={{
            position: "absolute",
            bottom: 14,
            left: 10,
            zIndex: 10,
            width: expanded ? 250 : "auto",
            maxWidth: "calc(100% - 20px)",
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e2,
            overflow: "hidden",
            display: "grid",
            gap: "10px",
            p: expanded ? "12px 14px" : 0,
          }}
        >
          {phone && !expanded ? (
            <ButtonBase
              onClick={() => setLegendOpen(true)}
              aria-expanded={false}
              sx={{
                gap: 1,
                px: 1.5,
                minHeight: tokens.touch.min,
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Gauges
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {states.map((s) => (
                  <Box
                    key={s.key}
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: s.color,
                    }}
                  />
                ))}
              </Box>
            </ButtonBase>
          ) : (
            <>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Typography
                  sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 700 }}
                >
                  Gauges
                </Typography>
                {phone && (
                  <IconButton
                    aria-label="Fold the legend"
                    aria-expanded
                    onClick={() => setLegendOpen(false)}
                    sx={{
                      m: -1.5,
                      width: tokens.touch.min,
                      height: tokens.touch.min,
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
              {states.map((s) => {
                const off = hidden.has(s.key);
                return (
                  <ButtonBase
                    key={s.key}
                    onClick={() => toggle(s.key)}
                    title={`Click to ${off ? "show" : "hide"}`}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      width: "100%",
                      minHeight: tokens.touch.min,
                      textAlign: "left",
                      opacity: off ? 0.45 : 1,
                    }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: s.color,
                        flexShrink: 0,
                        mt: "5px",
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{ display: "flex", alignItems: "baseline", gap: 1 }}
                      >
                        <Typography
                          sx={{
                            flex: 1,
                            fontSize: "0.875rem",
                            lineHeight: "20px",
                            fontWeight: 600,
                          }}
                        >
                          {s.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            color: tokens.onSurfaceVariant,
                          }}
                        >
                          {counts[s.key].toLocaleString()}
                        </Typography>
                      </Box>
                      <Typography
                        sx={{
                          fontSize: "0.8125rem",
                          lineHeight: "18px",
                          color: tokens.onSurfaceVariant,
                        }}
                      >
                        {s.help}
                      </Typography>
                    </Box>
                  </ButtonBase>
                );
              })}
            </>
          )}
        </Box>
      )}

      {/* Detail card: the merged location and every gauge reported there. */}
      {selected && (
        <Box
          sx={{
            position: "absolute",
            top: 14,
            left: 10,
            zIndex: 11,
            width: 270,
            maxWidth: "calc(100% - 20px)",
            maxHeight: "calc(100% - 28px)",
            overflowY: "auto",
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e2,
            p: 1.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ wordBreak: "break-word" }}>
                {selected.river || selected.name || selected.station_id}
              </Typography>
              <Typography sx={{ ...labelSx, display: "block" }}>
                {selected.members.length > 1
                  ? `${selected.members.length} gauges here`
                  : "1 gauge"}
              </Typography>
            </Box>
            <IconButton
              onClick={() => setSelected(null)}
              sx={{
                mt: -1.5,
                mr: -1.5,
                width: tokens.touch.min,
                height: tokens.touch.min,
              }}
              aria-label="Close"
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </Box>

          <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            {selected.members.map((m) => {
              const meta = stateMeta(states, m.state);
              return (
                <Box
                  key={`${m.provider}:${m.station_id}`}
                  sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: meta.color,
                      flexShrink: 0,
                      mt: 0.4,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{ wordBreak: "break-word" }}
                    >
                      {m.name || m.river || m.station_id}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{ display: "block" }}
                    >
                      {m.provider} · {meta.label}
                      {m.params && m.params.length > 0
                        ? ` · ${m.params.join(", ")}`
                        : ""}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {isLoading && (
        <Box
          sx={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 1,
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.pill}px`,
            boxShadow: tokens.elevation.e2,
            px: 1.5,
            py: 0.75,
            animation: `pm-spinner-in ${theme.tokens.motion.fast}ms ${theme.tokens.motion.easeOut} ${SPINNER_DELAY_MS}ms backwards`,
            "@keyframes pm-spinner-in": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
        >
          <CircularProgress size={16} />
          <Typography variant="caption">Loading gauges…</Typography>
        </Box>
      )}
      {isError && (
        <GaugeMapNote>
          <ErrorState
            error={error}
            fallback="Could not load the gauge map."
            onRetry={() => refetch()}
          />
        </GaugeMapNote>
      )}
      {!isLoading && !isError && groups.length === 0 && (
        <GaugeMapNote>
          <EmptyState
            title="No gauges to show"
            caption="None are mapped yet."
          />
        </GaugeMapNote>
      )}
    </Box>
  );
}

/** A state note floating over the map: the map has nothing to show, so the
 * legend gives way to it. */
function GaugeMapNote({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10,
        width: "min(320px, calc(100% - 32px))",
        bgcolor: theme.tokens.surface,
        borderRadius: `${theme.tokens.radii.md}px`,
        boxShadow: theme.tokens.elevation.e2,
      }}
    >
      {children}
    </Box>
  );
}
