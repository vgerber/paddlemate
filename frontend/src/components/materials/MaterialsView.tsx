import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import ListPaneHeader from "@/components/ListPaneHeader";
import { fabRoom } from "@/components/PaneFab";
import FilterChip from "@/components/search/FilterChip";
import { TreeIcon } from "@/lib/icons";
import {
  activeFilterCount,
  enumLabel,
  formatFits,
} from "@/lib/materials/materials";
import { pathPatch, type TreePath } from "@/lib/materials/tree";
import { useUnits } from "@/lib/prefs/units";
import { theme } from "@/lib/theme/theme";
import BrowseSheet from "./BrowseSheet";
import MaterialBreadcrumb from "./MaterialBreadcrumb";
import MaterialFiltersSheet from "./MaterialFiltersSheet";
import { CompareBar, ModelResults } from "./MaterialResults";
import MaterialSearchField from "./MaterialSearchField";
import MaterialsDesktop from "./MaterialsDesktop";
import { type MaterialsViewProps, useWikiList } from "./useWikiList";

const { tokens } = theme;

function PhoneWiki(props: MaterialsViewProps) {
  const { search, compareIds, onChange } = props;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const { text, setText, query, items, total } = useWikiList(search, onChange);
  const [units] = useUnits();
  const filterCount = activeFilterCount(search);
  const select = (path: TreePath) => onChange(pathPatch(path));

  return (
    <Box>
      <Box
        sx={{
          px: `${tokens.phone.line}px`,
          pt: 1.5,
          pb: 0.75,
          display: "grid",
          gap: 0.75,
        }}
      >
        <Box sx={{ display: "flex", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <MaterialSearchField value={text} onChange={setText} />
          </Box>
          <Button
            data-testid="browse-button"
            variant="outlined"
            startIcon={<TreeIcon />}
            onClick={() => setBrowseOpen(true)}
            sx={{ minHeight: 56, flexShrink: 0 }}
          >
            Browse
          </Button>
        </Box>
        <MaterialBreadcrumb
          search={search}
          chips
          onSelect={select}
          onRoot={() => select({})}
          onTools={props.onTools}
        >
          <FilterChip
            testId="filters-chip"
            label={filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
            set={filterCount > 0}
            onClick={() => setFiltersOpen(true)}
          />
          {search.construction && (
            <FilterChip
              label={enumLabel(search.construction)}
              set
              onClick={() => setFiltersOpen(true)}
              onDelete={() => onChange({ construction: undefined })}
            />
          )}
          {search.fits != null && (
            <FilterChip
              label={formatFits(search.fits, units)}
              set
              onClick={() => setFiltersOpen(true)}
              onDelete={() => onChange({ fits: undefined })}
            />
          )}
        </MaterialBreadcrumb>
      </Box>

      <ListPaneHeader count={total} noun="model" loading={query.isLoading} />

      <Box sx={{ mx: `${tokens.phone.edge}px`, pb: fabRoom }}>
        <ModelResults
          query={query}
          items={items}
          compareIds={compareIds}
          showCategory={search.category == null}
          grid={false}
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

      <BrowseSheet
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        search={search}
        onSelect={select}
      />
      <MaterialFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        search={search}
        total={total ?? 0}
        onChange={onChange}
      />
    </Box>
  );
}

/** The wiki list: on a desktop the category tree beside a grid of models, on
 * a phone a search, a Browse sheet for the tree and the models beneath. */
export default function MaterialsView(props: MaterialsViewProps) {
  const desktop = useMediaQuery(theme.breakpoints.up("md"), { noSsr: true });
  return desktop ? <MaterialsDesktop {...props} /> : <PhoneWiki {...props} />;
}
