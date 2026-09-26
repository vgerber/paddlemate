import type {
  CreateTripRequest,
  PatchTripRequest,
  Trip,
  TripStayKind,
} from "@/lib/api";

export interface TripForm {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  /** The first stay, so the watch list always has somewhere to hang. */
  stay_kind: TripStayKind;
  stay_name: string;
}

export function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function defaultTripForm(): TripForm {
  return {
    name: "",
    description: "",
    start_date: toDateInput(new Date().toISOString()),
    end_date: "",
    stay_kind: "camp",
    stay_name: "",
  };
}

export function initFromTrip(t: Trip): TripForm {
  return {
    name: t.name,
    description: t.description ?? "",
    start_date: t.start_date,
    end_date: t.end_date ?? "",
    stay_kind: "camp",
    stay_name: "",
  };
}

export function buildCreatePayload(form: TripForm): CreateTripRequest {
  return {
    name: form.name.trim(),
    description: form.description || null,
    start_date: form.start_date,
    end_date: form.end_date || null,
    stay: { kind: form.stay_kind, name: form.stay_name.trim() },
  };
}

export function buildPatchPayload(form: TripForm): PatchTripRequest {
  return {
    name: form.name.trim(),
    description: form.description || null,
    start_date: form.start_date,
    end_date: form.end_date || null,
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
  return null;
}
