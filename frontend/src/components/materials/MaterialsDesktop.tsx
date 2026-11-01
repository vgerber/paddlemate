import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DockedAction from "@/components/DockedAction";
import FilterChip from "@/components/search/FilterChip";
import type { MaterialSort } from "@/lib/api";
import { useMaterialTree } from "@/lib/hooks/useMaterials";
import {
  enumLabel,
  formatFits,
  SORT_LABELS,
  SORTS,
} from "@/lib/materials/materials";
import {
  crumbs,
  pathPatch,
  selectedTotals,
  type TreePath,
  treeFilters,
} from "@/lib/materials/tree";
import { useUnits } from "@/lib/prefs/units";
import { plural } from "@/lib/text/format";
import { withAlpha } from "@/lib/theme/alpha";
import { labelSx, theme } from "@/lib/theme/theme";
import MaterialBreadcrumb from "./MaterialBreadcrumb";
import { FilterFields } from "./MaterialFiltersSheet";
import { CompareBar, ModelResults } from "./MaterialResults";
import MaterialSearchField from "./MaterialSearchField";
import MaterialTree from "./MaterialTree";
import { type MaterialsViewProps, useWikiList } from "./useWikiList";

const { tokens } = theme;

/** Width of the sidebar, px. */
const SIDEBAR = 300;

/** Least height the tree keeps when the filters crowd it, px. */
const TREE_MIN = 180;

const cardSx = {
  bgcolor: tokens.surface,
  borderRadius: `${tokens.radii.md}px`,
  boxShadow: tokens.elevation.e1,
} as const;

/** The desktop wiki: a sidebar with the search, the category tree and the
 * filters beside a page of the models, sized to the window. */
export default function MaterialsDesktop(props: MaterialsViewProps) {
  const { search, compareIds, onChange } = props;
  const [units] = useUnits();
  const { text, setText, query, items } = useWikiList(search, onChange);
  const tree = useMaterialTree(treeFilters(search));
  const totals = selectedTotals(tree.data, search);
  const select = (path: TreePath) => onChange(pathPatch(path));
  const steps = crumbs(search);
  const title = steps.at(-1)?.label ?? "Material wiki";

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `${SIDEBAR}px minmax(0, 1fr)`,
        gap: 1,
        alignItems: "start",
      }}
    >
      <Box
        component="aside"
        aria-label="Search and browse"
        sx={{
          ...cardSx,
          position: "sticky",
          top: 8,
          display: "flex",
          flexDirection: "column",
          maxHeight: `calc(100vh - ${tokens.chrome.appBar}px - 32px)`,
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
          <MaterialSearchField value={text} onChange={setText} />
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
            <Typography
              component="h2"
              sx={{
                ...labelSx,
                color: "text.secondary",
              }}
            >
              Filters
            </Typography>
            <FilterFields
              search={search}
              onChange={onChange}
              withSort={false}
            />
          </Box>
        </Box>
        <DockedAction label="Add entry" onClick={props.onAdd} inset={8} />
      </Box>

      <Box component="section" aria-label="Models" sx={{ minWidth: 0 }}>
        <MaterialBreadcrumb
          search={search}
          chips={false}
          onSelect={select}
          onRoot={() => select({})}
          onTools={props.onTools}
        />
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 2,
            pb: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.25 }}
            >
              {title}
            </Typography>
            <Typography
              data-testid="wiki-counts"
              variant="body2"
              color="textSecondary"
            >
              {totals
                ? `${plural(totals.models, "model")}, ${plural(totals.entries, "size")}`
                : " "}
            </Typography>
          </Box>
          <TextField
            select
            label="Sort by"
            value={search.sort ?? "name"}
            onChange={(event) => {
              const sort = event.target.value as MaterialSort;
              onChange({ sort: sort === "name" ? undefined : sort });
            }}
            sx={{ width: 180, flexShrink: 0 }}
          >
            {SORTS.map((sort) => (
              <MenuItem key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {(search.construction || search.fits != null) && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pb: 1 }}>
            {search.construction && (
              <FilterChip
                label={enumLabel(search.construction)}
                set
                onDelete={() => onChange({ construction: undefined })}
                deleteLabel="Remove construction filter"
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
  );
}
