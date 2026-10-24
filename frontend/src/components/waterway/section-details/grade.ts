import type { SectionWithFeatures } from "@/lib/api";
import { lineCoords, parseDifficulty } from "@/lib/geo";
import type { ComputedFeature } from "./types";
import { computeExtent, featureDifficulty, sectionLengthM } from "./utils";

/** A whitewater range with a grade, placed along the section in km. */
export interface GradeSpan {
  grade: string;
  startKm: number;
  endKm: number;
}

/** The section's grade: the grade over most of the run, and the hardest
 * harder stretch inside it, as guidebooks write "III (IV)". */
export interface SectionGrade {
  base: string;
  harder: string | null;
}

/** A grade range covering this share of the section is the section's grade. */
export const BASE_COVERAGE = 0.8;

/** Orders grades: "III" < "III+" < "IV-" < "IV". */
export function gradeRank(grade: string): number {
  const n = parseDifficulty(grade) ?? 0;
  if (grade.endsWith("+")) return n + 0.3;
  if (grade.endsWith("-")) return n - 0.3;
  return n;
}

function coverage(span: GradeSpan, lengthKm: number): number {
  const covered = Math.min(span.endKm, lengthKm) - Math.max(span.startKm, 0);
  return Math.max(0, covered) / lengthKm;
}

/** The range that gives the section its grade: the widest one covering
 * `BASE_COVERAGE` of the run, or null. */
export function baseSpan<T extends GradeSpan>(
  spans: T[],
  lengthKm: number,
): T | null {
  if (lengthKm <= 0) return null;
  let best: T | null = null;
  let bestCover = 0;
  for (const span of spans) {
    if (parseDifficulty(span.grade) === null) continue;
    const cover = coverage(span, lengthKm);
    if (cover >= BASE_COVERAGE - 1e-9 && cover > bestCover) {
      best = span;
      bestCover = cover;
    }
  }
  return best;
}

/** The grade of a section from its graded ranges, or null when no range
 * covers enough of the run to speak for it. */
export function sectionGrade(
  spans: GradeSpan[],
  sectionLengthKm: number,
): SectionGrade | null {
  const base = baseSpan(spans, sectionLengthKm);
  if (!base) return null;
  const harder = spans
    .filter((s) => s !== base && gradeRank(s.grade) > gradeRank(base.grade))
    .reduce<string | null>(
      (top, s) =>
        top === null || gradeRank(s.grade) > gradeRank(top) ? s.grade : top,
      null,
    );
  return { base: base.grade, harder };
}

/** The graded whitewater ranges among approved features. */
export function gradeSpans(items: ComputedFeature[]): (GradeSpan & {
  item: ComputedFeature;
})[] {
  return items.flatMap((item) => {
    const grade = featureDifficulty(item.feature);
    if (
      item.proposal ||
      !item.isZone ||
      item.feature.feature_type !== "whitewater" ||
      !grade
    ) {
      return [];
    }
    return [
      { grade, startKm: item.startM / 1000, endKm: item.endM / 1000, item },
    ];
  });
}

/** `sectionGrade` for a section as the API returns it. */
export function sectionGradeOf(
  section: SectionWithFeatures,
): SectionGrade | null {
  const line = lineCoords(section.location) ?? [];
  const items = section.features.map((f) => computeExtent(f, line));
  return sectionGrade(gradeSpans(items), sectionLengthM(line) / 1000);
}

/** "III (IV)" or "III". */
export function gradeLabel(grade: SectionGrade): string {
  return grade.harder ? `${grade.base} (${grade.harder})` : grade.base;
}

/** The grade a section shows wherever it is named: lists, map labels and the
 * panel subtitle, or null when it has none. */
export function sectionGradeText(section: SectionWithFeatures): string | null {
  const cached = gradeTexts.get(section);
  if (cached !== undefined) return cached;
  const grade = sectionGradeOf(section);
  const text = grade ? gradeLabel(grade) : null;
  gradeTexts.set(section, text);
  return text;
}

/** Rows ask on every render and the answer projects every feature vertex onto
 * the section line, so it is kept per section object. */
const gradeTexts = new WeakMap<SectionWithFeatures, string | null>();
