import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import OpenInFullOutlinedIcon from "@mui/icons-material/OpenInFullOutlined";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import type { Proposal, ProposalStatus } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  useReviewProposal,
  useUnvoteProposal,
  useVoteProposal,
} from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

export const STATUS_COLOR: Record<
  ProposalStatus,
  "default" | "warning" | "success" | "error"
> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
};

const OP_LABEL: Record<string, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
};

const ENTITY_LABEL: Record<string, string> = {
  waterway: "River",
  water_section: "Section",
  feature: "Feature",
};

const HIDDEN_KEYS = new Set(["geometry", "water_ranges", "location"]);

/** Additionally hidden on create cards: internal ids, the name (it is the
 * card title already) and per-entity plumbing fields. */
const CREATE_HIDDEN_KEYS = new Set([
  ...HIDDEN_KEYS,
  "name",
  "waterway_id",
  "section_id",
  "feature_id",
  "lang_code",
]);

/** Skip values that would render as noise ("—", "{}", "[]"). */
function isDisplayable(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function diffObjects(
  original: Record<string, unknown>,
  proposed: Record<string, unknown>,
): Array<{ key: string; from: unknown; to: unknown }> {
  const keys = new Set([...Object.keys(original), ...Object.keys(proposed)]);
  const diffs: Array<{ key: string; from: unknown; to: unknown }> = [];
  for (const key of keys) {
    if (JSON.stringify(original[key]) !== JSON.stringify(proposed[key])) {
      diffs.push({ key, from: original[key], to: proposed[key] });
    }
  }
  return diffs;
}

function shortValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  // Features bundled with a new-section proposal: summarize instead of JSON
  if (key === "features" && Array.isArray(v)) {
    return v
      .map((f) => {
        const feature = f as {
          feature_type?: string;
          name?: string | null;
          metadata?: { difficulty?: string };
        };
        const type = (feature.feature_type ?? "feature").replace(/_/g, " ");
        const extra = feature.name || feature.metadata?.difficulty;
        return extra ? `${type} (${extra})` : type;
      })
      .join(", ");
  }
  // Localized names/descriptions: list the languages, not the JSON
  if (key === "translations" && Array.isArray(v)) {
    return v
      .map((t) =>
        ((t as { lang_code?: string }).lang_code ?? "?").toUpperCase(),
      )
      .join(", ");
  }
  // Feature metadata: show simple entries like "difficulty III+"
  if (key === "metadata" && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, value]) => typeof value !== "object")
      .map(([k, value]) => `${k.replace(/_/g, " ")} ${String(value)}`);
    if (entries.length > 0) return entries.join(", ");
  }
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  return JSON.stringify(v).slice(0, 80);
}

/** Best human-readable headline for a proposal. */
export function proposalTitle(proposal: Proposal): string {
  const proposed = (proposal.proposed_data ?? {}) as Record<string, unknown>;
  const original = (proposal.original_data ?? {}) as Record<string, unknown>;
  const name = (proposed.name ?? original.name) as string | undefined;
  if (name) return name;
  const featureType = (proposed.feature_type ?? original.feature_type) as
    | string
    | undefined;
  if (featureType) return featureType.replace(/_/g, " ");
  return ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type;
}

interface ProposalCardProps {
  proposal: Proposal;
  adminMode?: boolean;
}

