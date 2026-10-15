import {
  differenceInCalendarDays,
  format,
  isSameYear,
  parseISO,
  startOfYear,
  subDays,
} from "date-fns";
import type { CommentCategory, Descent, Proposal } from "@/lib/api";
import type { components } from "@/lib/api/schema";
import { categoryColor, categoryLabel } from "@/lib/comments";
import { formatReading } from "@/lib/format";
import { proposalTitle } from "@/lib/proposals";
import { LEVEL_ORDER, type WaterLevel } from "@/lib/waterLevel";

type Comment = components["schemas"]["Comment"];
type Snapshot = components["schemas"]["SectionWaterSnapshot"];

export const ROW_PX = 56;
export const CAPTION_PX = 32;
export const MAX_ROWS = 5;
/** Hazard notes older than this no longer warn. */
export const HAZARD_DAYS = 90;
/** Skeletons wait this long, so a fast answer never flashes them. */
export const SKELETON_DELAY_MS = 150;

const HAZARD_CATEGORIES: CommentCategory[] = ["urgent", "danger_temporary"];

export type StateTab = "notes" | "logs" | "features";

export interface StateRow {
  key: "hazard" | "paddled" | "note" | "proposal";
  title: string;
  /** Leading word of the second line, drawn in a category color. */
  lead?: { text: string; color?: string };
  detail: string;
  /** Right-hand date. */
  when?: string;
  /** The tab holding the detail; a row opens it when asked. */
  opens: StateTab;
}

const byNewest = (a: Comment, b: Comment) =>
  parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime();

/** Open hazard and urgent notes, newest first. A cleared note newer than a
 * hazard hides it (approximation until the API links the two). */
export function hazardNotes(comments: Comment[], now: Date): Comment[] {
  const ok = comments.filter((c) => c.status === "ok");
  const cleared = ok
    .filter((c) => c.category === "danger_cleared")
    .sort(byNewest)[0];
  const since = subDays(now, HAZARD_DAYS).getTime();
  return ok
    .filter((c) => HAZARD_CATEGORIES.includes(c.category))
    .filter((c) => parseISO(c.created_at).getTime() >= since)
    .filter(
      (c) =>
        !cleared ||
        parseISO(c.created_at).getTime() >
          parseISO(cleared.created_at).getTime(),
    )
    .sort(byNewest);
}

const author = (c: Comment) => c.author_name || "someone";

/** "Today", "Yesterday", "5 Oct", or "5 Oct 2025" from another year. */
export function dayLabel(iso: string, now: Date): string {
  const day = parseISO(iso);
  const ago = differenceInCalendarDays(now, day);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  return format(day, isSameYear(day, now) ? "d MMM" : "d MMM yyyy");
}

export function hazardRow(hazards: Comment[], now: Date): StateRow | null {
  const top = hazards[0];
  if (!top) return null;
  const more = hazards.length - 1;
  return {
    key: "hazard",
    title: top.body,
    lead: {
      text: categoryLabel(top.category),
      color: categoryColor(top.category),
    },
    detail: `, ${author(top)}${more > 0 ? `, +${more} more` : ""}`,
    when: dayLabel(top.created_at, now),
    opens: "notes",
  };
}

/** The newest ok note that is not already the hazard row's. */
export function noteRow(
  comments: Comment[],
  hazards: Comment[],
  now: Date,
): StateRow | null {
  const ok = comments.filter((c) => c.status === "ok");
  const top = ok.filter((c) => c.id !== hazards[0]?.id).sort(byNewest)[0];
  if (!top) return null;
  return {
    key: "note",
    title: top.body,
    detail: `${author(top)} · ${ok.length} ${ok.length === 1 ? "note" : "notes"}`,
    when: dayLabel(top.created_at, now),
    opens: "notes",
  };
}

/** The snapshot to quote for a log: the most severe level it recorded for
 * this section. */
function bestSnapshot(snaps: Snapshot[]): Snapshot | null {
  const read = snaps.filter((s) => s.value != null);
  return (
    read.sort(
      (a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level),
    )[0] ?? null
  );
}

