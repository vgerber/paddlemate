import CheckIcon from "@mui/icons-material/Check";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { factLabelSx } from "@/components/Fact";
import MarkdownText from "@/components/MarkdownText";
import RowMenu from "@/components/RowMenu";
import RolePill from "@/components/trips/RolePill";
import { stayKind } from "@/components/trips/stayKinds";
import VoteButton from "@/components/VoteButton";
import type { TripStay, TripStayCandidate } from "@/lib/api";
import { dateRange } from "@/lib/format";
import {
  useAcceptCandidate,
  useVoteCandidate,
  useWithdrawCandidate,
} from "@/lib/hooks/useTrips";
import { durations } from "@/lib/motion";
import { alphas, fonts, theme } from "@/lib/theme";
import { nearestWatched } from "@/lib/tripRange";
import StayDialog from "./StayDialog";

const { tokens } = theme;

/**
 * Bases somebody has put up but nobody has agreed to yet. Where to stay is
 * the part of a trip a group actually argues about, so the argument gets a
 * place to happen instead of living in a chat thread.
 *
 * Each one reads at a glance - name, how the vote stands, who is on which
 * side - and opens for the rest, so a list of five candidates is still a
 * list rather than five screens of detail.
 */
export default function TripCandidates({
  tripId,
  candidates,
  stays,
  viewerId,
  isAdmin,
}: {
  tripId: number;
  candidates: TripStayCandidate[];
  /** The accepted bases, for measuring a candidate against the watch lists. */
  stays: TripStay[];
  viewerId: string | null;
  isAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<TripStayCandidate | null>(null);
  // Accepting is the one move here that cannot be undone, so the confirm -
  // and the mutation behind it - lives up here rather than inside a row that
  // is itself a click target.
  const [confirming, setConfirming] = useState<TripStayCandidate | null>(null);
  const accept = useAcceptCandidate(tripId);

  if (candidates.length === 0) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography
        data-testid="form-section-label"
        sx={{
          fontFamily: fonts.label,
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "text.secondary",
        }}
      >
        {`Up for a vote (${candidates.length})`}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {candidates.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            tripId={tripId}
            candidate={candidate}
            stays={stays}
            viewerId={viewerId}
            isAdmin={isAdmin}
            isOpen={candidate.id === openId}
            onToggle={() =>
              setOpenId((cur) => (cur === candidate.id ? null : candidate.id))
            }
            onEdit={() => setEditing(candidate)}
            onAccept={() => setConfirming(candidate)}
          />
        ))}
      </Box>

      {editing && (
        <StayDialog
          tripId={tripId}
          candidate={editing}
          open
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="Make this a base?"
        body={
          confirming
            ? `"${confirming.name}" joins the trip's bases and stops being a suggestion. The votes on it go with it, and the others stay up for a vote.`
            : ""
        }
        confirmLabel="Make it a base"
        pendingLabel="Adding…"
        pending={accept.isPending}
        onConfirm={() => {
          if (!confirming) return;
          accept.mutate(confirming, { onSuccess: () => setConfirming(null) });
        }}
        onCancel={() => setConfirming(null)}
      />
    </Box>
  );
}

/** How much of the vote is behind it, as a share of the votes cast. */
function SupportBar({ up, down }: { up: number; down: number }) {
  const cast = up + down;
  const share = cast === 0 ? 0 : (up / cast) * 100;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75 }}>
      <Box
        sx={{
          flex: 1,
          height: 6,
          borderRadius: `${tokens.radii.xs}px`,
          overflow: "hidden",
          bgcolor: `${tokens.outlineVariant}${alphas.hairline}`,
          display: "flex",
        }}
      >
        {/* Cyan is the app's "key data value"; the signal colours stay with
            water levels, so a vote does not borrow red and green. */}
        <Box sx={{ width: `${share}%`, bgcolor: tokens.primary }} />
      </Box>
      <Typography
        sx={{
          ...factLabelSx,
          fontSize: "0.8125rem",
          fontWeight: 400,
          flexShrink: 0,
        }}
      >
        {cast === 0 ? "No votes yet" : `${up} for · ${down} against`}
      </Typography>
    </Box>
  );
}

