import HistoryIcon from "@mui/icons-material/History";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import {
  featureName,
  sentence,
} from "@/components/waterway/section-details/utils";
import type { HistoryStep, SectionWithFeatures } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { formatDate, humanize } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import { localizedName } from "@/lib/localization";
import { labelSx, theme } from "@/lib/theme";
import {
  type EditItem,
  type EntryRef,
  mergeEdits,
  resolveProposals,
  sameEntry,
} from "./editsFeed";
import HistoryChanges from "./HistoryChanges";
import type { DotKind } from "./HistoryRail";
import ProposalStep, { ReviewNote } from "./ProposalStep";
import StepRow, { Byline, smallSx } from "./StepRow";
import { stepByline, stepHeadline } from "./steps";
import type { HistoryTarget } from "./types";
import { useEntryHistories, useSectionProposals } from "./useProvenance";

const { tokens } = theme;

/** Which entry the timeline is narrowed to; none shows the whole section. */
export type EditsFilter = { kind: "section" | "feature"; id: number } | null;

/** The section and each of its features, as the timeline names them. */
export function sectionEntries(section: SectionWithFeatures): EntryRef[] {
  return [
    {
      kind: "section",
      id: section.id,
      name: localizedName(section.name, section.names),
      label: "Section",
    },
    ...section.features.map(
      (f): EntryRef => ({
        kind: "feature",
        id: f.id,
        name: featureName(f),
        label: sentence(humanize(f.feature_type)),
      }),
    ),
  ];
}

function targetOf(
  section: SectionWithFeatures,
  entry: EntryRef,
): HistoryTarget {
  const base = { waterwayId: section.waterway_id, sectionId: section.id };
  return entry.kind === "feature" && entry.id != null
    ? { ...base, featureId: entry.id }
    : base;
}

function SourceLicence({ step }: { step: HistoryStep }) {
  const source = step.source;
  if (step.kind !== "imported" || !source?.license_name) return null;
  return (
    <Typography sx={{ ...smallSx, color: "text.secondary" }}>
      Licence:{" "}
      {source.license_url ? (
        <Link
          href={source.license_url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: tokens.touch.min,
          }}
        >
          {source.license_name}
        </Link>
      ) : (
        source.license_name
      )}
    </Typography>
  );
}

function dotKind(step: HistoryStep): DotKind {
  if (step.kind === "deleted") return "gone";
  return step.kind === "imported" || step.kind === "created"
    ? "origin"
    : "done";
}

/** The entry a step is about, as a link that opens that entry's edits. A
 * proposed feature has no entry to open yet and reads as plain text. */
function EntryLead({
  entry,
  onOpen,
}: {
  entry: EntryRef;
  onOpen: (entry: EntryRef) => void;
}) {
  const text = (
    <>
      <Box component="span" sx={{ fontWeight: 600 }}>
        {entry.name}
      </Box>
      {` · ${entry.label}`}
    </>
  );
  const sx = {
    ...smallSx,
    color: tokens.primary,
    display: "flex",
    justifyContent: "flex-start",
    textAlign: "left",
    width: "100%",
    // The line is 13px type; the hit area is drawn around it.
    minHeight: tokens.touch.min,
    my: "-13px",
    overflowWrap: "anywhere",
  } as const;
  if (entry.id == null) {
    return (
      <Typography
        data-testid="edit-entry"
        sx={{ ...sx, alignItems: "center", color: "text.secondary" }}
      >
        {text}
      </Typography>
    );
  }
  return (
    <ButtonBase
      data-testid="edit-entry"
      onClick={() => onOpen(entry)}
      sx={{ ...sx, alignItems: "center" }}
    >
      {text}
    </ButtonBase>
  );
}

