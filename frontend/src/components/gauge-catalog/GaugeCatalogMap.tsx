import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { GeoJSONSource } from "maplibre-gl";
import { useCallback, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { LIBERTY_STYLE } from "@/components/map/mapStyles";
import type { GaugeMapState } from "@/lib/api";
import { useGaugeMap } from "@/lib/hooks/useGauges";
import { labelSx, theme } from "@/lib/theme";
import { groupByProximity, type MapGroup } from "./groupByProximity";
import { toFeatureCollection } from "./toFeatureCollection";

const { tokens } = theme;

const SOURCE_ID = "gauge-points-src";
const POINT_LAYER = "gauge-points";

const STATES: {
  key: GaugeMapState;
  label: string;
  color: string;
  help: string;
}[] = [
  {
    key: "used",
    label: "On a section",
    color: tokens.tertiary,
    help: "Shows a run's water level",
  },
  {
    key: "fetched",
    label: "Tracked",
    color: tokens.primary,
    help: "We collect its data, but no section uses it yet",
  },
  {
    key: "available",
    label: "Untracked",
    color: tokens.outline,
    help: "A known station we don't collect yet - can be added",
  },
];

const stateMeta = (state: GaugeMapState) =>
  STATES.find((s) => s.key === state) ?? STATES[2];

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
  const mapRef = useRef<MapRef>(null);
  const { data: points, isLoading, isError } = useGaugeMap();
  const [hidden, setHidden] = useState<Set<GaugeMapState>>(new Set());
  const [selected, setSelected] = useState<MapGroup | null>(null);
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
  const refreshClusters = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Skip until the source exists (early render events fire before it is
    // added) and has (re)clustered for the current view, so we read fresh
    // clusters mid-zoom rather than stale ones.
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
    mapRef.current?.easeTo({ center: [lng, lat], zoom, duration: 500 });
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
        onLoad={refreshClusters}
        onRender={refreshClusters}
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
                tokens.tertiary,
                "fetched",
                tokens.primary,
                tokens.outline,
              ],
              "circle-stroke-width": 1,
              "circle-stroke-color": tokens.background,
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
              "text-color": tokens.white,
              "text-halo-color": tokens.mapLabelHalo,
              "text-halo-width": 1.5,
            }}
          />
        </Source>

        {clusters.map((c) => (
          <Marker
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
          </Marker>
        ))}
      </MapGL>

      {/* Legend + per-state filter (bottom-left, mirrors LabelModeToggle). */}
      <Box
        sx={{
          position: "absolute",
          bottom: 14,
          left: 10,
          zIndex: 10,
          width: 210,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          overflow: "hidden",
        }}
      >
        <Typography sx={{ ...labelSx, display: "block", px: 1.25, pt: 0.75 }}>
          Gauges
        </Typography>
        {STATES.map((s) => {
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
                px: 1.25,
                py: 0.6,
                textAlign: "left",
                opacity: off ? 0.45 : 1,
              }}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  bgcolor: s.color,
                  flexShrink: 0,
                  mt: 0.35,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{ flex: 1, fontWeight: 600 }}
                  >
                    {s.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {counts[s.key].toLocaleString()}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    fontSize: "0.62rem",
                    lineHeight: 1.25,
                  }}
                >
                  {s.help}
                </Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      {/* Detail card: the merged location and every gauge reported there. */}
      {selected && (
        <Box
          sx={{
            position: "absolute",
            top: 14,
            left: 10,
            zIndex: 11,
            width: 270,
            maxHeight: "calc(100% - 28px)",
            overflowY: "auto",
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
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
              size="small"
              onClick={() => setSelected(null)}
              sx={{ mt: -0.75, mr: -0.75 }}
              aria-label="Close"
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </Box>

          <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            {selected.members.map((m) => {
              const meta = stateMeta(m.state);
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
                      color="text.secondary"
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
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            px: 1.5,
            py: 0.75,
          }}
        >
          <CircularProgress size={16} />
          <Typography variant="caption">Loading gauges…</Typography>
        </Box>
      )}
      {isError && (
        <Box
          sx={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            px: 1.5,
            py: 0.75,
          }}
        >
          <Typography variant="caption" color="error">
            Could not load the gauge map.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/** Abbreviate a cluster total the way MapLibre's point_count_abbreviated does. */
function abbrev(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** SVG donut-arc path for a slice from `start` to `end` (both fractions of the
 * whole), centered at the origin, between inner radius `r0` and outer `r`. */
function donutSegment(
  start: number,
  end: number,
  r: number,
  r0: number,
): string {
  const a0 = 2 * Math.PI * start - Math.PI / 2;
  const a1 = 2 * Math.PI * (end - 1e-6) - Math.PI / 2;
  const x0 = Math.cos(a0);
  const y0 = Math.sin(a0);
  const x1 = Math.cos(a1);
  const y1 = Math.sin(a1);
  const large = end - start > 0.5 ? 1 : 0;
  return [
    "M",
    r0 * x0,
    r0 * y0,
    "L",
    r * x0,
    r * y0,
    "A",
    r,
    r,
    0,
    large,
    1,
    r * x1,
    r * y1,
    "L",
    r0 * x1,
    r0 * y1,
    "A",
    r0,
    r0,
    0,
    large,
    0,
    r0 * x0,
    r0 * y0,
    "Z",
  ].join(" ");
}

/** A cluster rendered as a donut: one slice per state, sized by its share, with
 * the total in the center. A single-state cluster becomes a solid ring. */
function DonutCluster({
  counts,
  total,
}: {
  counts: Record<GaugeMapState, number>;
  total: number;
}) {
  const r = total >= 1000 ? 26 : total >= 100 ? 22 : total >= 30 ? 18 : 15;
  const r0 = Math.round(r * 0.62);
  const w = r * 2;
  const segments = STATES.map((s) => ({
    key: s.key,
    color: s.color,
    value: counts[s.key],
  })).filter((s) => s.value > 0);

  let cum = 0;
  const slices = segments.map((s) => {
    const start = cum / total;
    cum += s.value;
    return { key: s.key, color: s.color, start, end: cum / total };
  });

  return (
    <svg
      width={w}
      height={w}
      viewBox={`0 0 ${w} ${w}`}
      style={{ display: "block", cursor: "pointer" }}
      aria-label={`${total} gauges`}
    >
      <title>{`${total} gauges`}</title>
      <g transform={`translate(${r}, ${r})`}>
        {slices.length === 1 ? (
          <circle r={r} fill={slices[0].color} />
        ) : (
          slices.map((s) => (
            <path
              key={s.key}
              d={donutSegment(s.start, s.end, r, r0)}
              fill={s.color}
            />
          ))
        )}
        <circle r={r0} fill={tokens.background} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={total >= 1000 ? 10 : 11}
          fontWeight={600}
          fill={tokens.onSurface}
        >
          {abbrev(total)}
        </text>
      </g>
    </svg>
  );
}
