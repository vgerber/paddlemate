/** Haversine distance between two lat/lon points in kilometers. */
export function haversineKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Parse a whitewater difficulty string (I-VI, X) into a numeric grade. */
export function parseDifficulty(diff: string | undefined): number | null {
	if (!diff) return null;
	if (/^X/i.test(diff)) return 10;
	if (/^VI/i.test(diff)) return 6;
	if (/^V/i.test(diff)) return 5;
	if (/^IV/i.test(diff)) return 4;
	if (/^III/i.test(diff)) return 3;
	if (/^II/i.test(diff)) return 2;
	if (/^I/i.test(diff)) return 1;
	return null;
}

/** Generate a GeoJSON polygon approximating a circle (n-sided). */
export function circleGeoJSON(
	lat: number,
	lon: number,
	radiusKm: number,
	steps = 64,
): GeoJSON.FeatureCollection {
	const R = 6371;
	const coords: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const angle = (i / steps) * 2 * Math.PI;
		const dlat = (radiusKm / R) * (180 / Math.PI) * Math.cos(angle);
		const dlon =
			((radiusKm / R) * (180 / Math.PI) * Math.sin(angle)) /
			Math.cos((lat * Math.PI) / 180);
		coords.push([lon + dlon, lat + dlat]);
	}
	return {
		type: "FeatureCollection",
		features: [
			{
				type: "Feature",
				properties: {},
				geometry: { type: "Polygon", coordinates: [coords] },
			},
		],
	};
}

export interface AreaCircle {
	lat: number;
	lon: number;
	radiusKm: number;
}
