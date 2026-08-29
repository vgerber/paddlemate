/**
 * Snap a section's put-in and take-out points onto the river course from
 * OpenStreetMap.
 *
 * Design decision: OpenStreetMap is the single source of truth for river
 * geometry - we never store river courses as our own data, only the snapped
 * line a section was authored with, as a snapshot. All OSM way geometry
 * arrives through the API (`waterwayGeometryApi`, `riverSegmentsApi`),
 * which caches it
 * server-side and talks to Overpass itself - the browser never queries
 * Overpass.
 *
 * How the snapping works:
 *
 * 1. The API delivers the waterway's OSM way fragments (many short pieces
 *    in arbitrary order).
 * 2. Stitch those fragments into one continuous polyline (`stitchWays`):
 *    grow chains where fragment endpoints touch exactly, bridge gaps of up
 *    to ~50 m (splits at weirs or renamed pieces), and keep the longest
 *    resulting chain.
 * 3. Project the put-in and take-out onto that polyline and cut out the part
 *    between them (`snapSection`).
 *
 * When a point lies on a *different* river - the take-out downstream of a
 * confluence, e.g. Ötztaler Ache → Inn - the named river can never reach it.
 * For that case `routeSection` builds a graph from all river ways in a
 * corridor along the course (fetched via `riverSegmentsApi`) and finds the
 * shortest path through the river network from put-in to take-out.
 */

/** Rough conversion at mid latitudes; fine for the distances involved here. */
const METERS_PER_DEGREE = 111_320;

/** Two way endpoints closer than this (degrees) count as the same point. */
const ENDPOINT_MATCH_EPSILON = 1e-7;

/**
 * Maximum endpoint gap (degrees, ~50 m) bridged when joining chains. Covers
 * confluences and short unnamed or renamed pieces (weirs, culverts) that
 * would otherwise break the river into disconnected chains.
 */
const MAX_BRIDGEABLE_GAP_DEGREES = 5e-4;

/** Maximum distance (m) a point may be from the network to attach to it. */
const MAX_ATTACH_DISTANCE_METERS = 300;

/** [longitude, latitude] pair, matching the GeoJSON axis order. */
export type Coordinate = [number, number];

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Approximate distance in meters between two coordinates. */
export function distanceInMeters(a: Coordinate, b: Coordinate): number {
  const cosineLatitude = Math.cos((a[1] * Math.PI) / 180);
  const deltaX = (b[0] - a[0]) * cosineLatitude;
  const deltaY = b[1] - a[1];
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY) * METERS_PER_DEGREE;
}

/** Minimum distance in meters from `point` to the polyline `line`. */
export function distanceToLineInMeters(
  line: Coordinate[],
  point: Coordinate,
): number {
  const cosineLatitude = Math.cos((point[1] * Math.PI) / 180);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    const projection = projectPointOnSegment(
      line[i],
      line[i + 1],
      point,
      cosineLatitude,
    );
    if (projection.distance < best) best = projection.distance;
  }
  return best * METERS_PER_DEGREE;
}

/** The point on polyline `line` closest to `point`. */
export function nearestPointOnLine(
  line: Coordinate[],
  point: Coordinate,
): Coordinate {
  const cosineLatitude = Math.cos((point[1] * Math.PI) / 180);
  let best: { distance: number; projected: Coordinate } = {
    distance: Number.POSITIVE_INFINITY,
    projected: line[0],
  };
  for (let i = 0; i < line.length - 1; i++) {
    const projection = projectPointOnSegment(
      line[i],
      line[i + 1],
      point,
      cosineLatitude,
    );
    if (projection.distance < best.distance) best = projection;
  }
  return best.projected;
}

/**
 * Project `point` onto the segment a–b. Longitudes are scaled by
 * cos(latitude) so distances are metric; the returned distance is in those
 * scaled degrees.
 */
