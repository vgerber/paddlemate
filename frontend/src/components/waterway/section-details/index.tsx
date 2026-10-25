import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import type { EditsFilter } from "@/components/provenance/EditsTimeline";
import EmptyState from "@/components/states/EmptyState";
import type { Feature, Proposal, SectionWithFeatures } from "@/lib/api";
import { lineCoords } from "@/lib/geo";
import { useSession } from "@/lib/hooks/useSession";
import { ExpandIcon, FeaturesIcon } from "@/lib/icons";
import { css, useReducedMotion } from "@/lib/motion";
import { theme } from "@/lib/theme";
import { DeleteFeatureDialog } from "./DeleteFeatureDialog";
import { FeatureStrip } from "./FeatureStrip";
import { Fold } from "./Fold";
import { FeatureNode } from "./RangeBand";
import { countLabel, featureNumbers, splitBaseGrade, stripShown } from "./rows";
import type { ComputedFeature } from "./types";
import {
  buildTree,
  computeExtent,
  proposalToComputedFeature,
  sectionLengthM,
} from "./utils";

const { tokens } = theme;

interface Props {
  section: SectionWithFeatures;
  /** Pending feature proposals of the section - source of the proposed
   * pseudo-entries and the "deletion proposed" markers. */
  proposals?: Proposal[];
  /** Whether proposed features render as timeline entries. Deletion markers
   * on existing features show regardless. */
  showProposed?: boolean;
  onFeatureClick?: (coords: [number, number] | null) => void;
  /** Opens the full edit panel for a feature (map page suggest mode). */
  onEditFeature?: (f: Feature) => void;
  /** Controlled active feature - lets the chart panel react to the
   * selection. Falls back to internal state when omitted. */
  activeFeatureId?: number | null;
  onActiveFeatureChange?: (id: number | null) => void;
  /** Opens the edits of one feature, where all edits are seen together. */
  onOpenHistory?: (filter: NonNullable<EditsFilter>) => void;
}

