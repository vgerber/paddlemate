export type GeomType = "Point" | "LineString" | "Polygon";

/** Map-driven geometry drawing state, owned by the page/panel that owns the
 * map. Passed as one object so form components stay decoupled from the map
 * wiring. */
export interface GeometryPicking {
  vertices: { lng: number; lat: number }[];
  geomType: GeomType;
  pickingActive: boolean;
  onGeomTypeChange: (t: GeomType) => void;
  onRequestPick: () => void;
  onStopPick: () => void;
  onRemoveVertex?: (i: number) => void;
  onClearVertices: () => void;
}

export function minVerticesFor(geomType: GeomType): number {
  return geomType === "Point" ? 1 : geomType === "LineString" ? 2 : 3;
}
