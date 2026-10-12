import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { type ReactNode, useMemo, useState } from "react";
import type { RowAction } from "@/components/RowMenu";
import type { Feature, SectionWithFeatures } from "@/lib/api";
import { lineCoords } from "@/lib/geo";
import { useSession } from "@/lib/hooks/useSession";
import { DeleteFeatureDialog } from "./DeleteFeatureDialog";
import { splitBaseGrade } from "./rows";
import { computeExtent, sectionLengthM } from "./utils";

/** Edit and Delete for the section's base grade. The grade has no row of its
 * own, so these live in the panel's header menu and apply on every tab; the
 * delete confirmation comes back as `dialog` for the caller to render. */
export function useGradeActions(
  section: SectionWithFeatures | undefined,
  onEditFeature?: (f: Feature) => void,
  onDeleted?: () => void,
): { actions: RowAction[]; dialog: ReactNode } {
  const { isAuthenticated } = useSession();
  const [target, setTarget] = useState<Feature | null>(null);

  const grade = useMemo(() => {
    if (!section) return null;
    const line = lineCoords(section.location) ?? [];
    const all = section.features.map((f) => computeExtent(f, line));
    return splitBaseGrade(all, sectionLengthM(line)).grade;
  }, [section]);

  const actions: RowAction[] = [];
  if (grade && isAuthenticated && onEditFeature) {
    actions.push({
      label: "Edit grade",
      icon: <EditOutlinedIcon fontSize="small" />,
      onClick: () => onEditFeature(grade.feature),
    });
  }
  if (grade && isAuthenticated) {
    actions.push({
      label: "Delete grade",
      icon: <DeleteOutlinedIcon fontSize="small" />,
      danger: true,
      onClick: () => setTarget(grade.feature),
    });
  }

  const dialog = section ? (
    <DeleteFeatureDialog
      feature={target}
      waterwayId={section.waterway_id}
      sectionId={section.id}
      onClose={() => setTarget(null)}
      onDeleted={onDeleted}
    />
  ) : null;

  return { actions, dialog };
}
