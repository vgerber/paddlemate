import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import ListPaneHeader from "@/components/ListPaneHeader";
import { fabRoom } from "@/components/PaneFab";
import FilterChip from "@/components/search/FilterChip";
import SearchField from "@/components/search/SearchField";
import { useMaterialTree } from "@/lib/hooks/useMaterials";
import { AVAILABILITY_LABELS } from "@/lib/materials/availability";
import { formatFits } from "@/lib/materials/facts";
import { activeFilterCount } from "@/lib/materials/search";
import {
  browseLabel,
  pathPatch,
  type TreePath,
  treeFilters,
} from "@/lib/materials/tree";
import { useUnits } from "@/lib/prefs/units";
import { humanize, sentenceCase } from "@/lib/text/format";
import { theme } from "@/lib/theme/theme";
import BrowseSheet from "./BrowseSheet";
import MaterialFiltersSheet from "./MaterialFiltersSheet";
import { CompareBar, ModelResults } from "./MaterialResults";
import MaterialsDesktop from "./MaterialsDesktop";
import { type MaterialsViewProps, useWikiList } from "./useWikiList";
import { wikiSteps } from "./wikiTrail";

const { tokens } = theme;

function PhoneWiki(props: MaterialsViewProps) {
  const { search, compareIds, onChange } = props;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const { text, setText, query, items, total } = useWikiList(search, onChange);
  const [units] = useUnits();
  const tree = useMaterialTree(treeFilters(search));
  const filterCount = activeFilterCount(search);
  const select = (path: TreePath) => onChange(pathPatch(path));

  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Box
        sx={{
          flexShrink: 0,
          px: `${tokens.phone.line}px`,
          pt: 1.5,
          pb: 0.75,
          display: "grid",
          // minmax(0, ...) lets the chip row scroll instead of widening the page.
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 0.75,
        }}
      >
        <SearchField
          label="Brand or model"
          maxLength={100}
          value={text}
          onChange={setText}
        />
        <Breadcrumb
          chips
          crumbs={wikiSteps(search, select, tree.data)}
          lead={
            <>
              <FilterChip
                testId="browse-button"
                label={browseLabel(search, tree.data)}
                set={false}
                dropdown
                onClick={() => setBrowseOpen(true)}
              />
              <FilterChip
                testId="filters-chip"
                label={filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
                set={filterCount > 0}
                onClick={() => setFiltersOpen(true)}
              />
              {search.construction && (
                <FilterChip
                  label={sentenceCase(humanize(search.construction))}
                  set
                  onClick={() => setFiltersOpen(true)}
                  onDelete={() => onChange({ construction: undefined })}
                />
              )}
              {search.availability && (
                <FilterChip
                  label={AVAILABILITY_LABELS[search.availability]}
                  set
                  onClick={() => setFiltersOpen(true)}
                  onDelete={() => onChange({ availability: undefined })}
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
            </>
          }
        />
      </Box>

      <ListPaneHeader count={total} noun="model" loading={query.isLoading} />

      <Box
        data-testid="wiki-scroll"
        tabIndex={0}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: `${tokens.phone.edge}px`,
          pb: fabRoom,
        }}
      >
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
      </Box>
      {compareIds.length > 0 && (
        <CompareBar
          ids={compareIds}
          onRemove={props.onToggleSize}
          onClear={props.onClearCompare}
          onCompare={props.onCompare}
        />
      )}

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
