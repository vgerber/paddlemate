import HistoryIcon from "@mui/icons-material/History";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { HistoryStep, Proposal } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import { labelSx, theme } from "@/lib/theme";
import HistoryChanges from "./HistoryChanges";
import type { DotKind } from "./HistoryRail";
import ProposalStep, { ReviewNote } from "./ProposalStep";
import StepRow, { Byline, smallSx } from "./StepRow";
import { inOrder, stepByline, stepHeadline } from "./steps";
import type { HistoryTarget } from "./types";
import { useEntryProposals, useHistory } from "./useProvenance";

const { tokens } = theme;

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

function dotKind(step: HistoryStep, origin: boolean): DotKind {
  if (step.kind === "deleted") return "gone";
  return origin ? "origin" : "done";
}

function Step({
  step,
  origin,
  first,
  last,
  approved,
}: {
  step: HistoryStep;
  origin: boolean;
  first: boolean;
  last: boolean;
  approved: Proposal | undefined;
}) {
  return (
    <StepRow
      kind={dotKind(step, origin)}
      first={first}
      last={last}
      title={stepHeadline(step)}
    >
      <Byline
        parts={stepByline(step)}
        tail={[formatDate(step.at)]}
        dateTestId="history-when"
      />
      <SourceLicence step={step} />
      <HistoryChanges changes={step.changes} />
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

/** The history of one entry on the timeline rail, oldest first: where it
 * came from at the top, the latest change below it, then any open proposal
 * as a hollow step waiting for a decision. Rejected proposals fold away. */
export default function HistoryTimeline({ target }: { target: HistoryTarget }) {
  const { data, isLoading, error } = useHistory(target);
  const proposals = useEntryProposals(target);
  const { isAdmin } = useSession();
  const [showRejected, setShowRejected] = useState(false);

  if (isLoading) return <LoadingBox size={28} py={4} />;
  if (error) {
    return (
      <EmptyState
        title={apiErrorMessage(error, "The history could not be loaded.")}
      />
    );
  }
  const steps = inOrder(data?.items ?? []);
  const all = proposals.data ?? [];
  const open = all.filter((p) => p.status === "pending");
  const rejected = all.filter((p) => p.status === "rejected");
  const approvedById = new Map(
    all.filter((p) => p.status === "approved").map((p) => [p.id, p]),
  );
  const shown = showRejected ? rejected : [];
  const total = steps.length + open.length + shown.length;
  if (total === 0 && rejected.length === 0) {
    return <EmptyState icon={<HistoryIcon />} title="No history yet." />;
  }
  return (
    <Box
      data-testid="history"
      sx={{
        m: 1.5,
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e1,
        overflow: "hidden",
      }}
    >
      <Typography sx={{ ...labelSx, px: 2, pt: 1.75, pb: 0.5 }}>
        History
      </Typography>
      <Box sx={{ pt: 0.5, pb: 1 }}>
        {steps.map((step, i) => (
          <Step
            key={step.id}
            step={step}
            origin={i === 0 && ["imported", "created"].includes(step.kind)}
            first={i === 0}
            last={i === total - 1}
            approved={
              step.proposal_id != null
                ? approvedById.get(step.proposal_id)
                : undefined
            }
          />
        ))}
        {[...open, ...shown].map((proposal, i) => (
          <ProposalStep
            key={proposal.id}
            proposal={proposal}
            first={steps.length + i === 0}
            last={steps.length + i === total - 1}
            canReview={isAdmin}
          />
        ))}
      </Box>
      {rejected.length > 0 && (
        <RejectedFold
          count={rejected.length}
          open={showRejected}
          onToggle={() => setShowRejected((v) => !v)}
        />
      )}
    </Box>
  );
}
