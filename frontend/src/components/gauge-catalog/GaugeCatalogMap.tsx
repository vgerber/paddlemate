import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { GeoJSONSource } from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { LIBERTY_STYLE } from "@/components/map/mapStyles";
import type { GaugeMapState } from "@/lib/api";
import { useGaugeMap } from "@/lib/hooks/useGauges";
import { labelSx, theme } from "@/lib/theme";
import {
  type GaugePointProperties,
  toFeatureCollection,
} from "./toFeatureCollection";

const { tokens } = theme;

const SOURCE_ID = "gauge-points-src";
const CLUSTER_LAYER = "gauge-clusters";
const POINT_LAYER = "gauge-points";

const STATES: {
  key: GaugeMapState;
  label: string;
  color: string;
  help: string;
}[] = [
  {
    key: "used",
    label: "Used",
    color: tokens.tertiary,
    help: "Linked to a section",
  },
  {
    key: "fetched",
    label: "Fetched",
    color: tokens.primary,
    help: "Polled, not linked yet",
  },
  {
    key: "available",
    label: "Available",
    color: tokens.outline,
    help: "In the catalog, not fetched yet",
  },
];

const stateMeta = (state: GaugeMapState) =>
  STATES.find((s) => s.key === state) ?? STATES[2];

/** A read-only coverage map of every gauge, clustered and colored by state:
 * used (linked to a section), fetched (polled but unlinked) or available (a
 * catalog station not yet fetched). Legend rows toggle a state on and off,
 * which re-clusters so the color signal survives clustering. */
export default function GaugeCatalogMap() {
  const mapRef = useRef<MapRef>(null);
  const { data: points, isLoading, isError } = useGaugeMap();
  const [hidden, setHidden] = useState<Set<GaugeMapState>>(new Set());
  const [selected, setSelected] = useState<GaugePointProperties | null>(null);

  const counts = useMemo(() => {
    const c: Record<GaugeMapState, number> = {
      used: 0,
      fetched: 0,
      available: 0,
    };
    for (const p of points ?? []) c[p.state] += 1;
    return c;
  }, [points]);

  const data = useMemo(
    () =>
      toFeatureCollection((points ?? []).filter((p) => !hidden.has(p.state))),
    [points, hidden],
  );

  const toggle = (state: GaugeMapState) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });

  const handleClick = async (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) {
      setSelected(null);
      return;
    }
    // A cluster bubble: zoom to where it breaks apart.
    if (feature.properties?.cluster) {
      const source = mapRef.current?.getSource(SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!source) return;
      const zoom = await source.getClusterExpansionZoom(
        feature.properties.cluster_id as number,
      );
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      mapRef.current?.easeTo({ center: [lng, lat], zoom, duration: 500 });
      return;
    }
    setSelected(feature.properties as GaugePointProperties);
  };

  return (
    <Box sx={{ position: "absolute", inset: 0 }}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 11, latitude: 47, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={LIBERTY_STYLE}
        interactiveLayerIds={[CLUSTER_LAYER, POINT_LAYER]}
        onClick={handleClick}
      >
        <NavigationControl position="top-right" />
        <Source
          id={SOURCE_ID}
          type="geojson"
          data={data}
          cluster
          clusterRadius={50}
          clusterMaxZoom={12}
        >
          <Layer
            id={CLUSTER_LAYER}
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": tokens.outlineVariant,
              "circle-opacity": 0.9,
              "circle-radius": [
                "step",
                ["get", "point_count"],
                14,
                100,
                18,
                1000,
                24,
              ],
              "circle-stroke-width": 1,
              "circle-stroke-color": tokens.background,
            }}
          />
          <Layer
            id="gauge-cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 12,
            }}
            paint={{ "text-color": tokens.onSurface }}
          />
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
        </Source>
      </MapGL>

      {/* Legend + per-state filter (bottom-left, mirrors LabelModeToggle). */}
      <Box
        sx={{
          position: "absolute",
          bottom: 14,
          left: 10,
          zIndex: 10,
          minWidth: 168,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          overflow: "hidden",
        }}
      >
        <Typography sx={{ ...labelSx, display: "block", px: 1.25, pt: 0.75 }}>
          Coverage
        </Typography>
        {STATES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <ButtonBase
              key={s.key}
              onClick={() => toggle(s.key)}
              title={`${s.help} - click to ${off ? "show" : "hide"}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
                px: 1.25,
                py: 0.6,
                opacity: off ? 0.4 : 1,
              }}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  bgcolor: s.color,
                  flexShrink: 0,
                }}
              />
              <Typography variant="caption" sx={{ flex: 1, textAlign: "left" }}>
                {s.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {counts[s.key].toLocaleString()}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>

      {/* Detail card for a clicked point (top-left, clear of the nav control). */}
      {selected && (
        <Box
          sx={{
            position: "absolute",
            top: 14,
            left: 10,
            zIndex: 11,
            width: 240,
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
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: stateMeta(selected.state).color,
                  flexShrink: 0,
                }}
              />
              <Typography sx={labelSx}>
                {stateMeta(selected.state).label}
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
          <Typography
            variant="subtitle2"
            sx={{ mt: 0.5, wordBreak: "break-word" }}
          >
            {selected.name || selected.station_id}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {selected.provider}
            {selected.river ? ` · ${selected.river}` : ""}
          </Typography>
          {selected.params && (
            <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
              Measurements: {selected.params}
            </Typography>
          )}
          {selected.state === "available" && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5 }}
            >
              Not yet fetched - link it to a section to start collecting data.
            </Typography>
          )}
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