function projectPointOnSegment(
  a: Coordinate,
  b: Coordinate,
  point: Coordinate,
  cosineLatitude: number,
): { distance: number; projected: Coordinate } {
  const startX = a[0] * cosineLatitude;
  const startY = a[1];
  const deltaX = b[0] * cosineLatitude - startX;
  const deltaY = b[1] - startY;
  const pointX = point[0] * cosineLatitude;
  const pointY = point[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const t =
    lengthSquared > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((pointX - startX) * deltaX + (pointY - startY) * deltaY) /
              lengthSquared,
          ),
        )
      : 0;
  const projectedX = startX + t * deltaX;
  const projectedY = startY + t * deltaY;
  return {
    distance: Math.sqrt(
      (projectedX - pointX) ** 2 + (projectedY - pointY) ** 2,
    ),
    projected: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
  };
}

/** Segment length in degrees (only used for comparisons and ratios). */
function segmentLength(a: Coordinate, b: Coordinate): number {
  const deltaX = b[0] - a[0];
  const deltaY = b[1] - a[1];
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function coordinatesMatch(a: Coordinate, b: Coordinate): boolean {
  return (
    Math.abs(a[0] - b[0]) < ENDPOINT_MATCH_EPSILON &&
    Math.abs(a[1] - b[1]) < ENDPOINT_MATCH_EPSILON
  );
}

function endpointDistance(a: Coordinate, b: Coordinate): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

// ---------------------------------------------------------------------------
// Stitching way fragments into one polyline
// ---------------------------------------------------------------------------

function chainLength(chain: Coordinate[]): number {
  let length = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    length += segmentLength(chain[i], chain[i + 1]);
  }
  return length;
}

/**
 * Greedy merge: repeatedly append or prepend fragments that share an
 * endpoint with the current chain (within `tolerance`). Consumes matched
 * fragments from `fragments`; unmatched ones are left behind. When
 * `tolerance` allows a real gap, both joint vertices are kept, forming a
 * small connector segment across it.
 */
function growChain(
  seed: Coordinate[],
  fragments: Coordinate[][],
  tolerance: number,
): Coordinate[] {
  let chain = seed;
  let changed = true;
  while (changed && fragments.length > 0) {
    changed = false;
    for (let i = 0; i < fragments.length; i++) {
      const fragment = fragments[i];
      const chainHead = chain[0];
      const chainTail = chain[chain.length - 1];
      const fragmentHead = fragment[0];
      const fragmentTail = fragment[fragment.length - 1];

      if (endpointDistance(chainTail, fragmentHead) <= tolerance) {
        chain = [
          ...chain,
          ...fragment.slice(coordinatesMatch(chainTail, fragmentHead) ? 1 : 0),
        ];
      } else if (endpointDistance(chainTail, fragmentTail) <= tolerance) {
        const reversed = [...fragment].reverse();
        chain = [
          ...chain,
          ...reversed.slice(coordinatesMatch(chainTail, fragmentTail) ? 1 : 0),
        ];
      } else if (endpointDistance(chainHead, fragmentTail) <= tolerance) {
        chain = [
          ...fragment,
          ...chain.slice(coordinatesMatch(chainHead, fragmentTail) ? 1 : 0),
        ];
      } else if (endpointDistance(chainHead, fragmentHead) <= tolerance) {
        const reversed = [...fragment].reverse();
        chain = [
          ...reversed,
          ...chain.slice(coordinatesMatch(chainHead, fragmentHead) ? 1 : 0),
        ];
      } else {
        continue;
      }

      fragments.splice(i, 1);
      changed = true;
      break;
    }
  }
  return chain;
}

/**
 * Stitch way fragments into the longest continuous polyline:
 *
 *   1. Grow chains from exactly touching fragments until all are consumed.
 *   2. Bridge small gaps (< ~50 m) between the chains - OSM rivers are often
 *      interrupted at confluences by splits, renames or unnamed pieces.
 *   3. Return the geographically longest chain.
 */
