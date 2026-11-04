import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { type ReactNode, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import PanelHeader from "@/components/PanelHeader";
import QueryStates from "@/components/states/QueryStates";
import type { MaterialTree } from "@/lib/api";
import { useBackToClose } from "@/lib/hooks/ui/useBackToClose";
import { useMaterialTree } from "@/lib/hooks/useMaterials";
import { ChevronRightIcon, CloseIcon, MaterialIcon } from "@/lib/icons";
import type { MaterialWikiSearch } from "@/lib/materials/search";
import { disciplineLabel, USE_LABELS } from "@/lib/materials/specs";
import {
  CATEGORY_PLURALS,
  GROUP_COUNT_NOTE,
  pathOf,
  resolvePath,
  selectedTotals,
  type TreePath,
  treeFilters,
} from "@/lib/materials/tree";
import { withAlpha } from "@/lib/theme/alpha";
import { labelSx, theme } from "@/lib/theme/theme";

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
  const use = cat?.uses?.find((u) => u.use === at.use);
  const groups = use ? use.disciplines : cat?.disciplines;
  const disc = groups?.find((d) => d.discipline === at.discipline);
  if (cat && disc) {
    const name = disciplineLabel(disc.discipline, cat.category);
    return {
      title: name,
      trail: use
        ? `${CATEGORY_PLURALS[cat.category]} \u00b7 ${USE_LABELS[use.use]}`
        : CATEGORY_PLURALS[cat.category],
      all: `All ${name}`,
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
  if (cat && use) {
    return {
      title: USE_LABELS[use.use],
      trail: CATEGORY_PLURALS[cat.category],
      all: `All ${USE_LABELS[use.use]}`,
      rows: use.disciplines.map(
        (d): Choice => ({
          label: disciplineLabel(d.discipline, cat.category),
          count: d.models,
          path: { ...at, discipline: d.discipline },
          deeper: d.brands.length > 0,
        }),
      ),
    };
  }
  if (cat?.uses) {
    return {
      title: CATEGORY_PLURALS[cat.category],
      trail: "All gear",
      all: `All ${CATEGORY_PLURALS[cat.category]}`,
      rows: cat.uses.map(
        (u): Choice => ({
          label: USE_LABELS[u.use],
          count: u.models,
          path: { category: cat.category, use: u.use },
          deeper: u.disciplines.length > 0,
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
          label: disciplineLabel(d.discipline, cat.category),
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
        deeper: (c.uses ? c.uses.length : c.disciplines.length) > 0,
      }),
    ),
  };
}

/** The level above `at`: a group goes up to its use (kayaks) or category. */
function up(at: TreePath): TreePath {
  if (at.discipline) {
    return { category: at.category, use: at.use };
  }
  if (at.use) return { category: at.category };
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
  const here = pathOf(search, query.data);
  // Opens one level above what is picked, so the pick is in view.
  const [opened, setAt] = useState<TreePath>({
    category: here.category,
    use: here.use,
    discipline: here.discipline,
  });
  // An older link names the discipline only; the tree supplies its use.
  const at = resolvePath(opened, query.data);
  const level = levelAt(query.data, at);
  const totals = selectedTotals(query.data, at);
  const pick = (path: TreePath) => {
    onSelect(path);
    onClose();
  };
  const atRoot = !at.category;
  useBackToClose(true, () => {
    if (atRoot) {
      onClose();
      return false;
    }
    setAt(up(at));
    return true;
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <PanelHeader
        title={level.title}
        subtitle={level.trail}
        backIcon={atRoot ? "close" : "arrow"}
        onBack={() => (atRoot ? onClose() : setAt(up(at)))}
        actionButton={
          atRoot ? undefined : (
            <IconButton aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          )
        }
      />
      <QueryStates
        query={query}
        count={level.rows.length + 1}
        errorFallback="Could not load the categories."
        empty={{ icon: <MaterialIcon />, title: "Nothing to browse." }}
      >
        <List
          disablePadding
          data-testid="browse-rows"
          sx={{ overflowY: "auto", minHeight: 0, pb: 2 }}
        >
          <BrowseRow
            testId="browse-all"
            onClick={() => pick(at)}
            sx={{ color: tokens.primary, fontWeight: 600 }}
          >
            <Box component="span" sx={{ flex: 1 }}>
              {level.all}
            </Box>
            {totals && <Box component="span">{totals.models}</Box>}
          </BrowseRow>
          {level.rows.map((row) => (
            <BrowseRow
              key={row.label}
              testId="browse-row"
              onClick={() => (row.deeper ? setAt(row.path) : pick(row.path))}
            >
              <Box component="span" sx={{ flex: 1, overflowWrap: "anywhere" }}>
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
            </BrowseRow>
          ))}
          {at.category && !at.discipline && (
            <Typography
              data-testid="browse-group-note"
              sx={{
                ...labelSx,
                color: "text.secondary",
                px: `${tokens.phone.line}px`,
                pt: 1.5,
              }}
            >
              {GROUP_COUNT_NOTE}
            </Typography>
          )}
        </List>
      </QueryStates>
    </Box>
  );
}

function BrowseRow({
  testId,
  onClick,
  sx,
  children,
}: {
  testId: string;
  onClick: () => void;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <ListItem disablePadding>
      <ListItemButton
        data-testid={testId}
        onClick={onClick}
        sx={[rowSx, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        {children}
      </ListItemButton>
    </ListItem>
  );
}

const rowSx = {
  gap: 1,
  minHeight: 48,
  px: `${tokens.phone.line}px`,
  fontSize: "0.9375rem",
  fontWeight: 500,
  borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
} as const;

/** The tree as a phone sheet, one level at a time: tap a category to see its
 * uses (kayaks), types and brands. The first row of each level picks the whole
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
