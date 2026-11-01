import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import QueryStates from "@/components/states/QueryStates";
import type { MaterialTree } from "@/lib/api";
import { useMaterialTree } from "@/lib/hooks/useMaterials";
import {
  BackIcon,
  ChevronRightIcon,
  CloseIcon,
  MaterialIcon,
} from "@/lib/icons";
import { type MaterialWikiSearch } from "@/lib/materials/search";
import {
  CATEGORY_PLURALS,
  pathOf,
  selectedTotals,
  type TreePath,
  treeFilters,
} from "@/lib/materials/tree";
import { humanize, sentenceCase } from "@/lib/text/format";
import { focusRingSx } from "@/lib/theme/focusRing";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

interface Choice {
  label: string;
  count: number;
  path: TreePath;
  /** Whether a deeper level exists to drill into. */
  deeper: boolean;
}

/** The level `at` names, as the rows to pick and the heading above them. */
function levelAt(tree: MaterialTree | undefined, at: TreePath) {
  const cats = tree?.categories ?? [];
  const cat = cats.find((c) => c.category === at.category);
  const disc = cat?.disciplines.find((d) => d.discipline === at.discipline);
  if (cat && disc) {
    return {
      title: sentenceCase(humanize(disc.discipline)),
      trail: CATEGORY_PLURALS[cat.category],
      all: `All ${sentenceCase(humanize(disc.discipline))}`,
      rows: disc.brands.map(
        (b): Choice => ({
          label: b.brand,
          count: b.models,
          path: { ...at, brand: b.brand },
          deeper: false,
        }),
      ),
    };
  }
  if (cat) {
    return {
      title: CATEGORY_PLURALS[cat.category],
      trail: "All gear",
      all: `All ${CATEGORY_PLURALS[cat.category]}`,
      rows: cat.disciplines.map(
        (d): Choice => ({
          label: sentenceCase(humanize(d.discipline)),
          count: d.models,
          path: { ...at, discipline: d.discipline },
          deeper: d.brands.length > 0,
        }),
      ),
    };
  }
  return {
    title: "Browse",
    trail: "Category, type, brand",
    all: "All gear",
    rows: cats.map(
      (c): Choice => ({
        label: CATEGORY_PLURALS[c.category],
        count: c.models,
        path: { category: c.category },
        deeper: c.disciplines.length > 0,
      }),
    ),
  };
}

function up(at: TreePath): TreePath {
  if (at.discipline) return { category: at.category };
  return {};
}

function Content({
  search,
  onSelect,
  onClose,
}: {
  search: MaterialWikiSearch;
  onSelect: (path: TreePath) => void;
  onClose: () => void;
}) {
  const query = useMaterialTree(treeFilters(search));
  const here = pathOf(search);
  // Opens one level above what is picked, so the pick is in view.
  const [at, setAt] = useState<TreePath>({
    category: here.category,
    discipline: here.discipline,
  });
  const level = levelAt(query.data, at);
  const totals = selectedTotals(query.data, at);
  const pick = (path: TreePath) => {
    onSelect(path);
    onClose();
  };
  const atRoot = !at.category;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 56,
          px: 0.5,
          gap: 0.5,
        }}
      >
        <IconButton
          aria-label={
            atRoot ? "Close" : `Back to ${levelAt(query.data, up(at)).title}`
          }
          onClick={() => (atRoot ? onClose() : setAt(up(at)))}
          sx={{ width: tokens.touch.min, height: tokens.touch.min }}
        >
          {atRoot ? <CloseIcon /> : <BackIcon />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="h2"
            sx={{ fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.33 }}
          >
            {level.title}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {level.trail}
          </Typography>
        </Box>
        {!atRoot && (
          <IconButton
            aria-label="Close"
            onClick={onClose}
            sx={{ width: tokens.touch.min, height: tokens.touch.min }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      <QueryStates
        query={query}
        count={level.rows.length + 1}
        errorFallback="Could not load the categories."
        empty={{ icon: <MaterialIcon />, title: "Nothing to browse." }}
      >
        <Box
          role="list"
          data-testid="browse-rows"
          sx={{ overflowY: "auto", minHeight: 0, pb: 2 }}
        >
          <ButtonBase
            data-testid="browse-all"
            onClick={() => pick(at)}
            sx={{ ...rowSx, color: tokens.primary, fontWeight: 600 }}
          >
            <Box component="span" sx={{ flex: 1, textAlign: "left" }}>
              {level.all}
            </Box>
            {totals && <Box component="span">{totals.models}</Box>}
          </ButtonBase>
          {level.rows.map((row) => (
            <ButtonBase
              key={row.label}
              data-testid="browse-row"
              onClick={() => (row.deeper ? setAt(row.path) : pick(row.path))}
              sx={{ ...rowSx, borderTop: `1px solid ${tokens.outlineVariant}` }}
            >
              <Box
                component="span"
                sx={{ flex: 1, textAlign: "left", overflowWrap: "anywhere" }}
              >
                {row.label}
              </Box>
              <Box
                component="span"
                sx={{
                  color: "text.secondary",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {row.count}
              </Box>
              {row.deeper ? (
                <ChevronRightIcon sx={{ color: "text.secondary" }} />
              ) : (
                <Box component="span" sx={{ width: 24 }} />
              )}
            </ButtonBase>
          ))}
        </Box>
      </QueryStates>
    </Box>
  );
}

const rowSx = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  gap: 1,
  minHeight: 48,
  px: `${tokens.phone.inner}px`,
  fontSize: "0.9375rem",
  fontWeight: 500,
  ...focusRingSx(-2),
} as const;

/** The tree as a phone sheet, one level at a time: tap a category to see its
 * types, a type to see its brands. The first row of each level picks the whole
 * level ("All Kayaks"); a brand picks itself. Picking narrows the list and
 * closes the sheet. */
export default function BrowseSheet({
  open,
  onClose,
  search,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  search: MaterialWikiSearch;
  onSelect: (path: TreePath) => void;
}) {
  return (
    <BottomSheet
      state={open ? "open" : "closed"}
      onStateChange={(s) => s === "open" || onClose()}
      label="Browse"
    >
      <Content search={search} onSelect={onSelect} onClose={onClose} />
    </BottomSheet>
  );
}
