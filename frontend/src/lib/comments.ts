import type { CommentCategory } from "@/lib/api";
import { resolveTokens, type TokenSource } from "@/lib/waterLevel";

type CategoryMeta = Record<CommentCategory, { label: string; color?: string }>;

/** Label and colour per note category. A hazard has to read differently
 * from a trip report; everything else stays neutral so the dangerous ones
 * carry the only colour in the list. */
export function categoryMeta(from: TokenSource = "light"): CategoryMeta {
  const tokens = resolveTokens(from);
  return {
    // Text tokens, not the saturated map markers: the marker hues fall under
    // the 4.5 AA floor as text on surface.
    urgent: { label: "Urgent", color: tokens.error },
    danger_temporary: { label: "Hazard", color: tokens.error },
    danger_permanent: {
      label: "Permanent hazard",
      color: tokens.levels.medium.text,
    },
    danger_cleared: { label: "Hazard cleared", color: tokens.levels.low.text },
    calibration: { label: "Gauge" },
    difficulty: { label: "Difficulty" },
    current_conditions: { label: "Conditions" },
    regulations: { label: "Access" },
    logistics: { label: "Logistics" },
    info: { label: "Info" },
  };
}

/** The light meta, for callers that do not follow the scheme yet. */
export const CATEGORY_META = categoryMeta("light");

/** Order the composer offers them in: what a paddler most often reports on
 * the bank comes first, chatter last. */
export const CATEGORY_ORDER: CommentCategory[] = [
  "danger_temporary",
  "danger_cleared",
  "danger_permanent",
  "current_conditions",
  "difficulty",
  "logistics",
  "regulations",
  "calibration",
  "urgent",
  "info",
];

export function categoryLabel(category: CommentCategory): string {
  return CATEGORY_META[category]?.label ?? category;
}

export function categoryColor(
  category: CommentCategory,
  from: TokenSource = "light",
): string | undefined {
  return categoryMeta(from)[category]?.color;
}