export default function ProposalCard({
  proposal,
  adminMode,
}: ProposalCardProps) {
  const { isAuthenticated, user } = useSession();
  const navigate = useNavigate();
  const vote = useVoteProposal();
  const unvote = useUnvoteProposal();
  const review = useReviewProposal();
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAction, setReviewAction] = useState<
    "approved" | "rejected" | null
  >(null);

  function closeReview() {
    if (review.isPending) return;
    setReviewAction(null);
    review.reset();
  }

  function handleReview() {
    if (!reviewAction) return;
    review.mutate(
      {
        id: proposal.id,
        body: { status: reviewAction, review_note: reviewNote || null },
      },
      {
        onSuccess: () => {
          setReviewAction(null);
          review.reset();
        },
      },
    );
  }

  const isOwn = user?.id === proposal.submitted_by;
  const proposed = proposal.proposed_data as Record<string, unknown>;
  const original = proposal.original_data as
    | Record<string, unknown>
    | null
    | undefined;

  const diffs =
    original && proposal.operation === "update"
      ? diffObjects(original, proposed)
      : null;

  function handleVote(v: 1 | -1) {
    if (proposal.user_vote === v) {
      unvote.mutate(proposal.id);
    } else {
      vote.mutate({ id: proposal.id, vote: v });
    }
  }

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      {/* Title row */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontWeight: 700,
            fontSize: "0.9rem",
            letterSpacing: "0.02em",
            flex: 1,
            minWidth: 0,
            textTransform:
              proposal.entity_type === "feature" ? "capitalize" : "none",
          }}
          noWrap
        >
          {proposalTitle(proposal)}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.6rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: fonts.label,
            color: `${STATUS_COLOR[proposal.status]}.main`,
            flexShrink: 0,
          }}
        >
          {proposal.status}
        </Typography>
        <Tooltip title="View full proposal">
          <IconButton
            size="small"
            aria-label="View full proposal"
            onClick={() =>
              navigate({
                to: "/proposals/$proposalId",
                params: { proposalId: String(proposal.id) },
              })
            }
            sx={{ flexShrink: 0, mt: -0.5 }}
          >
            <OpenInFullOutlinedIcon sx={{ fontSize: "0.9rem" }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Entity · operation */}
      <Typography
        sx={{
          fontSize: "0.68rem",
          color: "text.disabled",
          fontFamily: fonts.label,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type} ·{" "}
        {OP_LABEL[proposal.operation] ?? proposal.operation}
      </Typography>

      {/* Content */}
      {proposal.operation === "delete" && (
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Deletion request
          {original ? `: "${(original.name as string | undefined) ?? ""}"` : ""}
        </Typography>
      )}

      {proposal.operation === "create" &&
        typeof proposed.description === "string" &&
        proposed.description && (
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {proposed.description}
          </Typography>
        )}

      {proposal.operation === "create" && (
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            columnGap: 1.5,
            rowGap: 0.25,
            flexWrap: "wrap",
          }}
        >
          {Object.entries(proposed)
            .filter(
              ([k, v]) =>
                !CREATE_HIDDEN_KEYS.has(k) &&
                k !== "description" &&
                isDisplayable(v),
            )
            .map(([k, v]) => (
              <Typography
                key={k}
                sx={{ fontSize: "0.7rem", color: "text.secondary" }}
              >
                <Box
                  component="span"
                  sx={{
                    color: "text.disabled",
                    fontFamily: fonts.label,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontSize: "0.6rem",
                    mr: 0.5,
                  }}
                >
                  {k.replace(/_/g, " ")}
                </Box>
                {shortValue(k, v)}
              </Typography>
            ))}
        </Box>
      )}

      {diffs && diffs.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 1fr 1fr",
            gap: "2px 12px",
          }}
        >
          {["field", "before", "after"].map((h) => (
            <Typography
              key={h}
              variant="caption"
              sx={{
                color: "text.disabled",
                fontFamily: fonts.label,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontSize: "0.62rem",
              }}
            >
              {h}
            </Typography>
          ))}
          {diffs
            .filter(({ key }) => !HIDDEN_KEYS.has(key))
            .map(({ key, from, to }) => (
              <Fragment key={key}>
                <Typography variant="caption">
                  {key.replace(/_/g, " ")}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ textDecoration: "line-through", color: "error.main" }}
                >
                  {shortValue(key, from)}
                </Typography>
                <Typography variant="caption" sx={{ color: "success.main" }}>
                  {shortValue(key, to)}
                </Typography>
              </Fragment>
            ))}
        </Box>
      )}

      {/* Review note for non-pending */}
      {proposal.review_note && (
        <Typography variant="caption" color="text.secondary">
          Note: {proposal.review_note}
        </Typography>
      )}

      {/* Footer: date + submitter + votes */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 0.25 }}>
        <Typography
          sx={{
            fontFamily: fonts.mono,
            fontSize: "0.72rem",
            color: "primary.main",
            flexShrink: 0,
          }}
        >
          {new Date(proposal.created_at).toLocaleDateString()}
        </Typography>
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            color: "text.disabled",
            fontFamily: fonts.label,
            fontSize: "0.68rem",
            letterSpacing: "0.04em",
          }}
          noWrap
        >
          {isOwn ? "You" : proposal.submitted_by}
        </Typography>

        <Tooltip
          title={!isAuthenticated ? "Login to vote" : ""}
          placement="top"
        >
          <span>
            <IconButton
              size="small"
              disabled={!isAuthenticated}
              onClick={() => handleVote(1)}
              sx={{
                color:
                  proposal.user_vote === 1 ? tokens.secondary : tokens.outline,
              }}
            >
              <ThumbUpOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography
          sx={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: tokens.outline,
            lineHeight: 1,
          }}
        >
          {proposal.upvotes}
        </Typography>
        <Tooltip
          title={!isAuthenticated ? "Login to vote" : ""}
          placement="top"
        >
          <span>
            <IconButton
              size="small"
              disabled={!isAuthenticated}
              onClick={() => handleVote(-1)}
              sx={{
                color:
                  proposal.user_vote === -1 ? "error.main" : tokens.outline,
              }}
            >
              <ThumbDownOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography
          sx={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: tokens.outline,
            lineHeight: 1,
          }}
        >
          {proposal.downvotes}
        </Typography>

        {adminMode && proposal.status === "pending" && (
          <>
            <Tooltip title="Approve proposal" placement="top">
              <IconButton
                size="small"
                onClick={() => setReviewAction("approved")}
                sx={{ ml: 1, color: tokens.secondary }}
              >
                <CheckOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reject proposal" placement="top">
              <IconButton
                size="small"
                onClick={() => setReviewAction("rejected")}
                sx={{ color: "error.main" }}
              >
                <CloseOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Review confirmation dialog */}
      <Dialog open={reviewAction !== null} onClose={closeReview}>
        <DialogTitle>
          {reviewAction === "approved"
            ? "Approve proposal?"
            : "Reject proposal?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {reviewAction === "approved"
              ? "This applies the proposed change and makes it live."
              : "This dismisses the proposal without applying it."}
          </DialogContentText>
          <TextField
            label="Note (optional)"
            size="small"
            multiline
            rows={2}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            fullWidth
          />
          {review.isError && (
            <Alert
              severity="error"
              sx={{ mt: 1.5, py: 0.25, fontSize: "0.75rem" }}
            >
              {review.error instanceof ApiError && review.error.status === 409
                ? review.error.message
                : "Review failed. Please try again."}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReview} disabled={review.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleReview}
            color={reviewAction === "approved" ? "success" : "error"}
            disabled={review.isPending}
          >
            {review.isPending
              ? "Saving…"
              : reviewAction === "approved"
                ? "Approve"
                : "Reject"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
