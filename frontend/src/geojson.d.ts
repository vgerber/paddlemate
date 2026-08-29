// @types/geojson only declares a UMD global (`export as namespace GeoJSON`),
// which module files cannot resolve under TypeScript 6. Bridge the handful of
// types the map code references as GeoJSON.<T> into a real global namespace.
import type * as geojson from "geojson";

declare global {
  // biome-ignore lint/style/noNamespace: ambient bridge for a UMD global, not code organisation
  namespace GeoJSON {
    type Point = geojson.Point;
    type Feature = geojson.Feature;
    type FeatureCollection = geojson.FeatureCollection;
  }
}
