import type { Descent, SectionWithFeatures } from "@/lib/api";
import { localizedName } from "@/lib/localization";
import { toVisibility, type VisibilityType } from "@/lib/visibility";

export type TimingMode = "single" | "multi";
export type SectionLocation = { type: "LineString"; coordinates: number[][] };

export interface SectionDraft {
  key: string;
  section_id: number;
  sort_order: number;
  note: string;
  display_name: string;
  location?: SectionLocation;
}

export interface LogForm {
  timing_mode: TimingMode;
  start_time: string;
  end_time: string;
  name: string;
  sections: SectionDraft[];
  put_in_lat: string;
  put_in_lon: string;
  put_in_label: string;
  take_out_lat: string;
  take_out_lon: string;
  take_out_label: string;
  note: string;
  visibility_type: VisibilityType;
  shared_groups: number[];
  shared_users: string[];
  visible_from: string;
  /** Trip this log is credited to. A descent belongs to at most one. */
  trip_id: number | null;
}

/** Props shared by every wizard step. */
export interface StepProps {
  form: LogForm;
  onChange: (p: Partial<LogForm>) => void;
}

export function toDatetimeLocal(iso: string): string {
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZoneName: undefined })
    .slice(0, 16)
    .replace(" ", "T");
}

export function isValidCoord(val: string): boolean {
  return val !== "" && !Number.isNaN(parseFloat(val));
}

/** Parse a "lat,lon" string pair into coords, or null when invalid. */
export function coordsFromStrings(
  lat: string,
  lon: string,
): { lat: number; lon: number } | null {
  return isValidCoord(lat) && isValidCoord(lon)
    ? { lat: parseFloat(lat), lon: parseFloat(lon) }
    : null;
}

export function defaultForm(): LogForm {
  const now = toDatetimeLocal(new Date().toISOString());
  return {
    timing_mode: "single",
    start_time: now,
    end_time: now,
    sections: [],
    put_in_lat: "",
    put_in_lon: "",
    put_in_label: "",
    take_out_lat: "",
    take_out_lon: "",
    take_out_label: "",
    name: "",
    note: "",
    visibility_type: "private",
    shared_groups: [],
    shared_users: [],
    visible_from: "",
    trip_id: null,
  };
}

export function initFromDescent(d: Descent): LogForm {
  const vis = d.visibility;
  const isSameDay = d.start_time.slice(0, 10) === d.end_time.slice(0, 10);
  return {
    timing_mode: isSameDay ? "single" : "multi",
    start_time: toDatetimeLocal(d.start_time),
    end_time: toDatetimeLocal(d.end_time),
    sections: [...d.sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        key: String(s.section_id),
        section_id: s.section_id,
        sort_order: s.sort_order,
        note: s.note ?? "",
        display_name: s.section_name ?? `Section #${s.section_id}`,
      })),
    put_in_lat: d.put_in_lat?.toString() ?? "",
    put_in_lon: d.put_in_lon?.toString() ?? "",
    put_in_label: d.put_in_label ?? "",
    take_out_lat: d.take_out_lat?.toString() ?? "",
    take_out_lon: d.take_out_lon?.toString() ?? "",
    take_out_label: d.take_out_label ?? "",
    name: d.name ?? "",
    note: d.note ?? "",
    visibility_type: vis.type,
    shared_groups: vis.type === "shared" ? (vis.groups ?? []) : [],
    shared_users: vis.type === "shared" ? (vis.users ?? []) : [],
    visible_from: d.visible_from ? toDatetimeLocal(d.visible_from) : "",
    trip_id: d.trip_id ?? null,
  };
}

export function makeDraft(
  section: SectionWithFeatures,
  sortOrder: number,
): SectionDraft {
  return {
    key: String(section.id),
    section_id: section.id,
    sort_order: sortOrder,
    note: "",
    display_name: localizedName(section.name, section.names),
    location:
      section.location.type === "LineString"
        ? (section.location as SectionLocation)
        : undefined,
  };
}

export function buildPayload(form: LogForm) {
  const visibility = toVisibility(
    form.visibility_type,
    form.shared_groups,
    form.shared_users,
  );

  return {
    start_time: new Date(form.start_time).toISOString(),
    end_time: new Date(form.end_time).toISOString(),
    name: form.name || null,
    note: form.note || null,
    put_in_lat: form.put_in_lat ? parseFloat(form.put_in_lat) : null,
    put_in_lon: form.put_in_lon ? parseFloat(form.put_in_lon) : null,
    put_in_label: form.put_in_label || null,
    put_in_feature_id: null,
    take_out_lat: form.take_out_lat ? parseFloat(form.take_out_lat) : null,
    take_out_lon: form.take_out_lon ? parseFloat(form.take_out_lon) : null,
    take_out_label: form.take_out_label || null,
    take_out_feature_id: null,
    visibility,
    visible_from: form.visible_from
      ? new Date(form.visible_from).toISOString()
      : null,
    trip_id: form.trip_id,
    sections: form.sections.map((s, i) => ({
      section_id: s.section_id,
      sort_order: i + 1,
      note: s.note || null,
    })),
  };
}