export function stitchWays(ways: Coordinate[][]): Coordinate[] | null {
  if (ways.length === 0) return null;

  const fragments = ways.map((way) => [...way]);
  const chains: Coordinate[][] = [];
  while (fragments.length > 0) {
    const seed = fragments.shift();
    if (!seed) break;
    chains.push(growChain(seed, fragments, ENDPOINT_MATCH_EPSILON));
  }

  const merged: Coordinate[][] = [];
  while (chains.length > 0) {
    const seed = chains.shift();
    if (!seed) break;
    merged.push(growChain(seed, chains, MAX_BRIDGEABLE_GAP_DEGREES));
  }

  let longest: Coordinate[] | null = null;
  let longestLength = 0;
  for (const chain of merged) {
    const length = chainLength(chain);
    if (chain.length >= 2 && length > longestLength) {
      longest = chain;
      longestLength = length;
    }
  }
  return longest;
}

// ---------------------------------------------------------------------------
// Snapping onto a single river
// ---------------------------------------------------------------------------

/**
 * Project `putIn` and `takeOut` onto `river`, then return the part of the
 * river between them (put-in first, take-out last). Returns `null` if the
 * two points are too close together on the line.
 */
export function snapSection(
  river: Coordinate[],
  putIn: { lat: number; lon: number },
  takeOut: { lat: number; lon: number },
): Coordinate[] | null {
  const putInPosition = normalizedPositionOnLine(river, [putIn.lon, putIn.lat]);
  const takeOutPosition = normalizedPositionOnLine(river, [
    takeOut.lon,
    takeOut.lat,
  ]);
  if (Math.abs(putInPosition - takeOutPosition) < 0.001) return null;

  const section = extractLineBetween(
    river,
    Math.min(putInPosition, takeOutPosition),
    Math.max(putInPosition, takeOutPosition),
  );
  if (!section) return null;

  // Ensure direction matches put-in → take-out
  return putInPosition <= takeOutPosition ? section : [...section].reverse();
}

/**
 * Return the normalized position [0..1] along `line` of the point on it
 * closest to `point`.
 */
function normalizedPositionOnLine(
  line: Coordinate[],
  point: Coordinate,
): number {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestPosition = 0;
  let traveled = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const deltaX = b[0] - a[0];
    const deltaY = b[1] - a[1];
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const length = Math.sqrt(lengthSquared);

    const t =
      lengthSquared > 0
        ? Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * deltaX + (point[1] - a[1]) * deltaY) /
                lengthSquared,
            ),
          )
        : 0;

    const projectedX = a[0] + t * deltaX;
    const projectedY = a[1] + t * deltaY;
    const distanceSquared =
      (projectedX - point[0]) ** 2 + (projectedY - point[1]) ** 2;

    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestPosition = traveled + t * length;
    }
    traveled += length;
  }

  return traveled > 0 ? bestPosition / traveled : 0;
}

/**
 * Extract the portion of `line` between the normalized positions
 * `startFraction` and `endFraction` (start < end, both in [0..1]).
 */
function extractLineBetween(
  line: Coordinate[],
  startFraction: number,
  endFraction: number,
): Coordinate[] | null {
  const cumulativeLengths: number[] = [0];
  for (let i = 0; i < line.length - 1; i++) {
    cumulativeLengths.push(
      cumulativeLengths[i] + segmentLength(line[i], line[i + 1]),
    );
  }
  const totalLength = cumulativeLengths[cumulativeLengths.length - 1];
  if (totalLength === 0) return null;

  const startDistance = startFraction * totalLength;
  const endDistance = endFraction * totalLength;
  const result: Coordinate[] = [];

  for (let i = 0; i < line.length - 1; i++) {
    const segmentStart = cumulativeLengths[i];
    const segmentEnd = cumulativeLengths[i + 1];
    const length = segmentEnd - segmentStart;

    // Interpolated start point
    if (segmentStart <= startDistance && startDistance < segmentEnd) {
      const t = length > 0 ? (startDistance - segmentStart) / length : 0;
      result.push([
        line[i][0] + t * (line[i + 1][0] - line[i][0]),
        line[i][1] + t * (line[i + 1][1] - line[i][1]),
      ]);
    }

    // Interior vertex
    if (segmentEnd > startDistance && segmentEnd < endDistance) {
      result.push(line[i + 1]);
    }

    // Interpolated end point
    if (segmentStart < endDistance && endDistance <= segmentEnd) {
      const t = length > 0 ? (endDistance - segmentStart) / length : 0;
      result.push([
        line[i][0] + t * (line[i + 1][0] - line[i][0]),
        line[i][1] + t * (line[i + 1][1] - line[i][1]),
      ]);
      break;
    }
  }

  // Edge case: the take-out sits at the very end of the river
  if (endDistance >= totalLength && result.length > 0) {
    const lastVertex = line[line.length - 1];
    if (!coordinatesMatch(result[result.length - 1], lastVertex)) {
      result.push(lastVertex);
    }
  }

  return result.length >= 2 ? result : null;
}

