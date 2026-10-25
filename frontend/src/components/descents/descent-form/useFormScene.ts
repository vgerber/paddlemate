import { useMemo, useRef } from "react";
import type { MapScene } from "@/components/canvas/scene";
import { boundsOf, lineCoords } from "@/lib/geo";
import type { SectionPicking } from "./useSectionPicking";

/** The wide-screen picker map: the host map draws the waterway's sections,
 * the picked ones highlighted, and takes the clicks. Handlers go through a
 * ref and the rest is keyed on values, so typing in the form never redraws
 * the map. `interactive` is false outside the sections step. */
export function useFormScene(
  picking: SectionPicking,
  interactive: boolean,
): MapScene {
  const latest = useRef(picking);
  latest.current = picking;

  const { sectionsForMap: sections, selectedIds, putIn, takeOut } = picking;
  const pickedKey = [...selectedIds].join(",");
  const pinnable = interactive && selectedIds.size > 0;
  const putInLat = putIn?.lat;
  const putInLon = putIn?.lon;
  const takeOutLat = takeOut?.lat;
  const takeOutLon = takeOut?.lon;

  // biome-ignore lint/correctness/useExhaustiveDependencies: pickedKey stands for selectedIds, the pins for putIn/takeOut, so unrelated renders keep the scene
  return useMemo<MapScene>(() => {
    const picked = sections.filter((s) => selectedIds.has(s.id));
    const framed = picked.length > 0 ? picked : sections;
    const bounds = boundsOf(
      framed.flatMap((s) => lineCoords(s.location) ?? []),
    );
    return {
      sections,
      picking: {
        selectedSectionIds: new Set(selectedIds),
        onSectionToggle: interactive
          ? (id) => {
              const section = latest.current.sectionsForMap.find(
                (s) => s.id === id,
              );
              if (section) latest.current.toggleSection(section);
            }
          : undefined,
        putIn: putInLat != null && putInLon != null ? putIn : null,
        takeOut: takeOutLat != null && takeOutLon != null ? takeOut : null,
        onPickPutIn: pinnable ? (p) => latest.current.pickPutIn(p) : undefined,
        onPickTakeOut: pinnable
          ? (p) => latest.current.pickTakeOut(p)
          : undefined,
      },
      subject: bounds
        ? {
            key: `form:${picked.length > 0 ? pickedKey : `all:${sections.length}`}`,
            bounds,
          }
        : null,
    };
  }, [
    sections,
    pickedKey,
    interactive,
    pinnable,
    putInLat,
    putInLon,
    takeOutLat,
    takeOutLon,
  ]);
}
