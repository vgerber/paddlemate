import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import MaterialForm from "@/components/materials/MaterialForm";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import { requireMaterials } from "@/lib/features";
import { useGoBack } from "@/lib/hooks/ui/useGoBack";
import { useCreateMaterial } from "@/lib/hooks/useMaterials";
import { useSession } from "@/lib/hooks/useSession";
import { MaterialIcon } from "@/lib/icons";
import { emptyMaterialForm } from "@/lib/materials/form";
import { EMPTY_MATERIAL_SEARCH } from "@/lib/materials/search";
import { isProposal } from "@/lib/proposals";

export const Route = createFileRoute("/materials/new")({
  beforeLoad: () => requireMaterials(),
  component: NewMaterialPage,
});

function NewMaterialPage() {
  const navigate = useNavigate();
  const goBack = useGoBack(() =>
    navigate({
      to: "/materials",
      search: EMPTY_MATERIAL_SEARCH,
      replace: true,
    }),
  );
  const { isAuthenticated, isLoading } = useSession();
  const [values, setValues] = useState(emptyMaterialForm);
  const create = useCreateMaterial();

  if (isLoading) return <LoadingBox size={40} pt={8} />;
  if (!isAuthenticated) {
    return (
      <SignInGate icon={<MaterialIcon />} title="Sign in to add to the wiki" />
    );
  }

  return (
    <MaterialForm
      values={values}
      onChange={setValues}
      title="New entry"
      subtitle="Brand, model and a group are enough to start"
      saving={create.isPending}
      error={create.error}
      onCancel={goBack}
      onSubmit={(body) =>
        create.mutate(body, {
          // A proposal has no entry to open yet: go back to the wiki.
          onSuccess: (result) =>
            isProposal(result)
              ? goBack()
              : navigate({
                  to: "/materials/$materialId",
                  params: { materialId: String(result.id) },
                  search: { edit: false },
                  replace: true,
                }),
        })
      }
    />
  );
}
