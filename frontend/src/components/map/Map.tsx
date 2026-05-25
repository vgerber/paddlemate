import { useCallback, useEffect, useRef, useState } from "react";
import MapGL, {
	Layer,
	type MapLayerMouseEvent,
	type MapRef,
	Marker,
	NavigationControl,
	Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";
import { circleGeoJSON } from "@/lib/geo";
import GaugeMarkers, { type GaugePin } from "./GaugeMarkers";
import LabelModeToggle from "./LabelModeToggle";
import {
	buildLineFeaturesGeoJSON,
	buildPointFeaturesGeoJSON,
	buildSectionEndpointsGeoJSON,
	buildSectionLabelsGeoJSON,
	buildSectionsGeoJSON,
} from "./mapLayers";

export type { AreaCircle } from "@/lib/geo";
export type { GaugePin } from "./GaugeMarkers";

const SATELLITE_STYLE = {
	version: 8 as const,
	sources: {
		"esri-satellite": {
			type: "raster" as const,
			tiles: [
				"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
			],
			tileSize: 256,
			attribution: "Tiles &copy; Esri",
			maxzoom: 19,
		},
	},
	layers: [
		{
			id: "esri-satellite-layer",
			type: "raster" as const,
			source: "esri-satellite",
		},
	],
};

interface WaterwayMapProps {
	sections?: SectionWithFeatures[];
	features?: Feature[];
	selectedSectionId?: number | null;
	onSectionClick?: (id: number) => void;
	// Multi-selection picker mode
	selectedSectionIds?: Set<number>;
	onSectionToggle?: (id: number) => void;
	// Put-in / take-out picking
	putIn?: { lat: number; lon: number } | null;
	takeOut?: { lat: number; lon: number } | null;
	onPickPutIn?: (lat: number, lon: number) => void;
	onPickTakeOut?: (lat: number, lon: number) => void;
	placingFeature?: boolean;
	onMapClick?: (lng: number, lat: number) => void;
	gaugePins?: GaugePin[];
	selectedGaugePinId?: number | null;
	onGaugeClick?: (pin: GaugePin) => void;
	areaCircle?: AreaCircle | null;
	areaLocked?: boolean;
	onAreaCircleChange?: (circle: AreaCircle | null) => void;
	waterwayNames?: Record<number, string>;
	labelMode?: "section" | "river";
	onLabelModeChange?: (mode: "section" | "river") => void;
	sectionLevels?: Record<number, string>;
}

export default function WaterwayMap({
	sections,
	features,
	selectedSectionId,
	onSectionClick,
	selectedSectionIds,
	onSectionToggle,
	putIn,
	takeOut,
	onPickPutIn,
	onPickTakeOut,
	placingFeature,
	onMapClick,
	gaugePins,
	selectedGaugePinId,
	onGaugeClick,
	areaCircle,
	areaLocked,
	onAreaCircleChange,
	waterwayNames,
	labelMode = "section",
	onLabelModeChange,
	sectionLevels,
}: WaterwayMapProps) {
	const mapRef = useRef<MapRef>(null);
	const [pickMode, setPickMode] = useState<"put-in" | "take-out" | null>(null);
	const [mapLoaded, setMapLoaded] = useState(false);
	const [satellite, setSatellite] = useState(false);

	const handleMapLoad = useCallback(() => {
		setMapLoaded(true);
		const map = mapRef.current?.getMap();
		if (!map) return;

		const LEVEL_COLORS: Record<string, string> = {
			empty: "#9eaab0",
			low: "#4caf50",
			medium: "#ff9800",
			high: "#f44336",
		};

		const makePutInSvg = (color: string) =>
			`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="${color}" stroke="#121416" stroke-width="1.5"/><g transform="translate(4, 4) scale(0.833)"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" fill="white"/></g></svg>`;
		const makeTakeOutSvg = (color: string) =>
			`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="${color}" stroke="#121416" stroke-width="1.5"/><g transform="translate(4, 4) scale(0.833)"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" fill="white"/></g></svg>`;

		for (const [level, color] of Object.entries(LEVEL_COLORS)) {
			for (const [id, svg] of [
				[`put-in-icon-${level}`, makePutInSvg(color)],
				[`take-out-icon-${level}`, makeTakeOutSvg(color)],
			] as [string, string][]) {
				const img = new Image(28, 28);
				img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
				img.onload = () => {
					if (!map.hasImage(id)) map.addImage(id, img);
				};
			}
		}
	}, []);

	// Fit bounds to all sections
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !mapLoaded || !sections?.length) return;
		const coords: number[][] = [];
		for (const s of sections) {
			const geom = s.location as unknown as GeoJSON.LineString;
			if (geom?.type === "LineString") coords.push(...geom.coordinates);
		}
		if (!coords.length) return;
		const lngs = coords.map((c) => c[0]);
		const lats = coords.map((c) => c[1]);
		map.fitBounds(
			[
				[Math.min(...lngs), Math.min(...lats)],
				[Math.max(...lngs), Math.max(...lats)],
			],
			{ padding: 60, duration: 800 },
		);
	}, [sections, mapLoaded]);

	// Fit bounds to selected section
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !mapLoaded || !selectedSectionId || !sections?.length) return;
		const section = sections.find((s) => s.id === selectedSectionId);
		const geom = section?.location as unknown as GeoJSON.LineString | undefined;
		if (geom?.type !== "LineString" || !geom.coordinates.length) return;
		const lngs = geom.coordinates.map((c) => c[0]);
		const lats = geom.coordinates.map((c) => c[1]);
		map.fitBounds(
			[
				[Math.min(...lngs), Math.min(...lats)],
				[Math.max(...lngs), Math.max(...lats)],
			],
			{ padding: 80, duration: 600 },
		);
	}, [selectedSectionId, sections, mapLoaded]);

	const sectionsGeoJSON = buildSectionsGeoJSON(sections ?? []);
	const sectionLabelsGeoJSON = buildSectionLabelsGeoJSON(
		sections ?? [],
		labelMode,
		waterwayNames,
	);
	const sectionEndpointsGeoJSON = buildSectionEndpointsGeoJSON(
		sections ?? [],
		sectionLevels,
	);
	const pointsGeoJSON = buildPointFeaturesGeoJSON(features ?? []);
	const linesGeoJSON = buildLineFeaturesGeoJSON(features ?? []);

	const handleClick = (e: MapLayerMouseEvent) => {
		if (pickMode) {
			const { lng, lat } = e.lngLat;
			if (pickMode === "put-in") onPickPutIn?.(lat, lng);
			else onPickTakeOut?.(lat, lng);
			setPickMode(null);
			return;
		}
		if (onAreaCircleChange) {
			onAreaCircleChange({
				lat: e.lngLat.lat,
				lon: e.lngLat.lng,
				radiusKm: areaCircle?.radiusKm ?? 20,
			});
			return;
		}
		const sectionFeature = e.features?.find(
			(f) =>
				f.layer.id === "sections-line" ||
				f.layer.id === "sections-line-casing" ||
				f.layer.id === "sections-line-hitbox",
		);
		if (sectionFeature?.id !== undefined) {
			if (onSectionToggle) {
				onSectionToggle(Number(sectionFeature.id));
			} else if (onSectionClick) {
				onSectionClick(Number(sectionFeature.id));
			}
			return;
		}
		if (placingFeature && onMapClick) {
			onMapClick(e.lngLat.lng, e.lngLat.lat);
		}
	};

	const circleData = areaCircle
		? circleGeoJSON(areaCircle.lat, areaCircle.lon, areaCircle.radiusKm)
		: ({
				type: "FeatureCollection",
				features: [],
			} as GeoJSON.FeatureCollection);

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				position: "relative",
				cursor: onAreaCircleChange
					? "crosshair"
					: placingFeature
						? "crosshair"
						: pickMode
							? "crosshair"
							: undefined,
			}}
		>
			{onLabelModeChange && (
				<LabelModeToggle labelMode={labelMode} onChange={onLabelModeChange} />
			)}
			<button
				type="button"
				onClick={() => setSatellite((s) => !s)}
				style={{
					position: "absolute",
					bottom: 8,
					left: 8,
					zIndex: 10,
					padding: "4px 10px",
					borderRadius: 4,
					border: "none",
					cursor: "pointer",
					fontFamily: "inherit",
					fontSize: 12,
					boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
					background: satellite ? "#1976d2" : "#fff",
					color: satellite ? "#fff" : "#333",
					transition: "background 0.15s",
				}}
			>
				Satellite
			</button>
			<MapGL
				ref={mapRef}
				initialViewState={{ longitude: 13, latitude: 47, zoom: 5 }}
				style={{ width: "100%", height: "100%" }}
				mapStyle={
					satellite
						? SATELLITE_STYLE
						: "https://tiles.openfreemap.org/styles/liberty"
				}
				onClick={handleClick}
				onLoad={handleMapLoad}
				interactiveLayerIds={[
					"sections-line",
					"sections-line-casing",
					"sections-line-hitbox",
				]}
			>
				<NavigationControl position="top-right" />

				{/* Declare endpoints first so sections layers can reference it via beforeId */}
				<Source
					id="section-endpoints"
					type="geojson"
					data={sectionEndpointsGeoJSON}
				>
					<Layer
						id="section-endpoints-dot"
						type="circle"
						filter={
							selectedSectionId != null
								? ["!=", ["get", "section_id"], selectedSectionId]
								: ["==", ["get", "section_id"], -1]
						}
						layout={{
							visibility: selectedSectionId != null ? "visible" : "none",
						}}
						paint={{
							"circle-radius": [
								"interpolate",
								["linear"],
								["zoom"],
								7,
								3,
								10,
								5,
							],
							"circle-color": [
								"match",
								["get", "level"],
								"low",
								"#4caf50",
								"medium",
								"#ff9800",
								"high",
								"#f44336",
								"#9eaab0",
							],
							"circle-opacity": 1,
							"circle-stroke-width": 1,
							"circle-stroke-color": "#121416",
							"circle-stroke-opacity": 1,
						}}
					/>
					<Layer
						id="section-endpoints-icon"
						type="symbol"
						filter={
							selectedSectionId != null
								? ["==", ["get", "section_id"], selectedSectionId]
								: ["!=", ["get", "section_id"], -1]
						}
						layout={{
							"icon-image": [
								"concat",
								[
									"match",
									["get", "kind"],
									"put_in",
									"put-in-icon-",
									"take-out-icon-",
								],
								["coalesce", ["get", "level"], "empty"],
							],
							"icon-size": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 10, 1],
							"icon-allow-overlap": true,
							"icon-padding": 4,
						}}
					/>
				</Source>

				<Source id="sections" type="geojson" data={sectionsGeoJSON}>
					<Layer
						id="sections-line-hitbox"
						beforeId="section-endpoints-icon"
						type="line"
						paint={{
							"line-color": "#000000",
							"line-width": 20,
							"line-opacity": 0,
						}}
					/>
					<Layer
						id="sections-line-casing"
						beforeId="section-endpoints-icon"
						type="line"
						paint={{
							"line-color": "#0a1a2e",
							"line-width": 6,
							"line-opacity": 0.85,
						}}
					/>
					<Layer
						id="sections-line"
						beforeId="section-endpoints-icon"
						type="line"
						paint={{
							"line-color": "#29b6f6",
							"line-width": 4,
							"line-opacity": 1,
						}}
					/>
					<Layer
						id="sections-line-selected"
						beforeId="section-endpoints-icon"
						type="line"
						filter={["==", ["id"], selectedSectionId ?? -1]}
						paint={{
							"line-color": "#ff9800",
							"line-width": 6,
							"line-opacity": 1,
						}}
					/>
				</Source>

				<Source id="section-labels" type="geojson" data={sectionLabelsGeoJSON}>
					<Layer
						id="sections-label"
						type="symbol"
						minzoom={7}
						layout={{
							"text-field": ["get", "label"],
							"text-size": 13,
							"text-font": ["Noto Sans Regular"],
							"text-padding": 6,
						}}
						paint={{
							"text-color": "#ffffff",
							"text-halo-color": "rgb(21, 37, 52)",
							"text-halo-width": 2,
						}}
					/>
				</Source>

				<Source id="feature-lines" type="geojson" data={linesGeoJSON}>
					<Layer
						id="feature-lines-layer"
						type="line"
						paint={{
							"line-color": ["get", "color"],
							"line-width": 2,
							"line-dasharray": [2, 2],
						}}
					/>
				</Source>

				<Source id="feature-points" type="geojson" data={pointsGeoJSON}>
					<Layer
						id="feature-points-circle"
						type="circle"
						paint={{
							"circle-radius": 7,
							"circle-color": ["get", "color"],
							"circle-stroke-width": 2,
							"circle-stroke-color": "#121416",
						}}
					/>
				</Source>

				<GaugeMarkers
					pins={gaugePins ?? []}
					selectedId={selectedGaugePinId}
					onClick={onGaugeClick}
				/>

				<Source id="area-circle" type="geojson" data={circleData}>
					<Layer
						id="area-circle-fill"
						type="fill"
						paint={{ "fill-color": "#1976d2", "fill-opacity": 0.08 }}
					/>
					<Layer
						id="area-circle-line"
						type="line"
						paint={{
							"line-color": "#1976d2",
							"line-width": 2,
							...(areaLocked ? {} : { "line-dasharray": [4, 3] }),
						}}
					/>
				</Source>

				{/* Selected sections overlay for picker mode */}
				{selectedSectionIds && selectedSectionIds.size > 0 && (
					<Source
						id="sections-picker-sel"
						type="geojson"
						data={buildSectionsGeoJSON(
							(sections ?? []).filter((s) => selectedSectionIds.has(s.id)),
						)}
					>
						<Layer
							id="sections-picker-sel-casing"
							type="line"
							paint={{
								"line-color": "#0a1a2e",
								"line-width": 7,
								"line-opacity": 0.85,
							}}
						/>
						<Layer
							id="sections-picker-sel-line"
							type="line"
							paint={{ "line-color": "#c2cf47", "line-width": 5 }}
						/>
					</Source>
				)}

				{putIn && (
					<Marker latitude={putIn.lat} longitude={putIn.lon} anchor="center">
						<div
							style={{
								width: 22,
								height: 22,
								borderRadius: "50%",
								background: "#0072B2",
								color: "white",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 12,
								fontWeight: 700,
								border: "2px solid white",
								boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
								pointerEvents: "none",
							}}
						>
							1
						</div>
					</Marker>
				)}
				{takeOut && (
					<Marker
						latitude={takeOut.lat}
						longitude={takeOut.lon}
						anchor="center"
					>
						<div
							style={{
								width: 22,
								height: 22,
								borderRadius: "50%",
								background: "#D55E00",
								color: "white",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 12,
								fontWeight: 700,
								border: "2px solid white",
								boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
								pointerEvents: "none",
							}}
						>
							2
						</div>
					</Marker>
				)}

				{areaCircle && (
					<Marker
						longitude={areaCircle.lon}
						latitude={areaCircle.lat}
						anchor="center"
					>
						<div
							style={{
								width: 10,
								height: 10,
								borderRadius: "50%",
								background: "#1976d2",
								border: "2px solid #fff",
								boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
								pointerEvents: "none",
							}}
						/>
					</Marker>
				)}
			</MapGL>

			{(onPickPutIn || onPickTakeOut) && (
				<div
					style={{
						position: "absolute",
						top: 8,
						left: 8,
						zIndex: 10,
						display: "flex",
						gap: 6,
					}}
				>
					{onPickPutIn && (
						<button
							type="button"
							onClick={() =>
								setPickMode((p) => (p === "put-in" ? null : "put-in"))
							}
							style={{
								background:
									pickMode === "put-in" ? "#0072B2" : "rgba(18,20,22,0.88)",
								color: "white",
								border: `1px solid ${pickMode === "put-in" ? "rgba(0,114,178,0.9)" : "rgba(139,209,232,0.35)"}`,
								borderRadius: 0,
								padding: "4px 10px",
								fontSize: 11,
								fontFamily: '"Space Grotesk", monospace',
								letterSpacing: "0.06em",
								cursor: "pointer",
								fontWeight: 600,
							}}
						>
							① PUT-IN
						</button>
					)}
					{onPickTakeOut && (
						<button
							type="button"
							onClick={() =>
								setPickMode((p) => (p === "take-out" ? null : "take-out"))
							}
							style={{
								background:
									pickMode === "take-out" ? "#D55E00" : "rgba(18,20,22,0.88)",
								color: "white",
								border: `1px solid ${pickMode === "take-out" ? "rgba(213,94,0,0.9)" : "rgba(139,209,232,0.35)"}`,
								borderRadius: 0,
								padding: "4px 10px",
								fontSize: 11,
								fontFamily: '"Space Grotesk", monospace',
								letterSpacing: "0.06em",
								cursor: "pointer",
								fontWeight: 600,
							}}
						>
							② TAKE-OUT
						</button>
					)}
				</div>
			)}
		</div>
	);
}
