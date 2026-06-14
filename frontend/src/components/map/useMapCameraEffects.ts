import { useCallback, useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { SectionWithFeatures } from "@/lib/api";
import type { AreaCircle } from "@/lib/geo";

interface UseMapCameraEffectsParams {
  mapRef: RefObject<MapRef | null>;
  mapLoaded: boolean;
  setMapLoaded: Dispatch<SetStateAction<boolean>>;
  addMapImages: (map: ReturnType<MapRef["getMap"]> | undefined) => void;
  sections?: SectionWithFeatures[];
  areaCircle?: AreaCircle | null;
  areaLocked?: boolean;
  selectedSectionId?: number | null;
  focusedPoint?: [number, number] | null;
}

export function useMapCameraEffects({
  mapRef,
  mapLoaded,
  setMapLoaded,
  addMapImages,
  sections,
  areaCircle,
  areaLocked,
  selectedSectionId,
  focusedPoint,
}: UseMapCameraEffectsParams) {
  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current?.getMap();
    addMapImages(map);
  }, [setMapLoaded, mapRef, addMapImages]);

  // Re-add custom images whenever the style is swapped (e.g. satellite toggle)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    const handler = () => addMapImages(map);
    map.on("style.load", handler);
    return () => {
      map.off("style.load", handler);
    };
  }, [mapLoaded, mapRef, addMapImages]);

  // Fit bounds to all sections (skip entirely if in area search mode)
  useEffect(() => {
    if (areaCircle) return;
    const map = mapRef.current;
    if (!map || !mapLoaded || !sections?.length || areaLocked) return;
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
  }, [sections, mapLoaded, areaLocked, areaCircle, mapRef]);

  // Fit bounds to area circle (area search mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !areaCircle) return;
    const latDelta = areaCircle.radiusKm / 111;
    const cosLat = Math.cos((areaCircle.lat * Math.PI) / 180);
    const lonDelta =
      areaCircle.radiusKm / (111 * Math.max(0.01, Math.abs(cosLat)));
    map.fitBounds(
      [
        [areaCircle.lon - lonDelta, areaCircle.lat - latDelta],
        [areaCircle.lon + lonDelta, areaCircle.lat + latDelta],
      ],
      { padding: 60, duration: 800 },
    );
  }, [areaCircle, mapLoaded, mapRef]);

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
  }, [selectedSectionId, sections, mapLoaded, mapRef]);

  // Fly to a focused feature point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !focusedPoint) return;
    map.flyTo({
      center: focusedPoint,
      zoom: Math.max(map.getZoom(), 14),
      duration: 600,
    });
  }, [focusedPoint, mapLoaded, mapRef]);

  return { handleMapLoad };
}