import type { GeoJSONSource } from "maplibre-gl";
import { useCallback, useMemo, useRef, useState } from "react";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import { cameraEasing, screensTo } from "@/components/map/cameraMotion";
import { useCalmBaseMap } from "@/components/map/useMutedBaseMap";
import type { GaugeMapState } from "@/lib/api";
import { useGaugeMap } from "@/lib/hooks/useGauges";
import { cameraMs } from "@/lib/motion";
import { useTokens } from "@/lib/useTokens";
import {
  type ClusterFeature,
  type ClusterInfo,
  clusterSignature,
  clustersOf,
  countByState,
  toggled,
} from "./clusters";
import { gaugeStates } from "./gaugeStates";
import { groupByProximity, type MapGroup } from "./groupByProximity";
import { toFeatureCollection } from "./toFeatureCollection";

export const SOURCE_ID = "gauge-points-src";
export const POINT_LAYER = "gauge-points";

/** State of the coverage map: the grouped points, the legend filter, the open
 * location and the donut clusters read back from the map. */
export function useGaugeCatalogMap() {
  const tokens = useTokens();
  const states = useMemo(() => gaugeStates(tokens), [tokens]);
  const mapRef = useRef<MapRef>(null);
  const { data: points, isLoading, isError, error, refetch } = useGaugeMap();
  const [mapLoaded, setMapLoaded] = useState(false);
  useCalmBaseMap(mapRef, mapLoaded, true, "liberty");
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
  const counts = useMemo(() => countByState(groups), [groups]);
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
    const next = clustersOf(feats as unknown as ClusterFeature[]);
    const sig = clusterSignature(next);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    setClusters(next);
  }, []);

  const onLoad = () => {
    setMapLoaded(true);
    refreshClusters();
  };

  const toggle = (state: GaugeMapState) =>
    setHidden((prev) => toggled(prev, state));

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

  const onMapClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.group_id as string | undefined;
    setSelected(id ? (groupsById.get(id) ?? null) : null);
  };

  return {
    mapRef,
    states,
    isLoading,
    isError,
    error,
    refetch,
    noData: isError || (!isLoading && !points?.length),
    isEmpty: groups.length === 0,
    hidden,
    toggle,
    counts,
    data,
    clusters,
    selected,
    closeSelected: () => setSelected(null),
    onLoad,
    refreshClusters,
    onMapClick,
    zoomToCluster,
  };
}