function CandidateRow({
  tripId,
  candidate,
  stays,
  viewerId,
  isAdmin,
  isOpen,
  onToggle,
  onEdit,
  onAccept,
}: {
  tripId: number;
  candidate: TripStayCandidate;
  stays: TripStay[];
  viewerId: string | null;
  isAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAccept: () => void;
}) {
  const vote = useVoteCandidate(tripId);
  const withdraw = useWithdrawCandidate(tripId);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const { label } = stayKind(candidate.kind);
  const near = nearestWatched(candidate, stays);
  const mine = candidate.proposed_by === viewerId;

  // A count says how many; on a trip of four, the names say whether the
  // argument is already settled. "you" rather than your own username,
  // because reading your own name in a list of other people is a jolt.
  const naming = (value: 1 | -1) =>
    candidate.voters
      .filter((v) => v.vote === value)
      .map((v) => (v.user_id === viewerId ? "you" : v.username));
  const supporters = naming(1);
  const objectors = naming(-1);

  const actions = [];
  // Accepting is the admin's call; it sits in the menu so the card keeps to
  // the vote and who is on which side.
  if (isAdmin) {
    actions.push({
      label: "Make this a base",
      icon: <CheckIcon fontSize="small" />,
      onClick: onAccept,
    });
  }
  // Anyone on the trip may correct a suggestion - the wrong price, a dead
  // link, the dates it is actually free. It belongs to the trip, not to
  // whoever typed it first.
  actions.push({
    label: "Edit",
    icon: <EditOutlinedIcon fontSize="small" />,
    onClick: onEdit,
  });
  if (mine || isAdmin) {
    actions.push({
      label: mine ? "Withdraw" : "Remove",
      icon: <DeleteOutlinedIcon fontSize="small" />,
      onClick: () => setConfirmingWithdraw(true),
      danger: true,
    });
  }

  return (
    <>
      <Box
        data-testid="candidate-row"
        sx={{
          borderRadius: `${tokens.radii.md}px`,
          bgcolor: tokens.surfaceHigh,
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", pr: 0.5 }}>
          <ButtonBase
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={`${candidate.name}, ${candidate.upvotes} for, ${candidate.downvotes} against`}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: tokens.touch.row,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 1,
              px: 1.5,
              py: 1,
              textAlign: "left",
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                noWrap
                sx={{
                  fontFamily: fonts.label,
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                }}
              >
                {candidate.name}
              </Typography>
              <Typography
                sx={{
                  ...factLabelSx,
                  fontSize: "0.8125rem",
                  fontWeight: 400,
                }}
              >
                {candidate.arrival
                  ? dateRange(candidate.arrival, candidate.departure)
                  : "No dates yet"}
              </Typography>
            </Box>
            <RolePill>{label}</RolePill>
          </ButtonBase>
          <RowMenu actions={actions} label={`Actions for ${candidate.name}`} />
        </Box>

        <Box sx={{ px: 1.5, pb: 1 }}>
          <SupportBar up={candidate.upvotes} down={candidate.downvotes} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <Typography
              sx={{
                ...factLabelSx,
                fontSize: "0.8125rem",
                fontWeight: 400,
                flex: 1,
                minWidth: 0,
              }}
            >
              {supporters.length > 0 && `For: ${supporters.join(", ")}`}
              {supporters.length > 0 && objectors.length > 0 && "  ·  "}
              {objectors.length > 0 && `Against: ${objectors.join(", ")}`}
            </Typography>
            <VoteButton
              direction="up"
              label={`Vote for ${candidate.name}`}
              count={candidate.upvotes}
              pressed={candidate.viewer_vote === 1}
              disabled={vote.isPending}
              // Pressing your own vote again takes it back.
              onClick={() =>
                vote.mutate({
                  candidateId: candidate.id,
                  vote: candidate.viewer_vote === 1 ? null : 1,
                })
              }
            />
            <VoteButton
              direction="down"
              label={`Vote against ${candidate.name}`}
              count={candidate.downvotes}
              pressed={candidate.viewer_vote === -1}
              disabled={vote.isPending}
              onClick={() =>
                vote.mutate({
                  candidateId: candidate.id,
                  vote: candidate.viewer_vote === -1 ? null : -1,
                })
              }
            />
          </Box>
        </Box>

        <Collapse in={isOpen} timeout={durations.base} unmountOnExit>
          <Box sx={{ px: 1.5, pb: 1.5 }}>
            <Typography sx={{ ...factLabelSx, display: "block" }}>
              Put up by {candidate.proposed_by_username}
            </Typography>

            {candidate.description && (
              <Box sx={{ mt: 0.5 }}>
                <MarkdownText>{candidate.description}</MarkdownText>
              </Box>
            )}

            {/* The number that decides it: a bed is only a good base if the
              water the group came for is near it. */}
            <Typography sx={{ ...factLabelSx, mt: 0.5, display: "block" }}>
              {near
                ? `${near.km.toFixed(1)} km to ${near.name}${near.river ? ` on the ${near.river}` : ""}`
                : "No location yet, so no distance to go on"}
            </Typography>
          </Box>
        </Collapse>
      </Box>
      <ConfirmDialog
        open={confirmingWithdraw}
        title={mine ? "Withdraw this suggestion?" : "Remove this suggestion?"}
        body={`"${candidate.name}" and its votes are dropped from the trip.`}
        confirmLabel={mine ? "Withdraw" : "Remove"}
        pendingLabel={mine ? "Withdrawing…" : "Removing…"}
        color="error"
        pending={withdraw.isPending}
        onConfirm={() =>
          withdraw.mutate(candidate.id, {
            onSuccess: () => setConfirmingWithdraw(false),
          })
        }
        onCancel={() => setConfirmingWithdraw(false)}
      />
    </>
  );
}
