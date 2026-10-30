import Box from "@mui/material/Box";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ComparisonTable from "@/components/materials/ComparisonTable";
import WikiPage from "@/components/materials/WikiPage";
import EmptyState from "@/components/states/EmptyState";
import QueryStates from "@/components/states/QueryStates";
import { plural } from "@/lib/format";
import { useGoBack } from "@/lib/hooks/useGoBack";
import { useMaterialComparison } from "@/lib/hooks/useMaterials";
import { CompareIcon } from "@/lib/icons";
import {
  EMPTY_MATERIAL_SEARCH,
  parseCompareIds,
  serializeCompareIds,
} from "@/lib/materials";

export const Route = createFileRoute("/materials/compare")({
  validateSearch: (search: Record<string, unknown>) => ({
    ids: typeof search.ids === "string" ? search.ids : "",
  }),
  component: ComparePage,
});

/** The picked entries side by side. The comparison is the `ids` parameter,
 * so the page is a link somebody can send. */
function ComparePage() {
  const navigate = useNavigate({ from: "/materials/compare" });
  const goBack = useGoBack(() =>
    navigate({
      to: "/materials",
      search: EMPTY_MATERIAL_SEARCH,
      replace: true,
    }),
  );
  const { ids } = Route.useSearch();
  const compareIds = parseCompareIds(ids);
  const query = useMaterialComparison(compareIds);
  const materials = query.data ?? [];

  const remove = (id: number) =>
    navigate({
      search: { ids: serializeCompareIds(compareIds.filter((v) => v !== id)) },
      replace: true,
    });

  return (
    <WikiPage
      title="Compare"
      subtitle={plural(compareIds.length, "entry", "entries")}
      onBack={goBack}
      width={1100}
    >
      <Box sx={{ pt: 1, pb: 3 }}>
        {compareIds.length === 0 ? (
          <EmptyState
            icon={<CompareIcon />}
            title="Nothing to compare."
            caption="Pick entries in the wiki list."
          />
        ) : (
          <QueryStates
            query={query}
            count={materials.length}
            empty={{
              icon: <CompareIcon />,
              title: "Those entries are gone.",
              caption: "Pick entries in the wiki list.",
            }}
          >
            <ComparisonTable materials={materials} onRemove={remove} />
          </QueryStates>
        )}
      </Box>
    </WikiPage>
  );
}
