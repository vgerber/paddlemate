import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import ListPaneHeader from "@/components/ListPaneHeader";
import { fabRoom } from "@/components/PaneFab";
import FilterChip from "@/components/search/FilterChip";
import SearchField from "@/components/search/SearchField";
import { TreeIcon } from "@/lib/icons";
import { formatFits } from "@/lib/materials/facts";
import { activeFilterCount } from "@/lib/materials/search";
import { pathPatch, type TreePath } from "@/lib/materials/tree";
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
            <SearchField
              label="Brand or model"
              maxLength={100}
              value={text}
              onChange={setText}
            />
          </Box>
          <Button
            data-testid="browse-button"
            variant="outlined"
            startIcon={<TreeIcon />}
            aria-label="Browse"
            onClick={() => setBrowseOpen(true)}
            sx={{
              alignSelf: "stretch",
              flexShrink: 0,
              // On the narrowest phones the icon alone leaves the search room.
              "@media (max-width: 359px)": {
                minWidth: 0,
                "& .MuiButton-startIcon": { m: 0 },
                "& .browse-label": { display: "none" },
              },
            }}
          >
            <Box component="span" className="browse-label">
              Browse
            </Box>
          </Button>
        </Box>
        <Breadcrumb
          chips
          crumbs={wikiSteps(search, select)}
          lead={
            <>
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
