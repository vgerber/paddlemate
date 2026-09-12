import CheckIcon from "@mui/icons-material/Check";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { factLabelSx } from "@/components/Fact";
import MarkdownText from "@/components/MarkdownText";
import RowMenu from "@/components/RowMenu";
import { stayKind } from "@/components/trips/stayKinds";
import FormSection from "@/components/waterway/FormSection";
import type { TripStay, TripStayCandidate } from "@/lib/api";
import { dateRange } from "@/lib/format";
import {
  useAcceptCandidate,
  useVoteCandidate,
  useWithdrawCandidate,
} from "@/lib/hooks/useTrips";
import { fonts, theme } from "@/lib/theme";
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
    <FormSection label={`Up for a vote (${candidates.length})`}>
      <Box>
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
        onConfirm={async () => {
          if (confirming) await accept.mutateAsync(confirming.id);
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </FormSection>
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
          bgcolor: `${tokens.outlineVariant}55`,
          display: "flex",
        }}
      >
        {/* Cyan is the app's "key data value"; the signal colours stay with
            water levels, so a vote does not borrow red and green. */}
        <Box sx={{ width: `${share}%`, bgcolor: tokens.primary }} />
      </Box>
      <Typography sx={{ ...factLabelSx, flexShrink: 0 }}>
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
  const { label, Icon } = stayKind(candidate.kind);
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
      onClick: () => withdraw.mutate(candidate.id),
      danger: true,
    });
  }

  return (
    <ButtonBase
      component="div"
      disableRipple
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-label={`${candidate.name}, ${candidate.upvotes} for, ${candidate.downvotes} against`}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        py: 1.5,
        px: 2,
        borderBottom: "1px solid",
        borderColor: `${tokens.outlineVariant}55`,
        bgcolor: isOpen ? `${tokens.primary}0d` : "transparent",
        "&:hover": { bgcolor: isOpen ? `${tokens.primary}14` : "action.hover" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Icon sx={{ fontSize: 18, color: "text.disabled" }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {candidate.name}
          </Typography>
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontSize: "0.75rem",
              color: candidate.arrival ? "primary.main" : "text.disabled",
            }}
          >
            {candidate.arrival
              ? dateRange(candidate.arrival, candidate.departure)
              : "No dates yet"}
          </Typography>
        </Box>
        <Chip label={label} size="small" variant="outlined" />
      </Box>

      <SupportBar up={candidate.upvotes} down={candidate.downvotes} />

      {(supporters.length > 0 || objectors.length > 0) && (
        <Typography sx={{ ...factLabelSx, mt: 0.5, display: "block" }}>
          {supporters.length > 0 && `For: ${supporters.join(", ")}`}
          {supporters.length > 0 && objectors.length > 0 && "  ·  "}
          {objectors.length > 0 && `Against: ${objectors.join(", ")}`}
        </Typography>
      )}

      {/* Opening a candidate is not voting on it, so the inside swallows the
          clicks the row would otherwise take as a toggle. */}
      <Collapse in={isOpen} timeout={200} unmountOnExit>
        <Box onClick={(e) => e.stopPropagation()} sx={{ pt: 1.5 }}>
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

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={candidate.viewer_vote ?? null}
              onChange={(_, next: number | null) =>
                vote.mutate({
                  candidateId: candidate.id,
                  // Pressing your own vote again takes it back.
                  vote: next === 1 || next === -1 ? (next as 1 | -1) : null,
                })
              }
              disabled={vote.isPending}
            >
              <ToggleButton value={1} aria-label={`Vote for ${candidate.name}`}>
                <ThumbUpOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />
                {candidate.upvotes}
              </ToggleButton>
              <ToggleButton
                value={-1}
                aria-label={`Vote against ${candidate.name}`}
              >
                <ThumbDownOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />
                {candidate.downvotes}
              </ToggleButton>
            </ToggleButtonGroup>

            <Box sx={{ flex: 1 }} />

            {isAdmin && (
              <Button
                size="small"
                startIcon={<CheckIcon fontSize="small" />}
                onClick={onAccept}
              >
                Make this a base
              </Button>
            )}
            <RowMenu
              actions={actions}
              label={`Actions for ${candidate.name}`}
            />
          </Box>
        </Box>
      </Collapse>
    </ButtonBase>
  );
}
