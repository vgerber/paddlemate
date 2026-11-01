import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import MaterialDetailView, {
  materialActions,
} from "@/components/materials/MaterialDetailView";
import MaterialForm from "@/components/materials/MaterialForm";
import PendingProposalNote from "@/components/materials/PendingProposalNote";
import { WIKI_WIDTH } from "@/components/materials/wikiLayout";
import PageFrame from "@/components/PageFrame";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import type { Material } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { requireMaterials } from "@/lib/features";
import { useGoBack } from "@/lib/hooks/ui/useGoBack";
import {
  useDeleteMaterial,
  useMaterial,
  useRemoveBrandImages,
  useRemoveMaterialImage,
  useUpdateMaterial,
} from "@/lib/hooks/useMaterials";
import { useOwnPendingMaterialProposals } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { MaterialIcon } from "@/lib/icons";
import { materialTitle, modelTitle, sinceLabel } from "@/lib/materials/facts";
import { materialToForm } from "@/lib/materials/form";
import { EMPTY_MATERIAL_SEARCH } from "@/lib/materials/search";
import { CATEGORY_LABELS, disciplineLabel } from "@/lib/materials/specs";
import { currentUnits } from "@/lib/prefs/units";
import { isProposal } from "@/lib/proposals";

export const Route = createFileRoute("/materials/$materialId")({
  beforeLoad: () => requireMaterials(),
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === "true",
  }),
  component: MaterialPage,
});

const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404;

function MaterialPage() {
  const navigate = useNavigate();
  const { materialId } = Route.useParams();
  const { edit } = Route.useSearch();
  const id = Number(materialId);
  const { isAuthenticated, isAdmin, user } = useSession();
  const pending = useOwnPendingMaterialProposals(id, user?.id);
  const query = useMaterial(Number.isInteger(id) && id > 0 ? id : undefined);
  const remove = useDeleteMaterial();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const removePhoto = useRemoveMaterialImage(id);
  const removeBrand = useRemoveBrandImages();
  const [photoToRemove, setPhotoToRemove] = useState<number | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);

  const toWiki = () =>
    navigate({
      to: "/materials",
      search: EMPTY_MATERIAL_SEARCH,
      replace: true,
    });
  const goBack = useGoBack(toWiki);
  const setEdit = (value: boolean) =>
    navigate({
      to: "/materials/$materialId",
      params: { materialId },
      search: { edit: value },
      replace: true,
    });

  const material = query.data;
  if (query.isLoading) return <LoadingBox size={40} pt={8} />;
  if (query.isError && !isNotFound(query.error)) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (!material) {
    return (
      <EmptyState
        icon={<MaterialIcon />}
        title="This entry is not in the wiki."
      />
    );
  }

  if (edit && isAuthenticated) {
    return <EditMaterial material={material} onDone={() => setEdit(false)} />;
  }

  const pickSize = (sizeId: number) =>
    navigate({
      to: "/materials/$materialId",
      params: { materialId: String(sizeId) },
      search: { edit: false },
      replace: true,
    });

  const subtitle = [
    CATEGORY_LABELS[material.category],
    material.discipline &&
      disciplineLabel(material.discipline, material.category),
    sinceLabel(material),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageFrame
      width={WIKI_WIDTH}
      title={modelTitle(material)}
      subtitle={subtitle}
      onBack={goBack}
      actions={materialActions({
        material,
        onRemovePhoto: isAdmin ? setPhotoToRemove : undefined,
        onRemoveBrandPhotos: isAdmin ? () => setBrandOpen(true) : undefined,
        canEdit: isAuthenticated,
        canDelete: isAuthenticated,
        onEdit: () => setEdit(true),
        onDelete: () => setConfirmOpen(true),
      })}
    >
      <PendingProposalNote proposals={pending.data ?? []} />
      <MaterialDetailView material={material} onPickSize={pickSize} />
      <ConfirmDialog
        open={photoToRemove != null}
        title="Remove this photo?"
        body="The photo is deleted from the server and never fetched again."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        color="error"
        pending={removePhoto.isPending}
        onCancel={() => setPhotoToRemove(null)}
        onConfirm={() =>
          photoToRemove != null &&
          removePhoto.mutate(photoToRemove, {
            onSuccess: () => setPhotoToRemove(null),
          })
        }
      />
      <ConfirmDialog
        open={brandOpen}
        title={`Remove all ${material.brand} photos?`}
        body={`Every ${material.brand} photo in the wiki is deleted from the server and never fetched again.`}
        confirmLabel="Remove all"
        pendingLabel="Removing…"
        color="error"
        pending={removeBrand.isPending}
        onCancel={() => setBrandOpen(false)}
        onConfirm={() =>
          removeBrand.mutate(material.brand, {
            onSuccess: () => setBrandOpen(false),
          })
        }
      />
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this entry?"
        body={
          isAdmin
            ? `${materialTitle(material)} is removed from the wiki for everyone.`
            : `${materialTitle(material)} stays in the wiki until an admin has taken a look.`
        }
        confirmLabel={isAdmin ? "Delete" : "Send for review"}
        pendingLabel={isAdmin ? "Deleting…" : "Sending…"}
        color="error"
        pending={remove.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() =>
          remove.mutate(material.id, {
            onSuccess: (result) => {
              if (isProposal(result)) setConfirmOpen(false);
              else toWiki();
            },
          })
        }
      />
    </PageFrame>
  );
}

/** The form seeded from the stored entry. Its own component so the fields
 * start from the entry once it is loaded. */
function EditMaterial({
  material,
  onDone,
}: {
  material: Material;
  onDone: () => void;
}) {
  const [values, setValues] = useState(() =>
    materialToForm(material, currentUnits()),
  );
  const update = useUpdateMaterial(material.id);
  return (
    <MaterialForm
      values={values}
      onChange={setValues}
      title={materialTitle(material)}
      subtitle="Correct this entry"
      saving={update.isPending}
      error={update.error}
      onCancel={onDone}
      original={material}
      onSubmit={(body) => update.mutate(body, { onSuccess: onDone })}
    />
  );
}
