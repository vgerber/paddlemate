import Box from "@mui/material/Box";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ComparisonTable from "@/components/materials/ComparisonTable";
import { WIKI_WIDTH } from "@/components/materials/wikiLayout";
import PageFrame from "@/components/PageFrame";
import EmptyState from "@/components/states/EmptyState";
import QueryStates from "@/components/states/QueryStates";
import { requireMaterials } from "@/lib/features";
import { useGoBack } from "@/lib/hooks/ui/useGoBack";
import { useMaterialComparison } from "@/lib/hooks/useMaterials";
import { CompareIcon } from "@/lib/icons";
import { parseCompareIds, serializeCompareIds } from "@/lib/materials/compare";
import { EMPTY_MATERIAL_SEARCH, searchText } from "@/lib/materials/search";
import { plural } from "@/lib/text/format";

export const Route = createFileRoute("/materials/compare")({
  beforeLoad: () => requireMaterials(),
  validateSearch: (search: Record<string, unknown>) => ({
    ids: searchText(search.ids) ?? "",
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

  const resize = (from: number, to: number) =>
    navigate({
      search: {
        ids: serializeCompareIds(
          compareIds.includes(to)
            ? compareIds.filter((v) => v !== from)
            : compareIds.map((v) => (v === from ? to : v)),
        ),
      },
      replace: true,
    });

  // The list opens with the picks kept, so adding is one more tick.
  const add = () =>
    navigate({
      to: "/materials",
      search: { ...EMPTY_MATERIAL_SEARCH, compare: ids || undefined },
    });

  return (
    <PageFrame
      title="Compare"
      subtitle={plural(compareIds.length, "entry", "entries")}
      onBack={goBack}
      width={WIKI_WIDTH}
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
            <ComparisonTable
              materials={materials}
              onRemove={remove}
              onResize={resize}
              onAdd={add}
            />
          </QueryStates>
        )}
      </Box>
    </PageFrame>
  );
}
