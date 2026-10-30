import { Layer, Source } from "react-map-gl/maplibre";
import { useTokens } from "@/lib/hooks/ui/useTokens";

/** The area-search circle: dashed while the centre can still move. */
export function AreaCircleLayers({
  data,
  locked,
}: {
  data: GeoJSON.FeatureCollection;
  locked?: boolean;
}) {
  const tokens = useTokens();
  return (
    <Source id="area-circle" type="geojson" data={data}>
      <Layer
        id="area-circle-fill"
        type="fill"
        paint={{ "fill-color": tokens.mapAreaCircle, "fill-opacity": 0.08 }}
      />
      <Layer
        id="area-circle-line"
        type="line"
        paint={{
          "line-color": tokens.mapAreaCircle,
          "line-width": 2,
          ...(locked ? {} : { "line-dasharray": [4, 3] }),
        }}
      />
    </Source>
  );
}

/** Sections ticked while a form picks several. */
export function PickerSelectionLayers({
  data,
}: {
  data: GeoJSON.FeatureCollection;
}) {
  const tokens = useTokens();
  return (
    <Source id="sections-picker-sel" type="geojson" data={data}>
      <Layer
        id="sections-picker-sel-casing"
        type="line"
        paint={{
          "line-color": tokens.mapSectionLineCasing,
          "line-width": 7,
          "line-opacity": 0.85,
        }}
      />
      <Layer
        id="sections-picker-sel-line"
        type="line"
        paint={{ "line-color": tokens.primary, "line-width": 5 }}
      />
    </Source>
  );
}
