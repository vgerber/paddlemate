import Fab from "@mui/material/Fab";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import MaterialsView from "@/components/materials/MaterialsView";
import { WIKI_WIDTH } from "@/components/materials/wikiLayout";
import PageFrame from "@/components/PageFrame";
import { fabSx } from "@/components/PaneFab";
import { requireMaterials } from "@/lib/features";
import { AddIcon } from "@/lib/icons";
import {
  parseCompareIds,
  serializeCompareIds,
  toggleCompareId,
  toggleModelCompare,
} from "@/lib/materials/compare";
import {
  type MaterialWikiSearch,
  parseMaterialSearch,
} from "@/lib/materials/search";

export const Route = createFileRoute("/materials/")({
  beforeLoad: () => requireMaterials(),
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
    <PageFrame
      title="Material wiki"
      subtitle="Boats, searchable and comparable"
      onBack={() => navigate({ to: "/tools" })}
      width={WIKI_WIDTH}
      headerOnPhoneOnly
      fill
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
        onTools={() => navigate({ to: "/tools" })}
        onToggleCompare={(model) =>
          setCompare(toggleModelCompare(compareIds, model))
        }
        onToggleSize={(id) => setCompare(toggleCompareId(compareIds, id))}
        onClearCompare={() => setCompare([])}
        onCompare={() =>
          navigate({
            to: "/materials/compare",
            search: { ids: serializeCompareIds(compareIds) },
          })
        }
      />
      <Fab
        color="primary"
        onClick={onAdd}
        aria-label="Add entry"
        sx={{
          ...fabSx,
          // The compare bar owns the foot of the list while entries are picked.
          display: { xs: compareIds.length > 0 ? "none" : "flex", md: "none" },
        }}
      >
        <AddIcon />
      </Fab>
    </PageFrame>
  );
}
