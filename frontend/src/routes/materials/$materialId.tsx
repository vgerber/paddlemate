import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Crumb } from "@/components/Breadcrumb";
import ConfirmDialog from "@/components/ConfirmDialog";
import AddPhotoDialog from "@/components/materials/AddPhotoDialog";
import MaterialDetailView from "@/components/materials/MaterialDetailView";
import MaterialForm from "@/components/materials/MaterialForm";
import { materialMenu } from "@/components/materials/materialMenu";
import PendingProposalNote from "@/components/materials/PendingProposalNote";
import { WIKI_WIDTH, wikiPageTrail } from "@/components/materials/wikiLayout";
import PageFrame from "@/components/PageFrame";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import type { Material } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useGoBack } from "@/lib/hooks/ui/useGoBack";
import {
  useDeleteMaterial,
  useMaterial,
  useMaterialComparison,
  useRemoveBrandImages,
  useRemoveMaterialImage,
  useUpdateMaterial,
} from "@/lib/hooks/useMaterials";
import { useOwnPendingMaterialProposals } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { MaterialIcon } from "@/lib/icons";
import { serializeCompareIds } from "@/lib/materials/compare";
import {
  materialTitle,
  modelSizes,
  modelTitle,
  sinceLabel,
} from "@/lib/materials/facts";
import { materialToForm } from "@/lib/materials/form";
import { EMPTY_MATERIAL_SEARCH } from "@/lib/materials/search";
import { CATEGORY_LABELS, disciplinesLabel } from "@/lib/materials/specs";
import { currentUnits } from "@/lib/prefs/units";
import { isProposal } from "@/lib/proposals";

export const Route = createFileRoute("/materials/$materialId")({
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
  const { isAuthenticated, isAdmin, isLoading, user } = useSession();
  const pending = useOwnPendingMaterialProposals(id, user?.id);
  const query = useMaterial(Number.isInteger(id) && id > 0 ? id : undefined);
  const remove = useDeleteMaterial();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const removePhoto = useRemoveMaterialImage(id);
  const removeBrand = useRemoveBrandImages();
  const [photoToRemove, setPhotoToRemove] = useState<number | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

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
  const siblings = useMaterialComparison(
    material ? modelSizes(material).map((size) => size.id) : [],
  );
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

  if (edit && !isAuthenticated && !isLoading) {
    return (
      <SignInGate icon={<MaterialIcon />} title="Sign in to suggest a change" />
    );
  }
  const trail = (...steps: Crumb[]) =>
    wikiPageTrail(
      { onTools: () => navigate({ to: "/tools" }), onWiki: toWiki },
      ...steps,
    );
  if (edit) {
    return (
      <EditMaterial
        material={material}
        trail={trail(
          { label: modelTitle(material), onClick: () => setEdit(false) },
          { label: "Suggest a change" },
        )}
        onDone={() => setEdit(false)}
      />
    );
  }

  const pickSize = (sizeId: number) =>
    navigate({
      to: "/materials/$materialId",
      params: { materialId: String(sizeId) },
      search: { edit: false },
      replace: true,
    });

  const allSizes =
    siblings.data && siblings.data.length > 1 ? siblings.data : [];

  const subtitle = [
    CATEGORY_LABELS[material.category],
    disciplinesLabel(material.disciplines, material.category),
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
      trail={trail({ label: modelTitle(material) })}
      actions={materialMenu({
        material,
        canDelete: isAuthenticated,
        canCompare: allSizes.length > 0,
        onSuggest: () => setEdit(true),
        onAddPhoto: () => setPhotoOpen(true),
        onCompare: () =>
          navigate({
            to: "/materials/compare",
            search: { ids: serializeCompareIds(allSizes.map((m) => m.id)) },
          }),
        onDelete: () => setConfirmOpen(true),
        onRemovePhoto: isAdmin ? setPhotoToRemove : undefined,
        onRemoveBrandPhotos: isAdmin ? () => setBrandOpen(true) : undefined,
      })}
    >
      <PendingProposalNote proposals={pending.data ?? []} />
      <MaterialDetailView
        material={material}
        allSizes={allSizes}
        onPickSize={pickSize}
        onSuggest={() => setEdit(true)}
      />
      <AddPhotoDialog
        materialId={material.id}
        alt={`${material.brand} ${material.model}`}
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
      />
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
  trail,
  onDone,
}: {
  material: Material;
  trail: Crumb[];
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
      subtitle="Suggest a change"
      trail={trail}
      saving={update.isPending}
      error={update.error}
      onCancel={onDone}
      original={material}
      onSubmit={(body) => update.mutate(body, { onSuccess: onDone })}
    />
  );
}
