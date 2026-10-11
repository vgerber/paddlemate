import type { MapRef } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

export const LEVEL_COLORS: Record<string, string> = {
  empty: tokens.levels.empty.marker,
  low: tokens.levels.low.marker,
  medium: tokens.levels.medium.marker,
  high: tokens.levels.high.marker,
};

/** Put-in and take-out: a teal disc with a white ring and an arrow. */
const makePutInSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="${color}" stroke="${tokens.white}" stroke-width="2.5"/><g transform="translate(6.5, 6.5) scale(0.542)"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" fill="white"/></g></svg>`;
const makeTakeOutSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="${color}" stroke="${tokens.white}" stroke-width="2.5"/><g transform="translate(6.5, 6.5) scale(0.542)"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" fill="white"/></g></svg>`;

/** Register the per-level put-in/take-out marker icons with the map. */
export function addMapImages(map: ReturnType<MapRef["getMap"]> | undefined) {
  if (!map) return;
  for (const level of Object.keys(LEVEL_COLORS)) {
    const color = tokens.primary;
    for (const [id, svg] of [
      [`put-in-icon-${level}`, makePutInSvg(color)],
      [`take-out-icon-${level}`, makeTakeOutSvg(color)],
    ] as [string, string][]) {
      const img = new Image(26, 26);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      img.onload = () => {
        if (!map.hasImage(id)) map.addImage(id, img);
      };
    }
  }
}