function Edit({
  item,
  first,
  last,
  lead,
  canReview,
}: {
  item: EditItem;
  first: boolean;
  last: boolean;
  lead: React.ReactNode;
  canReview: boolean;
}) {
  if (item.type === "proposal") {
    return (
      <ProposalStep
        proposal={item.proposal}
        first={first}
        last={last}
        canReview={canReview}
        lead={lead}
      />
    );
  }
  const { step, approved } = item;
  return (
    <StepRow
      kind={dotKind(step)}
      first={first}
      last={last}
      title={stepHeadline(step)}
      lead={lead}
    >
      <Byline
        parts={stepByline(step)}
        tail={[formatDate(step.at)]}
        dateTestId="history-when"
      />
      <SourceLicence step={step} />
      <HistoryChanges changes={step.changes} />
      {step.proposal_note && (
        <ReviewNote note={step.proposal_note} testId="proposal-note" />
      )}
      {approved?.review_note && <ReviewNote note={approved.review_note} />}
    </StepRow>
  );
}

function RejectedFold({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <ButtonBase
      data-testid="rejected-fold"
      onClick={onToggle}
      aria-expanded={open}
      sx={{
        width: "100%",
        minHeight: 48,
        borderTop: `1px solid ${tokens.outlineVariant}`,
        color: tokens.primary,
        fontWeight: 600,
        fontSize: "0.875rem",
      }}
    >
      {open ? "Hide rejected" : `Show rejected (${count})`}
    </ButtonBase>
  );
}

/** Every edit of a section and its features on one timeline rail, oldest
 * first: where each entry came from, its changes, and the open proposals as
 * hollow steps last. With a filter it is the one entry's own history. Each
 * step names its entry and opens it. Rejected proposals fold away. */
export default function EditsTimeline({
  section,
  filter,
  onOpenEntry,
}: {
  section: SectionWithFeatures;
  filter: EditsFilter;
  onOpenEntry: (entry: EntryRef) => void;
}) {
  const { isAdmin } = useSession();
  const [showRejected, setShowRejected] = useState(false);
  const everything = useMemo(() => sectionEntries(section), [section]);
  const shown = useMemo(
    () =>
      filter
        ? everything.filter((e) => e.kind === filter.kind && e.id === filter.id)
        : everything,
    [everything, filter],
  );
  const histories = useEntryHistories(shown.map((e) => targetOf(section, e)));
  const proposals = useSectionProposals(section.id);

  const resolved = useMemo(
    () =>
      resolveProposals(proposals.data ?? [], everything).filter(
        (p) => !filter || shown.some((e) => sameEntry(e, p.entry)),
      ),
    [proposals.data, everything, filter, shown],
  );
  const { items, rejected } = useMemo(
    () =>
      mergeEdits(
        shown.map((entry, i) => ({
          entry,
          steps: histories.data[i] ?? [],
        })),
        resolved,
        showRejected,
      ),
    [shown, histories.data, resolved, showRejected],
  );

  if (histories.isLoading) return <LoadingBox size={28} py={4} />;
  if (histories.error) {
    return (
      <EmptyState
        title={apiErrorMessage(
          histories.error,
          "The history could not be loaded.",
        )}
      />
    );
  }
  if (items.length === 0 && rejected === 0) {
    return <EmptyState icon={<HistoryIcon />} title="No history yet." />;
  }
  return (
    <Box
      data-testid="history"
      sx={{
        // From md the pane's own 8 gutter spaces the card.
        m: { xs: 1.5, md: 0 },
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e1,
        overflow: "hidden",
      }}
    >
      <Typography sx={{ ...labelSx, px: 2, pt: 1.75, pb: 0.5 }}>
        {filter ? "History" : "All edits"}
      </Typography>
      <Box sx={{ pt: 0.5, pb: 1 }}>
        {items.map((item, i) => (
          <Edit
            key={item.key}
            item={item}
            first={i === 0}
            last={i === items.length - 1}
            canReview={isAdmin}
            lead={
              filter ? undefined : (
                <EntryLead entry={item.entry} onOpen={onOpenEntry} />
              )
            }
          />
        ))}
      </Box>
      {rejected > 0 && (
        <RejectedFold
          count={rejected}
          open={showRejected}
          onToggle={() => setShowRejected((v) => !v)}
        />
      )}
    </Box>
  );
}
