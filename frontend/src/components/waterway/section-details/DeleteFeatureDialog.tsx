import ConfirmDialog from "@/components/ConfirmDialog";
import type { Feature } from "@/lib/api";
import { useDeleteFeature } from "@/lib/hooks/useSections";
import { featureName } from "./utils";

/** Confirms deleting a feature. The deletion is a proposal first, so the
 * copy says the feature stays until it is approved. */
export function DeleteFeatureDialog({
  feature,
  waterwayId,
  sectionId,
  onClose,
  onDeleted,
}: {
  feature: Feature | null;
  waterwayId: number;
  sectionId: number;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const deleteFeature = useDeleteFeature(waterwayId, sectionId);

  function confirm() {
    if (!feature || deleteFeature.isPending) return;
    deleteFeature.mutate(feature.id, {
      onSuccess: () => {
        onClose();
        onDeleted?.();
      },
    });
  }

  return (
    <ConfirmDialog
      open={feature !== null}
      title="Delete feature?"
      body={`${feature ? `"${featureName(feature)}" - the` : "The"} deletion is submitted as a proposal first; the feature stays until the proposal is approved.`}
      confirmLabel="Delete"
      pendingLabel="Submitting…"
      color="error"
      pending={deleteFeature.isPending}
      onCancel={onClose}
      onConfirm={confirm}
    />
  );
}
