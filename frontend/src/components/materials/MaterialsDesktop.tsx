import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Breadcrumb from "@/components/Breadcrumb";
import DockedAction from "@/components/DockedAction";
import { HeaderCard } from "@/components/PageFrame";
import PanelHeader from "@/components/PanelHeader";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import SectionHeading from "@/components/SectionHeading";
import FilterChip from "@/components/search/FilterChip";
import SearchField from "@/components/search/SearchField";
import { useMaterialTree } from "@/lib/hooks/useMaterials";
import { AVAILABILITY_LABELS } from "@/lib/materials/availability";
import { formatFits } from "@/lib/materials/facts";
import {
  crumbs,
  pathOf,
  pathPatch,
  selectedTotals,
  type TreePath,
  treeFilters,
} from "@/lib/materials/tree";
import { useUnits } from "@/lib/prefs/units";
import { humanize, plural, sentenceCase } from "@/lib/text/format";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";
import {
  canResetFilters,
  FilterFields,
  RESET_PATCH,
} from "./MaterialFiltersSheet";
import { CompareBar, ModelResults } from "./MaterialResults";
import MaterialTree from "./MaterialTree";
import { type MaterialsViewProps, useWikiList } from "./useWikiList";
import { wikiTrail } from "./wikiTrail";

const { tokens } = theme;

/** Width of the sidebar, px. */
const SIDEBAR = 300;

/** Least height the tree keeps when the filters crowd it, px. */
const TREE_MIN = 180;

/** The desktop wiki: a sidebar with the search, the category tree and the
 * filters beside a page of the models, sized to the window. */
export default function MaterialsDesktop(props: MaterialsViewProps) {
  const { search, compareIds, onChange } = props;
  const [units] = useUnits();
  const { text, setText, query, items } = useWikiList(search, onChange);
  const tree = useMaterialTree(treeFilters(search));
  const totals = selectedTotals(tree.data, pathOf(search, tree.data));
  const select = (path: TreePath) => onChange(pathPatch(path));
  const steps = crumbs(search, tree.data);
  const title = steps.at(-1)?.label ?? "Material wiki";

  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Breadcrumb
        crumbs={wikiTrail(search, select, props.onTools, tree.data)}
      />
      <Box sx={{ flexShrink: 0 }}>
        <HeaderCard testId="wiki-header">
          <PanelHeader
            title={title}
            subtitle={
              totals
                ? `${plural(totals.models, "model")}, ${plural(totals.entries, "size")}`
                : " "
            }
            onBack={props.onTools}
          />
        </HeaderCard>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `${SIDEBAR}px minmax(0, 1fr)`,
          gridTemplateRows: "minmax(0, 1fr)",
          gap: 1,
        }}
      >
        <Box
          component="aside"
          aria-label="Search and browse"
          data-column="wiki-sidebar"
          sx={{
            ...phoneCardSx,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              p: 1,
            }}
          >
            <SearchField
              label="Brand or model"
              maxLength={100}
              value={text}
              onChange={setText}
            />
            <Box
              sx={{ flex: "1 1 auto", minHeight: TREE_MIN, overflowY: "auto" }}
            >
              <MaterialTree
                search={search}
                onSelect={select}
                onOpen={props.onOpen}
                total={selectedTotals(tree.data, {})?.models}
              />
            </Box>
            <Box
              sx={{
                flexShrink: 0,
                display: "grid",
                gap: 1,
                px: 1,
                pt: 1.5,
                borderTop: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
              }}
            >
              <SectionHeading
                first
                action={
                  <Button
                    onClick={() => onChange(RESET_PATCH)}
                    disabled={!canResetFilters(search)}
                  >
                    Reset
                  </Button>
                }
              >
                Filters
              </SectionHeading>
              <FilterFields search={search} onChange={onChange} sidebar />
            </Box>
          </Box>
          <DockedAction label="Add entry" onClick={props.onAdd} inset={8} />
        </Box>

        <Box
          component="section"
          aria-label="Models"
          data-column="wiki-models"
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {(search.construction ||
            search.availability ||
            search.fits != null) && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                pb: 1,
                flexShrink: 0,
              }}
            >
              {search.construction && (
                <FilterChip
                  label={sentenceCase(humanize(search.construction))}
                  set
                  onDelete={() => onChange({ construction: undefined })}
                  deleteLabel="Remove construction filter"
                />
              )}
              {search.availability && (
                <FilterChip
                  label={AVAILABILITY_LABELS[search.availability]}
                  set
                  onDelete={() => onChange({ availability: undefined })}
                  deleteLabel="Remove availability filter"
                />
              )}
              {search.fits != null && (
                <FilterChip
                  label={formatFits(search.fits, units)}
                  set
                  onDelete={() => onChange({ fits: undefined })}
                  deleteLabel="Remove paddler weight filter"
                />
              )}
            </Box>
          )}
          <Box
            data-testid="wiki-scroll"
            tabIndex={0}
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              // Room for the cards' shadows, which the scroller would clip.
              m: -0.5,
              p: 0.5,
            }}
          >
            <ModelResults
              query={query}
              items={items}
              compareIds={compareIds}
              showCategory={search.category == null}
              grid
              onOpen={props.onOpen}
              onToggleCompare={props.onToggleCompare}
              onToggleSize={props.onToggleSize}
            />
          </Box>
          {compareIds.length > 0 && (
            <CompareBar
              ids={compareIds}
              onRemove={props.onToggleSize}
              onClear={props.onClearCompare}
              onCompare={props.onCompare}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
