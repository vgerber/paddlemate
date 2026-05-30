/**
 * Snap a section's put-in and take-out points onto the OSM river centreline.
 *
 * Mirrors the logic in scripts/enrich_geometry.py:
 *   1. Fetch waterway ways from the Overpass API by river name + bounding box.
 *   2. Stitch the ways into the longest continuous LineString.
 *   3. Project each endpoint onto the line (nearest-point-on-polyline).
 *   4. Extract the sub-linestring between the two projected positions.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** [lon, lat] coordinate pair. */
export type Coord = [number, number];

interface OverpassNode {
	lon: number;
	lat: number;
}
interface OverpassElement {
	type: string;
	geometry?: OverpassNode[];
}
interface OverpassResponse {
	elements: OverpassElement[];
}

/**
 * Query the Overpass API for OSM ways matching `name` within `bbox`,
 * stitch them into a single LineString and return the coordinate array.
 * Returns `null` if no ways were found or they could not be stitched.
 */
export async function fetchOsmRiver(
	name: string,
	bbox: { south: number; west: number; north: number; east: number },
	signal?: AbortSignal,
): Promise<Coord[] | null> {
	// Escape Overpass-regex special characters
	const safe = name.replace(/[()+.\\]/g, (c) => `\\${c}`);
	const { south, west, north, east } = bbox;
	const query = `[out:json][timeout:30];
(
  way["waterway"~"river|stream"]["name"~"${safe}",i](${south},${west},${north},${east});
  way["waterway"~"river|stream"]["name:de"~"${safe}",i](${south},${west},${north},${east});
);
out geom;`;

	const resp = await fetch(OVERPASS_URL, {
		method: "POST",
		body: new URLSearchParams({ data: query }),
		signal,
	});
	if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);

	const data = (await resp.json()) as OverpassResponse;

	const ways: Coord[][] = data.elements
		.filter((e) => e.type === "way" && Array.isArray(e.geometry))
		.map((e) => (e.geometry ?? []).map((n): Coord => [n.lon, n.lat]))
		.filter((w) => w.length >= 2);

	return stitchWays(ways);
}

/**
 * Project `putIn` and `takeOut` onto `river`, then return the sub-linestring
 * between them (put-in first, take-out last).
 * Returns `null` if the two points are too close together on the line.
 */
export function snapSection(
	river: Coord[],
	putIn: { lat: number; lon: number },
	takeOut: { lat: number; lon: number },
): Coord[] | null {
	const tIn = projectNorm(river, [putIn.lon, putIn.lat]);
	const tOut = projectNorm(river, [takeOut.lon, takeOut.lat]);
	if (Math.abs(tIn - tOut) < 0.001) return null;

	const tStart = Math.min(tIn, tOut);
	const tEnd = Math.max(tIn, tOut);
	const sub = extractSubline(river, tStart, tEnd);
	if (!sub) return null;

	// Ensure direction matches put-in → take-out
	return tIn <= tOut ? sub : [...sub].reverse();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EPS = 1e-7;

function coordsMatch(a: Coord, b: Coord): boolean {
	return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

/**
 * Greedy stitch: repeatedly append/prepend ways that share an endpoint with
 * the current chain. Mirrors shapely's linemerge for the common river case.
 */
function stitchWays(ways: Coord[][]): Coord[] | null {
	if (ways.length === 0) return null;

	const segments = ways.map((w) => [...w]);
	let chain = segments.shift();
	if (!chain) return null;

	let changed = true;
	while (changed && segments.length > 0) {
		changed = false;
		for (let i = 0; i < segments.length; i++) {
			const way = segments[i];
			const head = chain[0];
			const tail = chain[chain.length - 1];
			const wHead = way[0];
			const wTail = way[way.length - 1];

			if (coordsMatch(tail, wHead)) {
				chain = [...chain, ...way.slice(1)];
			} else if (coordsMatch(tail, wTail)) {
				chain = [...chain, ...[...way].reverse().slice(1)];
			} else if (coordsMatch(head, wTail)) {
				chain = [...way, ...chain.slice(1)];
			} else if (coordsMatch(head, wHead)) {
				chain = [...[...way].reverse(), ...chain.slice(1)];
			} else {
				continue;
			}

			segments.splice(i, 1);
			changed = true;
			break;
		}
	}

	return chain.length >= 2 ? chain : null;
}

/** Euclidean segment length in degrees (fine for <100 km areas). */
function segLen(a: Coord, b: Coord): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Return the normalized linear position [0..1] of the point on `line`
 * closest to `point`.
 */
function projectNorm(line: Coord[], point: Coord): number {
	let bestDist = Number.POSITIVE_INFINITY;
	let bestPos = 0;
	let accumulated = 0;

	for (let i = 0; i < line.length - 1; i++) {
		const a = line[i];
		const b = line[i + 1];
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const lenSq = dx * dx + dy * dy;
		const sl = Math.sqrt(lenSq);

		const t =
			lenSq > 0
				? Math.max(
						0,
						Math.min(
							1,
							((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq,
						),
					)
				: 0;

		const px = a[0] + t * dx;
		const py = a[1] + t * dy;
		const d = (px - point[0]) ** 2 + (py - point[1]) ** 2;

		if (d < bestDist) {
			bestDist = d;
			bestPos = accumulated + t * sl;
		}
		accumulated += sl;
	}

	return accumulated > 0 ? bestPos / accumulated : 0;
}

/**
 * Extract the portion of `line` between normalized positions `t0` and `t1`
 * (t0 < t1, both in [0..1]).
 */
function extractSubline(line: Coord[], t0: number, t1: number): Coord[] | null {
	// Build cumulative-length table
	const cumLen: number[] = [0];
	for (let i = 0; i < line.length - 1; i++) {
		cumLen.push(cumLen[i] + segLen(line[i], line[i + 1]));
	}
	const total = cumLen[cumLen.length - 1];
	if (total === 0) return null;

	const startD = t0 * total;
	const endD = t1 * total;
	const result: Coord[] = [];

	for (let i = 0; i < line.length - 1; i++) {
		const posA = cumLen[i];
		const posB = cumLen[i + 1];
		const sl = posB - posA;

		// Interpolated start point
		if (posA <= startD && startD < posB) {
			const t = sl > 0 ? (startD - posA) / sl : 0;
			result.push([
				line[i][0] + t * (line[i + 1][0] - line[i][0]),
				line[i][1] + t * (line[i + 1][1] - line[i][1]),
			]);
		}

		// Interior vertex
		if (posB > startD && posB < endD) {
			result.push(line[i + 1]);
		}

		// Interpolated end point
		if (posA < endD && endD <= posB) {
			const t = sl > 0 ? (endD - posA) / sl : 0;
			result.push([
				line[i][0] + t * (line[i + 1][0] - line[i][0]),
				line[i][1] + t * (line[i + 1][1] - line[i][1]),
			]);
			break;
		}
	}

	// Edge case: endD == total (take-out at the very end of the river)
	if (endD >= total && result.length > 0) {
		const last = line[line.length - 1];
		if (!coordsMatch(result[result.length - 1], last)) {
			result.push(last);
		}
	}

	return result.length >= 2 ? result : null;
}
