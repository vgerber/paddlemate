import type {
  MapCamera,
  MapSubject,
  WaterwayMapProps,
} from "@/components/map/Map";

/** Everything the canvas map draws: the props of `WaterwayMap` (the camera
 * without padding, which the host owns) plus what the camera should frame. A
 * route describes the map it wants and the host draws it. */
export interface MapScene extends Omit<WaterwayMapProps, "camera"> {
  camera?: Omit<MapCamera, "padding" | "subject">;
  /** What to keep inside the free map area; null frames nothing. */
  subject: MapSubject | null;
}
