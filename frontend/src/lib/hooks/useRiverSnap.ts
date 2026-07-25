import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BoundingBox,
  type Coordinate,
  distanceInMeters,
  distanceToLineInMeters,
  fetchOsmNetworkAroundLine,
  fetchOsmRiverWays,
  nearestPointOnLine,
  routeSection,
  snapSection,
  stitchWays,
} from "@/lib/riverSnap";

/** Snap pipeline state - `searching` is the river lookup, `routing` the
 * confluence-crossing stage. */
export type RiverSnapStatus =
  | "idle"
  | "searching"
  | "routing"
  | "done"
  | "failed";

/** State of the river-course preview lookup (runs before points are picked). */
export type RiverLookupStatus =
  | "idle"
  | "zoomed-out"
  | "searching"
  | "found"
  | "not-found";

/**
 * A point further than this (m) from the named river is treated as lying on
 * another river - triggers routing through the waterway network.
 */
const ON_RIVER_THRESHOLD_METERS = 150;

/** Don't look up the river preview when the viewport spans more than this. */
const MAX_PREVIEW_SPAN_DEGREES = 2;

type GeoPoint = { lat: number; lon: number };

interface NamedRiverCache {
  waterwayName: string;
  boundingBox: BoundingBox;
  ways: Coordinate[][];
}

interface RiverNetworkCache {
  waterwayName: string;
  /** Corridor the network was fetched for: `radiusMeters` around `line`. */
  line: Coordinate[];
  radiusMeters: number;
  ways: Coordinate[][];
}

/**
 * Bounding box around both points, padded by half the larger span (the river
 * can bow far out of the raw point box) but at least ~5 km. Name-filtered
 * Overpass queries stay cheap even for large boxes.
 */
function paddedBoundingBox(a: GeoPoint, b: GeoPoint): BoundingBox {
  const latitudeSpan = Math.abs(a.lat - b.lat);
  const longitudeSpan =
    Math.abs(a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180);
  const padding = Math.max(0.05, 0.5 * Math.max(latitudeSpan, longitudeSpan));
  return {
    south: Math.min(a.lat, b.lat) - padding,
    north: Math.max(a.lat, b.lat) + padding,
    west: Math.min(a.lon, b.lon) - padding,
    east: Math.max(a.lon, b.lon) + padding,
  };
}

function boundingBoxContains(box: BoundingBox, point: GeoPoint): boolean {
  // Margin so points near the edge force a refetch
  const margin = 0.02;
  return (
    point.lat >= box.south + margin &&
    point.lat <= box.north - margin &&
    point.lon >= box.west + margin &&
    point.lon <= box.east - margin
  );
}