/** "At 82 cm, medium - same as now"; empty when the log recorded no level. */
export function levelText(
  descent: Descent,
  sectionId: number,
  now: WaterLevel | null,
): string {
  const snaps =
    descent.sections.find((s) => s.section_id === sectionId)?.water_snapshots ??
    [];
  const snap = bestSnapshot(snaps);
  if (!snap || snap.value == null) return "";
  const calibrated =
    snap.range_low != null ||
    snap.range_medium != null ||
    snap.range_high != null;
  const reading = `At ${formatReading(snap.value, snap.unit)}`;
  if (!calibrated) return reading;
  const word = snap.level;
  const same = now !== null && now === snap.level ? " - same as now" : "";
  return `${reading}, ${word}${same}`;
}

export function paddledRow(
  descent: Descent | undefined,
  opts: {
    sectionId: number;
    viewerId: string | null;
    level: WaterLevel | null;
    thisYear: number;
    now: Date;
  },
): StateRow | null {
  if (!descent) return null;
  const who =
    opts.viewerId !== null && descent.user_id === opts.viewerId
      ? "you"
      : (descent.username ?? "someone");
  const parts = [
    levelText(descent, opts.sectionId, opts.level),
    opts.thisYear > 0
      ? `${opts.thisYear} ${opts.thisYear === 1 ? "log" : "logs"} this year`
      : "",
  ].filter(Boolean);
  return {
    key: "paddled",
    title: `Last paddled by ${who}`,
    detail: parts.join(" · "),
    when: dayLabel(descent.start_time, opts.now),
    opens: "logs",
  };
}

export function proposalRow(proposals: Proposal[], now: Date): StateRow | null {
  if (proposals.length === 0) return null;
  const newest = [...proposals].sort(
    (a, b) =>
      parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime(),
  )[0];
  return {
    key: "proposal",
    title: `${proposals.length} open ${proposals.length === 1 ? "proposal" : "proposals"}`,
    detail: proposalTitle(newest),
    when: dayLabel(newest.created_at, now),
    opens: "features",
  };
}

/** Jan 1 of the current year, the lower bound of "logs this year". */
export function yearStartIso(now: Date): string {
  return startOfYear(now).toISOString();
}

/** "Added 12 Mar 2026 by vincent, edited 3 Oct". Imported sections have no
 * author, and an untouched one no edit. */
export function captionText(opts: {
  createdAt: string;
  updatedAt: string;
  by?: string | null;
  now: Date;
}): string {
  const added = parseISO(opts.createdAt);
  const edited = parseISO(opts.updatedAt);
  const addedPart = `Added ${format(added, "d MMM yyyy")}${opts.by ? ` by ${opts.by}` : ""}`;
  if (differenceInCalendarDays(edited, added) < 1) return addedPart;
  const editedDay = format(
    edited,
    isSameYear(edited, opts.now) ? "d MMM" : "d MMM yyyy",
  );
  return `${addedPart}, edited ${editedDay}`;
}

export interface Fit {
  /** How many rows are drawn. */
  rows: number;
  caption: boolean;
}

/** Rows drop from the bottom when room is short. The caption needs room
 * after every row, so it never sits alone under a cut list. Under one row of
 * room nothing is drawn. */
export function fitRows(
  rowCount: number,
  room: number,
  hasCaption: boolean,
): Fit {
  const rows = Math.min(rowCount, MAX_ROWS, Math.floor(room / ROW_PX));
  if (rows < 1) return { rows: 0, caption: false };
  const caption =
    hasCaption && rows === rowCount && room - rows * ROW_PX >= CAPTION_PX;
  return { rows, caption };
}

/** The rows that have something to say, in the order a paddler asks: what
 * could hurt, who was here, what was said, what is pending. */
export function orderRows(
  parts: Partial<Record<StateRow["key"], StateRow | null>>,
): StateRow[] {
  return (["hazard", "paddled", "note", "proposal"] as const).flatMap((k) => {
    const row = parts[k];
    return row ? [row] : [];
  });
}
