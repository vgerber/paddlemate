import type { MapRef } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

export const LEVEL_COLORS: Record<string, string> = tokens.levelColors;

const makePutInSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="${color}" stroke="${tokens.background}" stroke-width="1.5"/><g transform="translate(4, 4) scale(0.833)"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" fill="white"/></g></svg>`;
const makeTakeOutSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="${color}" stroke="${tokens.background}" stroke-width="1.5"/><g transform="translate(4, 4) scale(0.833)"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" fill="white"/></g></svg>`;

/** Register the per-level put-in/take-out marker icons with the map. */
export function addMapImages(map: ReturnType<MapRef["getMap"]> | undefined) {
  if (!map) return;
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
}