// ---------------------------------------------------------------------------
// Routing through the river network
// ---------------------------------------------------------------------------

/**
 * Route between `putIn` and `takeOut` through the river network formed by
 * `ways` - needed when the two points lie on different rivers (the take-out
 * downstream of a confluence, e.g. Ötztaler Ache → Inn).
 *
 * Builds a graph with a node per way vertex (OSM ways share the exact
 * confluence node, so coordinate identity connects them), bridges small gaps
 * between way endpoints, attaches both points to their nearest segment and
 * runs Dijkstra. Returns the path put-in → take-out, or `null` when either
 * point is too far from the network or no path exists.
 */
export function routeSection(
  ways: Coordinate[][],
  putIn: { lat: number; lon: number },
  takeOut: { lat: number; lon: number },
): Coordinate[] | null {
  if (ways.length === 0) return null;
  const cosineLatitude = Math.cos((putIn.lat * Math.PI) / 180);
  const metersBetween = (a: Coordinate, b: Coordinate) => {
    const deltaX = (b[0] - a[0]) * cosineLatitude;
    const deltaY = b[1] - a[1];
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY) * METERS_PER_DEGREE;
  };

  // Graph nodes: one per unique vertex coordinate
  const nodeIdByKey = new Map<string, number>();
  const nodeCoordinates: Coordinate[] = [];
  const adjacency: Array<Array<[number, number]>> = [];
  const nodeId = (coordinate: Coordinate) => {
    const key = `${coordinate[0]},${coordinate[1]}`;
    let id = nodeIdByKey.get(key);
    if (id === undefined) {
      id = nodeCoordinates.length;
      nodeCoordinates.push(coordinate);
      adjacency.push([]);
      nodeIdByKey.set(key, id);
    }
    return id;
  };
  const addEdge = (a: number, b: number, weight: number) => {
    adjacency[a].push([b, weight]);
    adjacency[b].push([a, weight]);
  };

  const wayEndpointIds = new Set<number>();
  for (const way of ways) {
    for (let i = 0; i < way.length - 1; i++) {
      const a = nodeId(way[i]);
      const b = nodeId(way[i + 1]);
      if (a !== b) addEdge(a, b, metersBetween(way[i], way[i + 1]));
    }
    wayEndpointIds.add(nodeId(way[0]));
    wayEndpointIds.add(nodeId(way[way.length - 1]));
  }

  // Bridge small gaps between way endpoints (splits at weirs, renames, …)
  const endpointIds = [...wayEndpointIds];
  for (let i = 0; i < endpointIds.length; i++) {
    for (let j = i + 1; j < endpointIds.length; j++) {
      const a = nodeCoordinates[endpointIds[i]];
      const b = nodeCoordinates[endpointIds[j]];
      const gap = endpointDistance(a, b);
      if (gap > ENDPOINT_MATCH_EPSILON && gap <= MAX_BRIDGEABLE_GAP_DEGREES) {
        addEdge(endpointIds[i], endpointIds[j], metersBetween(a, b));
      }
    }
  }

  // Attach a point to its nearest segment via a virtual node
  const attach = (
    point: Coordinate,
  ): { id: number; segmentKey: string } | null => {
    let best = {
      distance: Number.POSITIVE_INFINITY,
      segmentKey: "",
      projected: point,
      segmentStart: point,
      segmentEnd: point,
    };
    for (let wayIndex = 0; wayIndex < ways.length; wayIndex++) {
      const way = ways[wayIndex];
      for (let i = 0; i < way.length - 1; i++) {
        const projection = projectPointOnSegment(
          way[i],
          way[i + 1],
          point,
          cosineLatitude,
        );
        if (projection.distance < best.distance) {
          best = {
            distance: projection.distance,
            segmentKey: `${wayIndex}:${i}`,
            projected: projection.projected,
            segmentStart: way[i],
            segmentEnd: way[i + 1],
          };
        }
      }
    }
    if (best.distance * METERS_PER_DEGREE > MAX_ATTACH_DISTANCE_METERS) {
      return null;
    }
    const id = nodeCoordinates.length;
    nodeCoordinates.push(best.projected);
    adjacency.push([]);
    addEdge(
      id,
      nodeId(best.segmentStart),
      metersBetween(best.projected, best.segmentStart),
    );
    addEdge(
      id,
      nodeId(best.segmentEnd),
      metersBetween(best.projected, best.segmentEnd),
    );
    return { id, segmentKey: best.segmentKey };
  };

  const start = attach([putIn.lon, putIn.lat]);
  const end = attach([takeOut.lon, takeOut.lat]);
  if (!start || !end) return null;
  // Both points on the same segment → connect them directly so the path
  // doesn't detour via a segment endpoint.
  if (start.segmentKey === end.segmentKey) {
    addEdge(
      start.id,
      end.id,
      metersBetween(nodeCoordinates[start.id], nodeCoordinates[end.id]),
    );
  }

  // Dijkstra (binary heap with lazy deletion)
  const distances = new Float64Array(nodeCoordinates.length).fill(
    Number.POSITIVE_INFINITY,
  );
  const previousNode = new Int32Array(nodeCoordinates.length).fill(-1);
  const heapDistances: number[] = [];
  const heapNodes: number[] = [];
  const heapSwap = (i: number, j: number) => {
    [heapDistances[i], heapDistances[j]] = [heapDistances[j], heapDistances[i]];
    [heapNodes[i], heapNodes[j]] = [heapNodes[j], heapNodes[i]];
  };
  const heapPush = (distance: number, node: number) => {
    heapDistances.push(distance);
    heapNodes.push(node);
    let i = heapDistances.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapDistances[parent] <= heapDistances[i]) break;
      heapSwap(parent, i);
      i = parent;
    }
  };
  const heapPop = (): [number, number] => {
    const top: [number, number] = [heapDistances[0], heapNodes[0]];
    const lastDistance = heapDistances.pop();
    const lastNode = heapNodes.pop();
    if (
      heapDistances.length > 0 &&
      lastDistance !== undefined &&
      lastNode !== undefined
    ) {
      heapDistances[0] = lastDistance;
      heapNodes[0] = lastNode;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (
          left < heapDistances.length &&
          heapDistances[left] < heapDistances[smallest]
        ) {
          smallest = left;
        }
        if (
          right < heapDistances.length &&
          heapDistances[right] < heapDistances[smallest]
        ) {
          smallest = right;
        }
        if (smallest === i) break;
        heapSwap(smallest, i);
        i = smallest;
      }
    }
    return top;
  };

  distances[start.id] = 0;
  heapPush(0, start.id);
  while (heapDistances.length > 0) {
    const [distance, node] = heapPop();
    if (distance > distances[node]) continue; // stale entry
    if (node === end.id) break;
    for (const [neighbor, weight] of adjacency[node]) {
      const candidate = distance + weight;
      if (candidate < distances[neighbor]) {
        distances[neighbor] = candidate;
        previousNode[neighbor] = node;
        heapPush(candidate, neighbor);
      }
    }
  }

  if (!Number.isFinite(distances[end.id])) return null;

  const path: Coordinate[] = [];
  for (let node = end.id; node !== -1; node = previousNode[node]) {
    path.push(nodeCoordinates[node]);
  }
  path.reverse();
  return path.length >= 2 ? path : null;
}
