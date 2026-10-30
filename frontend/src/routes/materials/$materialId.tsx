import Box from "@mui/material/Box";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import MaterialDetailView, {
  materialActions,
} from "@/components/materials/MaterialDetailView";
import MaterialForm from "@/components/materials/MaterialForm";
import WikiPage from "@/components/materials/WikiPage";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import type { Material } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useGoBack } from "@/lib/hooks/useGoBack";
import {
  useDeleteMaterial,
  useMaterial,
  useUpdateMaterial,
} from "@/lib/hooks/useMaterials";
import { useSession } from "@/lib/hooks/useSession";
import { MaterialIcon } from "@/lib/icons";
import {
  CATEGORY_LABELS,
  EMPTY_MATERIAL_SEARCH,
  enumLabel,
  materialTitle,
  materialToForm,
  yearsLabel,
} from "@/lib/materials";
import { PANEL_HEIGHT } from "@/lib/theme";

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
  const { isAuthenticated, isAdmin } = useSession();
  const query = useMaterial(Number.isInteger(id) && id > 0 ? id : undefined);
  const remove = useDeleteMaterial();
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const subtitle = [
    CATEGORY_LABELS[material.category],
    material.discipline && enumLabel(material.discipline),
    yearsLabel(material),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <WikiPage
      title={materialTitle(material)}
      subtitle={subtitle}
      onBack={goBack}
      actions={materialActions({
        canEdit: isAuthenticated,
        canDelete: isAdmin,
        onEdit: () => setEdit(true),
        onDelete: () => setConfirmOpen(true),
      })}
    >
      <MaterialDetailView material={material} />
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this entry?"
        body={`${materialTitle(material)} is removed from the wiki for everyone.`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        color="error"
        pending={remove.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => remove.mutate(material.id, { onSuccess: toWiki })}
      />
    </WikiPage>
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
  const [values, setValues] = useState(() => materialToForm(material));
  const update = useUpdateMaterial(material.id);
  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: "auto",
        height: PANEL_HEIGHT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <MaterialForm
        values={values}
        onChange={setValues}
        title={materialTitle(material)}
        subtitle="Correct this entry"
        saving={update.isPending}
        error={update.error}
        onCancel={onDone}
        onSubmit={(body) => update.mutate(body, { onSuccess: onDone })}
      />
    </Box>
  );
}
