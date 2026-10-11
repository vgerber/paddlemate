import type { MapScene } from "@/components/canvas/scene";
import type { MapSubject } from "@/components/map/Map";
import type { Descent, SectionWithFeatures } from "@/lib/api";
import { toPseudoSection } from "@/lib/descents";
import { lineCoords } from "@/lib/geo";

type Coord = [number, number];

function boundsOf(points: Coord[]): MapSubject["bounds"] | null {
  if (points.length === 0) return null;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

/** The open log's sections end to end, as one line. */
export function routeCoords(descent: Descent): Coord[] {
  return [...descent.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((s) => lineCoords(s.location) ?? []);
}

/** Each section of the given logs once, as a plain map section. */
export function logSections(descents: Descent[]): SectionWithFeatures[] {
  const seen = new Set<number>();
  const out: SectionWithFeatures[] = [];
  for (const descent of descents) {
    for (const s of descent.sections) {
      if (seen.has(s.section_id)) continue;
      if (s.location?.type !== "LineString") continue;
      seen.add(s.section_id);
      out.push(
        toPseudoSection({
          id: s.section_id,
          name: s.section_name ?? `Section #${s.section_id}`,
          location: s.location,
        }),
      );
    }
  }
  return out;
}

/** What the canvas keeps in view: the open log with its put-in and take-out,
 * else every log. Nothing while an opened log is still loading. */
export function logsSubject(
  open: Descent | undefined,
  descents: Descent[],
  openId?: number,
): MapSubject | null {
  if (open) {
    const points = routeCoords(open);
    if (open.put_in_lat != null && open.put_in_lon != null) {
      points.push([open.put_in_lon, open.put_in_lat]);
    }
    if (open.take_out_lat != null && open.take_out_lon != null) {
      points.push([open.take_out_lon, open.take_out_lat]);
    }
    const bounds = boundsOf(points);
    return bounds ? { key: `log:${open.id}`, bounds } : null;
  }
  if (openId != null) return null;
  const all = logSections(descents).flatMap(
    (s) => lineCoords(s.location) ?? [],
  );
  const bounds = boundsOf(all);
  if (!bounds) return null;
  return { key: `logs:${descents.map((d) => d.id).join(",")}`, bounds };
}

/** The logs map: the open log's sections in teal with its put-in and
 * take-out, every other logged section as a dim line behind them. Sections
 * are drawn one by one, so a gap between two of them stays a gap. */
export function buildLogsScene(
  open: Descent | undefined,
  descents: Descent[],
  openId?: number,
): MapScene {
  const sections = logSections(open ? [open, ...descents] : descents);
  const highlighted = open ? open.sections.map((s) => s.section_id) : [];
  const mine = new Set(highlighted);
  const ghost = sections.map((s) => s.id).filter((id) => !mine.has(id));
  return {
    sections,
    drawing: {
      sectionStates: {
        highlighted: highlighted.length > 0 ? highlighted : undefined,
        ghost: ghost.length > 0 ? ghost : undefined,
      },
    },
    picking: {
      putIn:
        open?.put_in_lat != null && open.put_in_lon != null
          ? { lat: open.put_in_lat, lon: open.put_in_lon }
          : null,
      takeOut:
        open?.take_out_lat != null && open.take_out_lon != null
          ? { lat: open.take_out_lat, lon: open.take_out_lon }
          : null,
    },
    subject: logsSubject(open, descents, openId),
  };
}
