import Box from "@mui/material/Box";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import MaterialForm from "@/components/materials/MaterialForm";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import { useGoBack } from "@/lib/hooks/ui/useGoBack";
import { useCreateMaterial } from "@/lib/hooks/useMaterials";
import { useSession } from "@/lib/hooks/useSession";
import { MaterialIcon } from "@/lib/icons";
import {
  EMPTY_MATERIAL_SEARCH,
  emptyMaterialForm,
} from "@/lib/materials/materials";
import { PANEL_HEIGHT } from "@/lib/theme/theme";

export const Route = createFileRoute("/materials/new")({
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
        title="New entry"
        subtitle="Brand and model are enough to start"
        saving={create.isPending}
        error={create.error}
        onCancel={goBack}
        onSubmit={(body) =>
          create.mutate(body, {
            onSuccess: (material) =>
              navigate({
                to: "/materials/$materialId",
                params: { materialId: String(material.id) },
                search: { edit: false },
                replace: true,
              }),
          })
        }
      />
    </Box>
  );
}