export default function FeatureTimeline({
  section,
  proposals = [],
  showProposed = true,
  onFeatureClick,
  onEditFeature,
  activeFeatureId,
  onActiveFeatureChange,
  onOpenHistory,
}: Props) {
  const [internalActiveId, setInternalActiveId] = useState<number | null>(null);
  const activeId =
    activeFeatureId !== undefined ? activeFeatureId : internalActiveId;
  const setActiveId = onActiveFeatureChange ?? setInternalActiveId;
  const sectionLine = useMemo(
    () => lineCoords(section.location) ?? [],
    [section.location],
  );

  const totalM = useMemo(() => sectionLengthM(sectionLine), [sectionLine]);

  const { approved, proposedCount, tree } = useMemo(() => {
    const all = section.features.map((f) => computeExtent(f, sectionLine));
    const split = splitBaseGrade(all, totalM);
    const proposed = proposals
      .map((p) => proposalToComputedFeature(p, sectionLine))
      .filter((cf): cf is ComputedFeature => cf !== null);
    const shown = [...split.rest, ...(showProposed ? proposed : [])];
    return {
      approved: split.rest,
      proposedCount: proposed.length,
      tree: shown.length ? buildTree(shown) : [],
    };
  }, [section.features, proposals, showProposed, sectionLine, totalM]);

  // Existing features with a pending delete proposal get a marker icon.
  const pendingDeleteIds = useMemo(
    () =>
      new Set(
        proposals
          .filter((p) => p.operation === "delete" && p.entity_id != null)
          .map((p) => p.entity_id as number),
      ),
    [proposals],
  );

  function handleItemClick(cf: ComputedFeature) {
    const newId = activeId === cf.feature.id ? null : cf.feature.id;
    setActiveId(newId);
    // Don't fly to map for proposals - they aren't approved yet
    if (!cf.proposal) {
      onFeatureClick?.(newId != null ? cf.coords : null);
    }
  }

  const [folded, setFolded] = useState(false);
  const reduced = useReducedMotion();

  const { isAuthenticated } = useSession();
  // Feature awaiting delete confirmation (drives the dialog).
  const [deleteTarget, setDeleteTarget] = useState<ComputedFeature | null>(
    null,
  );

  const onDeleteItem = isAuthenticated ? setDeleteTarget : undefined;

  const onEditItem =
    isAuthenticated && onEditFeature
      ? (cf: ComputedFeature) => onEditFeature(cf.feature)
      : undefined;

  const onHistoryItem = onOpenHistory
    ? (cf: ComputedFeature) =>
        onOpenHistory({ kind: "feature", id: cf.feature.id })
    : undefined;

  const numbers = useMemo(() => featureNumbers(section), [section]);

  const ctx = {
    activeId,
    numbers,
    onHistoryItem,
    onItemClick: handleItemClick,
    onEditItem,
    onDeleteItem,
    pendingDeleteIds,
  };

  const empty = approved.length === 0 && tree.length === 0;
  const longest = Math.max(totalM, ...approved.map((f) => f.endM));
  const showCount = approved.length > 0 || tree.length > 0;
  // The list folds down to the strip, so a card without a strip cannot fold.
  const foldable = stripShown(approved) && tree.length > 0;

  return (
    <Box
      data-testid="features-card"
      data-folded={foldable && folded ? "" : undefined}
      sx={{
        // On a phone the card keeps the 12 side margin of every card; from md
        // the pane's gutter does it.
        mx: { xs: 1.5, md: 0 },
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e1,
        minWidth: 0,
        // On a wide screen the card takes what the pane has and the list
        // scrolls inside it.
        display: "flex",
        flexDirection: "column",
        minHeight: { md: 0 },
        overflow: { md: "hidden" },
      }}
    >
      {showCount && (
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            minHeight: tokens.touch.row,
          }}
        >
          <Typography
            data-testid="features-count"
            sx={{
              flex: 1,
              alignSelf: "stretch",
              display: "flex",
              alignItems: "center",
              pl: 2,
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: tokens.onSurfaceVariant,
            }}
          >
            {countLabel(approved.length, proposedCount)}
          </Typography>
          {foldable && (
            <ButtonBase
              data-testid="features-fold"
              aria-label={folded ? "Show the list" : "Fold the list"}
              aria-expanded={!folded}
              onClick={() => setFolded((f) => !f)}
              sx={{
                width: tokens.touch.min,
                height: tokens.touch.min,
                borderRadius: "50%",
                color: tokens.onSurfaceVariant,
              }}
            >
              <ExpandIcon
                sx={{
                  transform: folded ? "none" : "rotate(180deg)",
                  transition: reduced
                    ? "none"
                    : `transform ${css.base} ${css.easeInOut}`,
                }}
              />
            </ButtonBase>
          )}
        </Box>
      )}

      {empty && (
        <EmptyState
          icon={<FeaturesIcon />}
          title="No rapids, hazards or access points yet."
          pt={2.5}
          pb={3}
        />
      )}

      {stripShown(approved) && (
        <Box
          sx={{
            flexShrink: 0,
            px: 2,
            pb: 1,
            boxShadow: `0 1px 0 ${tokens.outlineVariant}`,
          }}
        >
          <FeatureStrip features={approved} totalM={longest} />
        </Box>
      )}

      <Fold open={!(foldable && folded)} sx={{ flex: "0 1 auto" }}>
        <Box
          data-testid="features-scroll"
          sx={{
            flex: "0 1 auto",
            minHeight: 0,
            overflowY: { md: "auto" },
            // A scroller is its own touch-action boundary: without this a tab
            // swipe that starts on the list is taken as a scroll and cancelled.
            touchAction: "pan-y",
          }}
        >
          {tree.length > 0 && (
            <Box sx={{ pb: 1 }}>
              {tree.map((node, idx) => (
                <FeatureNode
                  key={node.item.feature.id}
                  node={node}
                  ctx={ctx}
                  startsList={idx === 0}
                  endsList={idx === tree.length - 1}
                  dashed={false}
                />
              ))}
            </Box>
          )}
        </Box>
      </Fold>

      <DeleteFeatureDialog
        feature={deleteTarget?.feature ?? null}
        waterwayId={section.waterway_id}
        sectionId={section.id}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setActiveId(null);
          onFeatureClick?.(null);
        }}
      />
    </Box>
  );
}
