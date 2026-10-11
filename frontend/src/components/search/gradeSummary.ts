export const GRADE_OPTIONS = [
  { label: "Any", value: "" },
  { label: "I", value: 1 },
  { label: "II", value: 2 },
  { label: "III", value: 3 },
  { label: "IV", value: 4 },
  { label: "V", value: 5 },
  { label: "VI", value: 6 },
  { label: "X", value: 10 },
];

const GRADE_LABELS = new Map(GRADE_OPTIONS.map((o) => [o.value, o.label]));

/** What the Grade chip reads: "III-IV", "III" for a single grade, "III+"
 * with only a minimum, "-IV" with only a maximum, empty when nothing is set. */
export function gradeSummary(minDiff: number | "", maxDiff: number | "") {
  const min = GRADE_LABELS.get(minDiff);
  const max = GRADE_LABELS.get(maxDiff);
  if (minDiff !== "" && maxDiff !== "") {
    return minDiff === maxDiff ? min : `${min}-${max}`;
  }
  if (minDiff !== "") return `${min}+`;
  if (maxDiff !== "") return `-${max}`;
  return "";
}
