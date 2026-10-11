import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import HistoryIcon from "@mui/icons-material/History";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import HistoryHost from "@/components/provenance/HistoryHost";
import type { HistoryTarget } from "@/components/provenance/types";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import EmptyState from "@/components/states/EmptyState";
import type { Feature, Proposal, SectionWithFeatures } from "@/lib/api";
import { distanceAlongLineM, lineCoords } from "@/lib/geo";
import { useDeleteFeature } from "@/lib/hooks/useSections";
import { useSession } from "@/lib/hooks/useSession";
import { localizedName } from "@/lib/localization";
import { css, durations } from "@/lib/motion";
import { theme } from "@/lib/theme";
import { FeatureStrip } from "./FeatureStrip";
import { FeatureNode } from "./RangeBand";
import { splitWholeRunGrades } from "./rows";
import type { ComputedFeature } from "./types";
import {
  buildTree,
  computeExtent,
  featureName,
  proposalToComputedFeature,
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
  /** Called when the list folds or opens. The strip stays either way, so a
   * parent can hand the freed height to something else. */
  onFoldedChange?: (folded: boolean) => void;
}

export default function FeatureTimeline({
  section,
  proposals = [],
  showProposed = true,
  onFeatureClick,
  onEditFeature,
  activeFeatureId,
  onActiveFeatureChange,
  onFoldedChange,
}: Props) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    onFoldedChange?.(folded);
  }, [folded, onFoldedChange]);
  const [internalActiveId, setInternalActiveId] = useState<number | null>(null);
  const activeId =
    activeFeatureId !== undefined ? activeFeatureId : internalActiveId;
  const setActiveId = onActiveFeatureChange ?? setInternalActiveId;
  const sectionLine = useMemo(
    () => lineCoords(section.location) ?? [],
    [section.location],
  );

  const totalM = useMemo(() => {
    if (sectionLine.length < 2) return 0;
    return distanceAlongLineM(sectionLine[sectionLine.length - 1], sectionLine);
  }, [sectionLine]);

  const { approved, grades, tree } = useMemo(() => {
    const approved = section.features.map((f) => computeExtent(f, sectionLine));
    const split = splitWholeRunGrades(approved, totalM);
    const proposed = showProposed
      ? proposals
          .map((p) => proposalToComputedFeature(p, sectionLine))
          .filter((cf): cf is ComputedFeature => cf !== null)
      : [];
    const all = [...split.rest, ...proposed];
    return {
      approved: split.rest,
      grades: split.grades,
      tree: all.length ? buildTree(all) : [],
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

  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(
    null,
  );
  const [historyName, setHistoryName] = useState("");
  function openHistory(target: HistoryTarget, name: string) {
    setHistoryName(name);
    setHistoryTarget(target);
  }
  const onHistoryItem = (cf: ComputedFeature) =>
    openHistory(
      {
        waterwayId: section.waterway_id,
        sectionId: section.id,
        featureId: cf.feature.id,
      },
      featureName(cf.feature),
    );

  const ctx = {
    activeId,
    onHistoryItem,
    onItemClick: handleItemClick,
    onEditItem,
    onDeleteItem,
    pendingDeleteIds,
  };

  // A grade over the whole run has no row, so its actions live in the header.
  const grade = grades[0];
  const gradeActions: RowAction[] = [
    {
      label: "History",
      icon: <HistoryIcon fontSize="small" />,
      onClick: () =>
        openHistory(
          { waterwayId: section.waterway_id, sectionId: section.id },
          localizedName(section.name, section.names),
        ),
    },
  ];
  if (grade && onEditItem) {
    gradeActions.push({
      label: "Edit grade",
      icon: <EditOutlinedIcon fontSize="small" />,
      onClick: () => onEditItem(grade),
    });
  }
  if (grade && onDeleteItem) {
    gradeActions.push({
      label: "Delete grade",
      icon: <DeleteOutlinedIcon fontSize="small" />,
      danger: true,
      onClick: () => onDeleteItem(grade),
    });
  }

  if (!section.features.length && !tree.length) {
    return <EmptyState title="No features for this section." />;
  }

  const count = section.features.length;
  const longest = Math.max(
    totalM,
    ...approved.map((f) => f.endM),
    ...grades.map((f) => f.endM),
  );

  return (
    <HistoryHost
      target={historyTarget}
      name={historyName}
      onClose={() => setHistoryTarget(null)}
    >
      <Box
        data-testid="features-card"
        sx={{
          bgcolor: tokens.surface,
          borderRadius: `${tokens.radii.md}px`,
          boxShadow: tokens.elevation.e1,
          m: 1.5,
          pb: 1,
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            pl: 2,
            pr: 0.5,
            minHeight: tokens.touch.min,
          }}
        >
          <Typography
            data-testid="features-count"
            sx={{
              flex: 1,
              fontSize: "0.875rem",
              fontWeight: 600,
              color: tokens.onSurfaceVariant,
            }}
          >
            {count} {count === 1 ? "feature" : "features"}
          </Typography>
          <RowMenu actions={gradeActions} label="Section actions" />
          <IconButton
            data-testid="features-fold"
            aria-expanded={!folded}
            aria-label={folded ? "Show features" : "Fold features"}
            onClick={() => setFolded((f) => !f)}
            sx={{
              width: tokens.touch.min,
              height: tokens.touch.min,
              color: tokens.onSurfaceVariant,
            }}
          >
            <ExpandLessIcon
              sx={{
                transform: folded ? "rotate(180deg)" : "none",
                transition: `transform ${css.fast} ${css.easeOut}`,
              }}
            />
          </IconButton>
        </Box>

        <Box sx={{ px: 2, pb: 1 }}>
          <FeatureStrip
            features={approved}
            grade={grades.length ? featureName(grades[0].feature) : null}
            totalM={longest}
          />
        </Box>

        <Collapse in={!folded} timeout={durations.base} unmountOnExit>
          <Box sx={{ px: 0.5 }}>
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
        </Collapse>

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
      </Box>
    </HistoryHost>
  );
}
