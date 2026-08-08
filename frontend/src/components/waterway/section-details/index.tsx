import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Feature, Proposal, SectionWithFeatures } from "@/lib/api";
import { lineCoords } from "@/lib/geo";
import { useDeleteFeature } from "@/lib/hooks/useSections";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, theme } from "@/lib/theme";
import { PointEntry } from "./PointEntry";
import { featureName } from "./utils";

const { tokens } = theme;

import type { ComputedFeature } from "./types";
import { buildTree, computeExtent, proposalToComputedFeature } from "./utils";
import { ZoneEntry } from "./ZoneEntry";

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
}

export default function FeatureTimeline({
  section,
  proposals = [],
  showProposed = true,
  onFeatureClick,
  onEditFeature,
  activeFeatureId,
  onActiveFeatureChange,
}: Props) {
  const [internalActiveId, setInternalActiveId] = useState<number | null>(null);
  const activeId =
    activeFeatureId !== undefined ? activeFeatureId : internalActiveId;
  const setActiveId = onActiveFeatureChange ?? setInternalActiveId;
  const sectionLine = useMemo(
    () => lineCoords(section.location) ?? [],
    [section.location],
  );

  const tree = useMemo(() => {
    const approved = section.features.map((f) => computeExtent(f, sectionLine));
    const proposed = showProposed
      ? proposals
          .map((p) => proposalToComputedFeature(p, sectionLine))
          .filter((cf): cf is ComputedFeature => cf !== null)
      : [];
    const all = [...approved, ...proposed];
    if (!all.length) return [];
    return buildTree(all);
  }, [section.features, proposals, showProposed, sectionLine]);

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

  const { isAuthenticated } = useSession();
  const deleteFeature = useDeleteFeature(section.waterway_id, section.id);
  // Feature awaiting delete confirmation (drives the dialog).
  const [deleteTarget, setDeleteTarget] = useState<ComputedFeature | null>(
    null,
  );

  function confirmDelete() {
    if (!deleteTarget || deleteFeature.isPending) return;
    deleteFeature.mutate(deleteTarget.feature.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setActiveId(null);
        onFeatureClick?.(null);
      },
    });
  }

  const onDeleteItem = isAuthenticated ? setDeleteTarget : undefined;

  const onEditItem =
    isAuthenticated && onEditFeature
      ? (cf: ComputedFeature) => onEditFeature(cf.feature)
      : undefined;

  if (!tree.length) {
    return (
      <Typography
        sx={{
          fontFamily: fonts.body,
          fontSize: 12,
          color: tokens.outline,
          p: "8px 4px",
        }}
      >
        No features for this section.
      </Typography>
    );
  }

  return (
    <Stack direction="column" sx={{ p: 1 }}>
      {tree.map((node, idx) =>
        // A zone without nested features renders as a plain dot entry - the
        // bracket only earns its two rows when it wraps something.
        node.item.isZone && node.nested.length > 0 ? (
          <ZoneEntry
            key={node.item.feature.id}
            item={node.item}
            nested={node.nested}
            isLast={idx === tree.length - 1}
            activeId={activeId}
            onItemClick={handleItemClick}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
            pendingDeleteIds={pendingDeleteIds}
          />
        ) : (
          <PointEntry
            key={node.item.feature.id}
            item={node.item}
            isLast={idx === tree.length - 1}
            isActive={activeId === node.item.feature.id}
            onClick={() => handleItemClick(node.item)}
            onEdit={onEditItem && (() => onEditItem(node.item))}
            onDelete={onDeleteItem && (() => onDeleteItem(node.item))}
            pendingDelete={pendingDeleteIds.has(node.item.feature.id)}
          />
        ),
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete feature?"
        body={`${deleteTarget ? `"${featureName(deleteTarget.feature)}" - the` : "The"} deletion is submitted as a proposal first; the feature stays until the proposal is approved.`}
        confirmLabel="Delete"
        pendingLabel="Submitting…"
        color="error"
        pending={deleteFeature.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </Stack>
  );
}
