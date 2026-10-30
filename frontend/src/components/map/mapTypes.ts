import type {
  CountryBorder,
  Feature,
  RegionOutline,
  SectionWithFeatures,
} from "@/lib/api";
import type { AreaCircle, Bounds, LngLat, ViewBounds } from "@/lib/map/geo";
import type { GaugePin } from "./GaugeMarkers";
import type { NotePin } from "./NoteMarkers";
import type { RangeRing } from "./RangeRingLayers";

export interface PointPin {
  id: string;
  lon: number;
  lat: number;
  color: string;
  title?: string;
  /** Larger with a halo - the pin currently being placed. */
  emphasis?: boolean;
}

/** Clicking the map to choose places: the section put-in/take-out pair and
 * multi-section selection. Present only while a form is picking. */
export interface MapPicking {
  putIn?: { lat: number; lon: number } | null;
  takeOut?: { lat: number; lon: number } | null;
  onPickPutIn?: (point: LngLat) => void;
  onPickTakeOut?: (point: LngLat) => void;
  selectedSectionIds?: Set<number>;
  onSectionToggle?: (id: number) => void;
}

/** Geometry being drafted on the map: feature vertices under construction
 * and the preview/highlight lines of a section in progress. */
export interface MapDrawing {
  featureVertices?: LngLat[];
  featureGeomType?: "Point" | "LineString" | "Polygon";
  /** Route map clicks to `onMapClick` instead of section selection. */
  placingFeature?: boolean;
  onMapClick?: (point: LngLat) => void;
  sectionPreviewCoords?: [number, number][];
  /** Sections drawn in a state other than the plain river line. */
  sectionStates?: MapSectionStates;
  /** River course to highlight subtly (e.g. the OSM riverbed a section will snap to). */
  riverHighlightCoords?: [number, number][] | null;
}

/** Section ids drawn as the subject of a screen (teal) and as context only
 * (dim, not clickable, no access-point marks). Every other section keeps the
 * plain river line. Pass memoised arrays. */
export interface MapSectionStates {
  highlighted?: number[];
  ghost?: number[];
}

/** Controls and labelling around the map surface, not the data on it. */
export interface MapChrome {
  waterwayNames?: Record<number, string>;
  labelMode?: "section" | "river";
  onLabelModeChange?: (mode: "section" | "river") => void;
  /** For maps embedded in scrollable pages: page scroll passes over the map;
   * zooming needs Ctrl/Cmd+scroll (or two fingers on touch). */
  cooperativeGestures?: boolean;
  /** Corner for the attribution. The bottom of a phone screen belongs to the
   * label toggle, the results strip and the filter button, all of which sat
   * on top of it - move it to a free corner there. */
  attributionPosition?: "top-left" | "bottom-right";
  /** Only the water, the section line, the markers and the zoom keys: no
   * layer switcher, compass or access-point arrows. Defaults on for maps
   * embedded in a scrolling page or a wizard (`cooperativeGestures`). */
  minimal?: boolean;
  /** Keeps the zoom, compass, layer toggle and attribution inside these
   * edges (px in from each side of the map) instead of the map's own
   * corners: the free area of a canvas screen, so no card covers them. */
  inset?: MapPadding;
  /** A full-screen overlay covers the map: ambient motion stops. */
  covered?: boolean;
}

/** What the camera frames: refit when `key` changes, and again (unless it is
 * already inside) when the padding changes. While a subject is set the camera
 * no longer fits all sections or the selected section by itself. */
export interface MapSubject {
  key: string;
  /** [[minLon, minLat], [maxLon, maxLat]] */
  bounds: Bounds;
  maxZoom?: number;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Where the map looks, and where it reports it is looking. */
export interface MapCamera {
  /** Fit padding in px; the free map area on a canvas screen. Defaults to the
   * fixed per-move values. Replaces `focusPaddingBottom` when given. */
  padding?: MapPadding;
  subject?: MapSubject | null;
  /** [lng, lat] to fly to and highlight; set by clicking a feature in the panel. */
  focusedPoint?: [number, number] | null;
  /** [[minLon, minLat], [maxLon, maxLat]] box to fit (e.g. a river's gauges). */
  focusBounds?: Bounds | null;
  /** Extra bottom padding (px) for focus moves when an overlay covers the
   * lower part of the canvas (mobile suggest panel). */
  focusPaddingBottom?: number;
  /** Reports the current viewport bounds (on load and after each move). */
  onBoundsChange?: (bounds: ViewBounds) => void;
}

/** Notes pinned to the water, and which one is open. */
export interface MapNotes {
  pins?: NotePin[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  onOpenThread?: (id: number) => void;
}

/** Gauge markers, and which one is selected. */
export interface MapGauges {
  pins?: GaugePin[];
  selectedId?: number | null;
  onClick?: (pin: GaugePin) => void;
}

/** The area-search circle. Omitting onChange makes it read-only. */
export interface MapArea {
  circle?: AreaCircle | null;
  locked?: boolean;
  onChange?: (circle: AreaCircle | null) => void;
}

/** Region browsing: the regions on offer, the one picked, and the country
 * borders drawn over them. */
export interface MapRegions {
  choices?: RegionOutline[] | null;
  picked?: RegionOutline | null;
  borders?: CountryBorder[] | null;
  /** Kinds in view too wide to draw; the map says so and how to see them. */
  hiddenKinds?: string[];
  onSelect?: (regionId: number) => void;
  /** Phone: the region a first tap lit, and how to set it. */
  previewId?: number | null;
  onPreview?: (regionId: number | null) => void;
}

export interface WaterwayMapProps {
  sections?: SectionWithFeatures[];
  features?: Feature[];
  /** The open feature: drawn heavier along its line. */
  selectedFeatureId?: number | null;
  /** A tap on a confirmed feature; it wins over the section beneath it. */
  onFeatureClick?: (id: number) => void;
  selectedSectionId?: number | null;
  onSectionClick?: (id: number) => void;
  sectionLevels?: Record<number, string>;
  /** Pending proposals to show as ghost markers on the map. */
  proposedFeatures?: Feature[];
  /** Small dot markers (the note composer's draft pin). */
  pointPins?: PointPin[];
  /** Named places with the ground they reach (a trip's bases). */
  rings?: RangeRing[];
  camera?: MapCamera;
  notes?: MapNotes;
  gauges?: MapGauges;
  area?: MapArea;
  regions?: MapRegions;
  picking?: MapPicking;
  drawing?: MapDrawing;
  chrome?: MapChrome;
}
