import { useEffect, useMemo, useState } from "react";
import type {
  CatalogGaugeRef,
  FeatureWaterRangeBody,
  GaugeOption,
  GaugeSource,
  GaugeWithSeries,
  WaterRangeWithStatus,
} from "@/lib/api";
import { useDebouncedValue } from "./useDebouncedValue";
import { useCatalogGaugeSearch } from "./useGauges";

type CatalogStation = Extract<GaugeOption, { kind: "catalog" }>;
type MeasurementType = CatalogGaugeRef["measurement_type"];

const RIVER = "On this river";
const SECTION = "On this section";
const ALL = "All providers";

/** Map a catalog station's parameter key to a measurement type. Providers use
 * different vocabularies - rivermap "W"/"Q", NVE "1000"/"1001", others
 * "level"/"flow" - so match on the meaning rather than an exact key. */
function measurementOf(param: string): MeasurementType {
  const p = param.toLowerCase();
  if (
    p === "q" ||
    p === "1001" ||
    p.includes("flow") ||
    p.includes("discharge")
  ) {
    return "discharge";
  }
  if (p === "wt" || p === "1003" || p === "t" || p.includes("temp")) {
    return "temperature";
  }
  return "water_level";
}
function measurementLabel(m: MeasurementType): string {
  return m === "discharge"
    ? "Discharge"
    : m === "temperature"
      ? "Temperature"
      : "Water level";
}

/** A unified picker option: an existing real gauge or a catalog station. */
export interface PickerOption {
  /** Stable, deduplicating key: `gauge:<id>` or `catalog:<provider>:<station>`. */
  key: string;
  label: string;
  provider: string;
  group: string;
  gauge?: GaugeWithSeries;
  catalog?: CatalogStation;
}

/** A measurement to attach a range to: a real gauge series, or a catalog param. */
export interface MeasurementChoice {
  /** Series id as a string, or a catalog param key like "W". */
  value: string;
  label: string;
}

interface UseGaugePickerOptions {
  /** Ranges already on this section - offered under "On this section". */
  gaugeRanges?: WaterRangeWithStatus[];
  /** Gauges used on other sections of the same river - recommended first. */
  riverGauges?: GaugeWithSeries[];
  /** Reference point for the catalog search - nearby stations are listed first. */
  nearPoint?: { lat: number; lon: number };
}

export interface GaugePicker {
  options: PickerOption[];
  selected: PickerOption | null;
  applySelection: (option: PickerOption | null) => void;
  setQuery: (query: string) => void;
  /** Measurements available on the selected option (series or catalog params). */
  measurementOptions: MeasurementChoice[];
  measurement: string;
  setMeasurement: (value: string) => void;
  rangeLow: string;
  setRangeLow: (value: string) => void;
  rangeMedium: string;
  setRangeMedium: (value: string) => void;
  rangeHigh: string;
  setRangeHigh: (value: string) => void;
  /** Non-null when the entered thresholds are not increasing. */
  thresholdError: string | null;
  /** Attribution of the selected gauge, when it is an existing one. */
  attributionSource: GaugeSource | null | undefined;
  /** The water ranges to submit (empty when nothing was entered). */
  buildWaterRanges: () => FeatureWaterRangeBody[];
}

function gaugeToOption(gauge: GaugeWithSeries, group: string): PickerOption {
  return {
    key: `gauge:${gauge.id}`,
    label: gauge.name,
    provider: gauge.provider,
    group,
    gauge,
  };
}

/** Gauge selection for the feature form: search all available gauges (existing
 * plus catalog stations across every provider), recommend the river's and the
 * section's own gauges first, and manage the threshold inputs. A catalog
 * station is created + fetched server-side when the section is submitted. */
