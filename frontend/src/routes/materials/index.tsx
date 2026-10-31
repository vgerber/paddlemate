import Fab from "@mui/material/Fab";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import MaterialsView from "@/components/materials/MaterialsView";
import WikiPage from "@/components/materials/WikiPage";
import { fabSx } from "@/components/PaneFab";
import { AddIcon } from "@/lib/icons";
import {
  type MaterialWikiSearch,
  parseCompareIds,
  parseMaterialSearch,
  serializeCompareIds,
  toggleModelCompare,
} from "@/lib/materials/materials";

export const Route = createFileRoute("/materials/")({
  validateSearch: parseMaterialSearch,
  component: MaterialWikiPage,
});

function MaterialWikiPage() {
  const navigate = useNavigate({ from: "/materials/" });
  const search = Route.useSearch();
  const compareIds = parseCompareIds(search.compare);

  // Filters and the comparison both live in the URL, so a narrowed list with
  // entries picked is one link.
  const patchSearch = useCallback(
    (patch: Partial<MaterialWikiSearch>) => {
      navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
    },
    [navigate],
  );
  const setCompare = (ids: number[]) =>
    patchSearch({ compare: serializeCompareIds(ids) || undefined });
  const onAdd = () => navigate({ to: "/materials/new" });

  return (
    <WikiPage
      title="Material wiki"
      subtitle="Boats, searchable and comparable"
      onBack={() => navigate({ to: "/tools" })}
    >
      <MaterialsView
        search={search}
        compareIds={compareIds}
        onChange={patchSearch}
        onOpen={(id) =>
          navigate({
            to: "/materials/$materialId",
            params: { materialId: String(id) },
            search: { edit: false },
          })
        }
        onAdd={onAdd}
        onToggleCompare={(model) =>
          setCompare(toggleModelCompare(compareIds, model))
        }
        onClearCompare={() => setCompare([])}
        onCompare={() =>
          navigate({
            to: "/materials/compare",
            search: { ids: serializeCompareIds(compareIds) },
          })
        }
      />
      <Fab color="secondary" onClick={onAdd} aria-label="Add entry" sx={fabSx}>
        <AddIcon />
      </Fab>
    </WikiPage>
  );
}