function boundingBoxContainsBox(
  outer: BoundingBox,
  inner: BoundingBox,
): boolean {
  return (
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

/**
 * Snaps a put-in/take-out pair to the OSM riverbed of the given waterway.
 *
 * While points are missing, the hook looks up the river course for the
 * current map view (`viewBounds`) so the user sees where to place them -
 * exposed as `river` / `riverLookup`. Once both points are set: stage 1
 * fetches the named river and extracts the part between the points; stage 2,
 * when a point lies off the named river (take-out downstream of a
 * confluence, e.g. Ötztaler Ache → Inn), fetches the rivers connecting it
 * and routes through the combined network. Overpass responses are cached
 * while the points stay inside the fetched region.
 */
export function useRiverSnap(
  waterwayName: string,
  putIn: GeoPoint | null,
  takeOut: GeoPoint | null,
  viewBounds?: BoundingBox | null,
): {
  status: RiverSnapStatus;
  snappedCoords: Coordinate[] | null;
  /** The named river's course, for highlighting on the map. */
  river: Coordinate[] | null;
  riverLookup: RiverLookupStatus;
  /** True when the snapped line continues onto another river. */
  crossedConfluence: boolean;
  retry: () => void;
} {
  const [status, setStatus] = useState<RiverSnapStatus>("idle");
  const [snappedCoords, setSnappedCoords] = useState<Coordinate[] | null>(null);
  const [river, setRiver] = useState<Coordinate[] | null>(null);
  const [riverLookup, setRiverLookup] = useState<RiverLookupStatus>("idle");
  const [crossedConfluence, setCrossedConfluence] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const namedRiverCache = useRef<NamedRiverCache | null>(null);
  const networkCache = useRef<RiverNetworkCache | null>(null);
  /** Which cache entry the `river` state was stitched from, to avoid
   * recomputing it on every map move. */
  const stitchedFrom = useRef<NamedRiverCache | null>(null);

  const retry = useCallback(() => {
    namedRiverCache.current = null;
    networkCache.current = null;
    setRetryToken((token) => token + 1);
  }, []);

  // River-course preview: look up the river for the current map view
  // while the user hasn't picked both points yet
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryToken re-triggers the lookup after the caches were cleared
  useEffect(() => {
    if (!waterwayName) {
      setRiver(null);
      setRiverLookup("idle");
      return;
    }
    if (putIn && takeOut) return; // the snap effect owns the data now
    if (!viewBounds) return;

    const cached = namedRiverCache.current;
    if (
      cached &&
      cached.waterwayName === waterwayName &&
      boundingBoxContainsBox(cached.boundingBox, viewBounds)
    ) {
      if (stitchedFrom.current !== cached) {
        stitchedFrom.current = cached;
        const stitched = stitchWays(cached.ways);
        setRiver(stitched);
        setRiverLookup(stitched ? "found" : "not-found");
      }
      return;
    }

    const viewSpan = Math.max(
      viewBounds.north - viewBounds.south,
      viewBounds.east - viewBounds.west,
    );
    if (viewSpan > MAX_PREVIEW_SPAN_DEGREES) {
      // Keep an already-found course; only hint when there's nothing yet
      setRiverLookup((current) =>
        current === "found" ? current : "zoomed-out",
      );
      return;
    }

    const controller = new AbortController();
    // Debounce so panning doesn't fire a request per move
    const timer = setTimeout(async () => {
      setRiverLookup("searching");
      // Fetch well beyond the viewport so panning keeps hitting the cache -
      // Overpass allows very few requests per IP, so every saved one counts
      const padding = viewSpan;
      const fetchBox: BoundingBox = {
        south: viewBounds.south - padding,
        north: viewBounds.north + padding,
        west: viewBounds.west - padding,
        east: viewBounds.east + padding,
      };
      try {
        const ways = await fetchOsmRiverWays(
          waterwayName,
          fetchBox,
          controller.signal,
        );
        const entry = { waterwayName, boundingBox: fetchBox, ways };
        namedRiverCache.current = entry;
        stitchedFrom.current = entry;
        const stitched = stitchWays(ways);
        setRiver(stitched);
        setRiverLookup(stitched ? "found" : "not-found");
      } catch {
        if (!controller.signal.aborted) setRiverLookup("not-found");
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [waterwayName, viewBounds, putIn, takeOut, retryToken]);

  // Snap pipeline: runs once both points are picked
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryToken re-triggers the fetch after the caches were cleared
  useEffect(() => {
    if (!putIn || !takeOut || !waterwayName) {
      setStatus("idle");
      setSnappedCoords(null);
      setCrossedConfluence(false);
      return;
    }

    const currentPutIn = putIn;
    const currentTakeOut = takeOut;
    const controller = new AbortController();

    async function run() {
      setStatus("searching");

      // Stage 1: named river
      const cachedNamed = namedRiverCache.current;
      let named =
        cachedNamed &&
        cachedNamed.waterwayName === waterwayName &&
        boundingBoxContains(cachedNamed.boundingBox, currentPutIn) &&
        boundingBoxContains(cachedNamed.boundingBox, currentTakeOut)
          ? cachedNamed
          : null;

      if (!named) {
        const boundingBox = paddedBoundingBox(currentPutIn, currentTakeOut);
        try {
          const ways = await fetchOsmRiverWays(
            waterwayName,
            boundingBox,
            controller.signal,
          );
          named = { waterwayName, boundingBox, ways };
          namedRiverCache.current = named;
        } catch {
          if (!controller.signal.aborted) {
            setStatus("failed");
            setSnappedCoords(null);
          }
          return;
        }
      }

      const namedRiver = stitchWays(named.ways);
      if (!controller.signal.aborted) {
        stitchedFrom.current = named;
        setRiver(namedRiver);
        setRiverLookup(namedRiver ? "found" : "not-found");
      }
      let coords = namedRiver
        ? snapSection(namedRiver, currentPutIn, currentTakeOut)
        : null;
      let viaNetwork = false;

      const putInCoordinate: Coordinate = [currentPutIn.lon, currentPutIn.lat];
      const takeOutCoordinate: Coordinate = [
        currentTakeOut.lon,
        currentTakeOut.lat,
      ];
      const bothPointsOnNamedRiver =
        namedRiver != null &&
        distanceToLineInMeters(namedRiver, putInCoordinate) <=
          ON_RIVER_THRESHOLD_METERS &&
        distanceToLineInMeters(namedRiver, takeOutCoordinate) <=
          ON_RIVER_THRESHOLD_METERS;

      // Stage 2: a point sits on another river past a confluence -
      // fetch the connecting rivers and route through the network
      if (!bothPointsOnNamedRiver) {
        setStatus("routing");
        // The named river itself is already part of the routing graph, so
        // the corridor only needs to cover the connectors between it and
        // the off-river points (or the straight line between the points
        // when the named river wasn't found at all). Keeping the corridor
        // short keeps the Overpass query fast.
        const corridor: Coordinate[] = namedRiver
          ? [
              putInCoordinate,
              nearestPointOnLine(namedRiver, putInCoordinate),
              nearestPointOnLine(namedRiver, takeOutCoordinate),
              takeOutCoordinate,
            ]
          : [putInCoordinate, takeOutCoordinate];
        // Wide enough for the connecting river to bow off the straight
        // connector, narrow enough to keep Overpass fast
        const connectorMeters = namedRiver
          ? Math.max(
              distanceToLineInMeters(namedRiver, putInCoordinate),
              distanceToLineInMeters(namedRiver, takeOutCoordinate),
            )
          : distanceInMeters(putInCoordinate, takeOutCoordinate);
        const radiusMeters = Math.min(
          20_000,
          Math.max(5_000, 0.35 * connectorMeters),
        );

        const cachedNetwork = networkCache.current;
        let network =
          cachedNetwork &&
          cachedNetwork.waterwayName === waterwayName &&
          distanceToLineInMeters(cachedNetwork.line, putInCoordinate) <=
            cachedNetwork.radiusMeters - 1000 &&
          distanceToLineInMeters(cachedNetwork.line, takeOutCoordinate) <=
            cachedNetwork.radiusMeters - 1000
            ? cachedNetwork
            : null;

        if (!network) {
          try {
            const ways = await fetchOsmNetworkAroundLine(
              corridor,
              radiusMeters,
              controller.signal,
            );
            network = { waterwayName, line: corridor, radiusMeters, ways };
            networkCache.current = network;
          } catch {
            network = null;
            if (controller.signal.aborted) return;
          }
        }

        // Without a route the named-river snap would clamp at the
        // confluence and silently draw a wrong line - report failure
        // instead so the UI offers the straight line and a retry.
        const routed = network
          ? routeSection(
              [...named.ways, ...network.ways],
              currentPutIn,
              currentTakeOut,
            )
          : null;
        coords = routed;
        viaNetwork = routed != null;
      }

      if (controller.signal.aborted) return;
      setCrossedConfluence(viaNetwork);
      if (coords) {
        setStatus("done");
        setSnappedCoords(coords);
      } else {
        setStatus("failed");
        setSnappedCoords(null);
      }
    }

    run();
    return () => controller.abort();
  }, [putIn, takeOut, waterwayName, retryToken]);

  return {
    status,
    snappedCoords,
    river,
    riverLookup,
    crossedConfluence,
    retry,
  };
}
