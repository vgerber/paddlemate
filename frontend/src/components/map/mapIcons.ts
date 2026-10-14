import type { MapRef } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

export const LEVEL_COLORS: Record<string, string> = {
  empty: tokens.levels.empty.marker,
  low: tokens.levels.low.marker,
  medium: tokens.levels.medium.marker,
  high: tokens.levels.high.marker,
};

const PUT_IN_ARROW =
  "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z";
const TAKE_OUT_ARROW =
  "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z";

/** Put-in and take-out: a disc in the water level's colour with a white ring
 * and an arrow. Empty is a hollow ring: a white disc, grey ring and arrow. */
const makeMarkerSvg = (level: string, path: string) => {
  const color = LEVEL_COLORS[level];
  const hollow = level === "empty";
  const disc = hollow
    ? `<circle cx="13" cy="13" r="10.5" fill="${tokens.white}" stroke="${color}" stroke-width="3"/>`
    : `<circle cx="13" cy="13" r="11" fill="${color}" stroke="${tokens.white}" stroke-width="2.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">${disc}<g transform="translate(6.5, 6.5) scale(0.542)"><path d="${path}" fill="${hollow ? color : "white"}"/></g></svg>`;
};

/** Register the per-level put-in/take-out marker icons with the map. */
export function addMapImages(map: ReturnType<MapRef["getMap"]> | undefined) {
  if (!map) return;
  for (const level of Object.keys(LEVEL_COLORS)) {
    for (const [id, svg] of [
      [`put-in-icon-${level}`, makeMarkerSvg(level, PUT_IN_ARROW)],
      [`take-out-icon-${level}`, makeMarkerSvg(level, TAKE_OUT_ARROW)],
    ] as [string, string][]) {
      // A blank stand-in now, so a layer that draws before the SVG has
      // decoded does not warn about a missing image.
      if (!map.hasImage(id)) {
        map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
      const img = new Image(26, 26);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      img.onload = () => {
        if (map.hasImage(id)) map.removeImage(id);
        map.addImage(id, img);
      };
    }
  }
}

/** Answer a layer that asks for a marker icon before addMapImages has run
 * (the layers are added as the style loads) with a blank one, so MapLibre
 * does not warn; addMapImages swaps the real icon in. */
export function answerMissingIcons(
  map: ReturnType<MapRef["getMap"]>,
): () => void {
  const onMissing = (e: { id: string }) => {
    if (/^(put-in|take-out)-icon-/.test(e.id) && !map.hasImage(e.id)) {
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    }
  };
  map.on("styleimagemissing", onMissing);
  return () => {
    map.off("styleimagemissing", onMissing);
  };
}
