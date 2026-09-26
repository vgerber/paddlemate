import type { Visibility } from "@/lib/api";

export type VisibilityType = Visibility["type"];

/** Build the tagged Visibility a create/patch body expects. */
export function toVisibility(
  type: VisibilityType,
  groups: number[],
  users: string[],
): Visibility {
  if (type === "shared") return { type: "shared", groups, users };
  return { type };
}

export const VISIBILITY_LABEL: Record<VisibilityType, string> = {
  private: "Private",
  shared: "Shared",
  public: "Public",
};
