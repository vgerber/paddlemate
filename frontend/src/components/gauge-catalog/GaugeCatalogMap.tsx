import "@/components/map/maplibre.css";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import MapGL, { NavigationControl } from "react-map-gl/maplibre";
import { LIBERTY_STYLE } from "@/components/map/mapStyles";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import { theme } from "@/lib/theme";
import ClusterMarker from "./ClusterMarker";
import { DonutCluster } from "./DonutCluster";
import GaugeDetailCard from "./GaugeDetailCard";
import GaugeLayers from "./GaugeLayers";
import GaugeLegend from "./GaugeLegend";
import { GaugeMapLoading, GaugeMapNote } from "./GaugeMapStatus";
import { POINT_LAYER, useGaugeCatalogMap } from "./useGaugeCatalogMap";

/** Read-only coverage map: points colored by state (used/fetched/available),
 * clustered into donut charts; legend rows toggle each state. */
export default function GaugeCatalogMap() {
  const m = useGaugeCatalogMap();
  // On a phone the legend starts folded to a chip so it does not cover the map.
  const phone = !useMediaQuery(theme.breakpoints.up("md"));
  const [legendOpen, setLegendOpen] = useState<boolean | null>(null);
  const expanded = legendOpen ?? !phone;

  return (
    <Box sx={{ position: "absolute", inset: 0 }}>
      <MapGL
        ref={m.mapRef}
        initialViewState={{ longitude: 11, latitude: 47, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={LIBERTY_STYLE}
        interactiveLayerIds={[POINT_LAYER]}
        onClick={m.onMapClick}
        onLoad={m.onLoad}
        onIdle={m.refreshClusters}
      >
        <NavigationControl position="top-right" />
        <GaugeLayers data={m.data} />
        {m.clusters.map((c) => (
          <ClusterMarker
            label={`${c.total} gauges, zoom in`}
            key={c.id}
            longitude={c.lng}
            latitude={c.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              m.zoomToCluster(c.id, c.lng, c.lat);
            }}
          >
            <DonutCluster counts={c.counts} total={c.total} />
          </ClusterMarker>
        ))}
      </MapGL>

      {!m.noData && (
        <GaugeLegend
          states={m.states}
          counts={m.counts}
          hidden={m.hidden}
          onToggle={m.toggle}
          phone={phone}
          expanded={expanded}
          onExpand={setLegendOpen}
        />
      )}
      {m.selected && (
        <GaugeDetailCard
          selected={m.selected}
          states={m.states}
          onClose={m.closeSelected}
        />
      )}
      {m.isLoading && <GaugeMapLoading />}
      {m.isError && (
        <GaugeMapNote>
          <ErrorState
            error={m.error}
            fallback="Could not load the gauge map."
            onRetry={() => m.refetch()}
          />
        </GaugeMapNote>
      )}
      {!m.isLoading && !m.isError && m.isEmpty && (
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
