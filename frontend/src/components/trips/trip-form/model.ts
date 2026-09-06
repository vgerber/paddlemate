import type {
  CreateTripRequest,
  PatchTripRequest,
  Trip,
  TripStayKind,
} from "@/lib/api";
import { toVisibility, type VisibilityType } from "@/lib/visibility";

export interface TripForm {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  visibility_type: VisibilityType;
  shared_groups: number[];
  shared_users: string[];
  visible_from: string;
  /** The first stay, so the watch list always has somewhere to hang. */
  stay_kind: TripStayKind;
  stay_name: string;
}

export function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

function toDatetimeLocal(iso: string): string {
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZoneName: undefined })
    .slice(0, 16)
    .replace(" ", "T");
}

export function defaultTripForm(): TripForm {
  return {
    name: "",
    description: "",
    start_date: toDateInput(new Date().toISOString()),
    end_date: "",
    visibility_type: "private",
    shared_groups: [],
    shared_users: [],
    visible_from: "",
    stay_kind: "camp",
    stay_name: "",
  };
}

export function initFromTrip(t: Trip): TripForm {
  const vis = t.visibility;
  return {
    name: t.name,
    description: t.description ?? "",
    start_date: t.start_date,
    end_date: t.end_date ?? "",
    visibility_type: vis.type,
    shared_groups: vis.type === "shared" ? (vis.groups ?? []) : [],
    shared_users: vis.type === "shared" ? (vis.users ?? []) : [],
    visible_from: t.visible_from ? toDatetimeLocal(t.visible_from) : "",
    stay_kind: "camp",
    stay_name: "",
  };
}

function visibleFrom(form: TripForm): string | null {
  return form.visible_from ? new Date(form.visible_from).toISOString() : null;
}

export function buildCreatePayload(form: TripForm): CreateTripRequest {
  return {
    name: form.name.trim(),
    description: form.description || null,
    start_date: form.start_date,
    end_date: form.end_date || null,
    visibility: toVisibility(
      form.visibility_type,
      form.shared_groups,
      form.shared_users,
    ),
    visible_from: visibleFrom(form),
    stay: { kind: form.stay_kind, name: form.stay_name.trim() },
  };
}

export function buildPatchPayload(form: TripForm): PatchTripRequest {
  return {
    name: form.name.trim(),
    description: form.description || null,
    start_date: form.start_date,
    end_date: form.end_date || null,
    visibility: toVisibility(
      form.visibility_type,
      form.shared_groups,
      form.shared_users,
    ),
    visible_from: visibleFrom(form),
  };
}

/** The first problem with the form, or null when it is ready to save. */
export function tripFormError(
  form: TripForm,
  needsStay: boolean,
): string | null {
  if (!form.name.trim()) return "A trip needs a name.";
  if (!form.start_date) return "A trip needs a start date.";
  if (form.end_date && form.end_date < form.start_date) {
    return "The end date cannot be before the start date.";
  }
  if (needsStay && !form.stay_name.trim()) {
    return "Name the first stay - a rough idea is enough.";
  }
  if (
    form.visibility_type === "shared" &&
    form.shared_groups.length === 0 &&
    form.shared_users.length === 0
  ) {
    return "Shared visibility needs at least one user or group.";
  }
  return null;
}