export function useGaugePicker({
  gaugeRanges,
  riverGauges,
  nearPoint,
}: UseGaugePickerOptions): GaugePicker {
  // Gauges already attached to the section (grouped from its water ranges).
  const sectionGauges = useMemo(() => {
    const byId = new Map<number, GaugeWithSeries>();
    for (const range of gaugeRanges ?? []) {
      const existing = byId.get(range.gauge.id);
      if (existing) {
        if (!existing.series.some((s) => s.id === range.series.id)) {
          existing.series.push(range.series);
        }
      } else {
        byId.set(range.gauge.id, { ...range.gauge, series: [range.series] });
      }
    }
    return [...byId.values()];
  }, [gaugeRanges]);

  const [selected, setSelected] = useState<PickerOption | null>(null);
  const [measurement, setMeasurement] = useState<string>("");
  const [rangeLow, setRangeLow] = useState("");
  const [rangeMedium, setRangeMedium] = useState("");
  const [rangeHigh, setRangeHigh] = useState("");

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 400);
  const { data: catalogResults } = useCatalogGaugeSearch(
    debouncedQuery,
    nearPoint,
  );

  const options = useMemo(() => {
    const seen = new Set<string>();
    const acc: PickerOption[] = [];
    const add = (opt: PickerOption) => {
      if (!seen.has(opt.key)) {
        seen.add(opt.key);
        acc.push(opt);
      }
    };
    for (const g of riverGauges ?? []) add(gaugeToOption(g, RIVER));
    for (const g of sectionGauges) add(gaugeToOption(g, SECTION));
    for (const o of catalogResults ?? []) {
      if (o.kind === "gauge") {
        add(gaugeToOption(o.gauge, ALL));
      } else {
        add({
          key: `catalog:${o.provider}:${o.station_id}`,
          label: o.name ?? o.station_id,
          provider: o.provider,
          group: ALL,
          catalog: o,
        });
      }
    }
    return acc;
  }, [riverGauges, sectionGauges, catalogResults]);

  const measurementOptions = useMemo<MeasurementChoice[]>(() => {
    if (selected?.gauge) {
      return selected.gauge.series.map((s) => ({
        value: String(s.id),
        label: `${s.label ?? measurementLabel(s.measurement_type)} (${s.unit})`,
      }));
    }
    if (selected?.catalog) {
      return selected.catalog.params.map((p) => ({
        value: p,
        label: measurementLabel(measurementOf(p)),
      }));
    }
    return [];
  }, [selected]);

  function applySelection(option: PickerOption | null) {
    setSelected(option);
    const first = option?.gauge
      ? String(option.gauge.series[0]?.id ?? "")
      : (option?.catalog?.params[0] ?? "");
    setMeasurement(first);
    // Prefill thresholds from the section's existing range for this series.
    const existing =
      option?.gauge && first !== ""
        ? (gaugeRanges ?? []).find((r) => r.series.id === Number(first))
        : undefined;
    setRangeLow(existing?.range_low?.toString() ?? "");
    setRangeMedium(existing?.range_medium?.toString() ?? "");
    setRangeHigh(existing?.range_high?.toString() ?? "");
  }

  // Default to the section's first gauge once its ranges arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only seed once
  useEffect(() => {
    if (selected == null && sectionGauges.length > 0) {
      applySelection(gaugeToOption(sectionGauges[0], SECTION));
    }
  }, [sectionGauges]);

  const low = rangeLow !== "" ? Number(rangeLow) : null;
  const medium = rangeMedium !== "" ? Number(rangeMedium) : null;
  const high = rangeHigh !== "" ? Number(rangeHigh) : null;

  const ordered = (a: number | null, b: number | null) =>
    a == null || b == null || a < b;
  const thresholdError =
    ordered(low, medium) && ordered(medium, high) && ordered(low, high)
      ? null
      : "Thresholds must be increasing: low < medium < high";

  const buildWaterRanges = (): FeatureWaterRangeBody[] => {
    const hasThreshold = low != null || medium != null || high != null;
    if (measurement === "" || !hasThreshold) return [];
    if (selected?.gauge) {
      return [
        {
          series_id: Number(measurement),
          range_low: low,
          range_medium: medium,
          range_high: high,
        },
      ];
    }
    if (selected?.catalog) {
      const c = selected.catalog;
      return [
        {
          gauge_ref: {
            provider: c.provider,
            station_id: c.station_id,
            measurement_type: measurementOf(measurement),
            param: measurement,
            name: c.name,
            lat: c.lat,
            lon: c.lon,
          },
          range_low: low,
          range_medium: medium,
          range_high: high,
        },
      ];
    }
    return [];
  };

  return {
    options,
    selected,
    applySelection,
    setQuery,
    measurementOptions,
    measurement,
    setMeasurement,
    rangeLow,
    setRangeLow,
    rangeMedium,
    setRangeMedium,
    rangeHigh,
    setRangeHigh,
    thresholdError,
    attributionSource: selected?.gauge?.source,
    buildWaterRanges,
  };
}
