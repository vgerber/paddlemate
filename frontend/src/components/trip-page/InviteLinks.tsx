import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DoneIcon from "@mui/icons-material/Done";
import IosShareOutlinedIcon from "@mui/icons-material/IosShareOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import RowMenu from "@/components/RowMenu";
import FormSection from "@/components/waterway/FormSection";
import type { TripInvite, TripInviteCreated } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import {
  useCreateTripInvite,
  useDeleteTripInvite,
  useTripInvites,
} from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";

const inviteUrl = (token: string) =>
  `${window.location.origin}/invite/${token}`;

/**
 * Links that let people join, for the friend who is not on Paddlemate yet.
 * A new link is shown once - only its hash is kept - so it is copied or shared
 * right away; the list below says which links still work and who used them.
 */
export default function InviteLinks({ tripId }: { tripId: number }) {
  const { data: invites } = useTripInvites(tripId);
  const create = useCreateTripInvite(tripId);
  const withdraw = useDeleteTripInvite(tripId);
  const [fresh, setFresh] = useState<TripInviteCreated | null>(null);
  const [withdrawing, setWithdrawing] = useState<TripInvite | null>(null);

  return (
    <FormSection
      label="Invite link"
      hint="Anyone with the link can join until it expires - share it in your group chat."
      action={
        <Button
          variant="outlined"
          sx={{ minHeight: theme.tokens.touch.min }}
          disabled={create.isPending}
          onClick={() => create.mutate(undefined, { onSuccess: setFresh })}
        >
          New link
        </Button>
      }
    >
      {fresh && <FreshLink invite={fresh} />}

      {(invites ?? []).map((invite) => (
        <Box
          key={invite.id}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            py: 0.75,
            borderBottom: "1px solid",
            borderColor: `${theme.tokens.outlineVariant}55`,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2">
              Works until {formatDate(invite.expires_at)}
            </Typography>
            <Typography variant="caption" color="textDisabled">
              By {invite.created_by_username} ·{" "}
              {invite.uses === 1 ? "1 joined" : `${invite.uses} joined`}
            </Typography>
          </Box>
          <RowMenu
            label="Link actions"
            actions={[
              {
                label: "Withdraw link",
                icon: <LinkOffOutlinedIcon fontSize="small" />,
                danger: true,
                onClick: () => setWithdrawing(invite),
              },
            ]}
          />
        </Box>
      ))}

      <ConfirmDialog
        open={withdrawing !== null}
        title="Withdraw this link?"
        body="Nobody else can join through it. People who already joined stay on the trip."
        confirmLabel="Withdraw"
        pendingLabel="Withdrawing…"
        pending={withdraw.isPending}
        color="error"
        onConfirm={() => {
          if (!withdrawing) return;
          withdraw.mutate(withdrawing.id, {
            onSuccess: () => {
              if (fresh?.id === withdrawing.id) setFresh(null);
              setWithdrawing(null);
            },
          });
        }}
        onCancel={() => setWithdrawing(null)}
      />
    </FormSection>
  );
}

/** The link just made, the one moment it can be copied. */
function FreshLink({ invite }: { invite: TripInviteCreated }) {
  const url = inviteUrl(invite.token);
  const { copied, copy } = useCopyToClipboard();
  // The phone's own share sheet reaches the group chat in one tap.
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <Box
      data-testid="invite-card"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 1.5,
        borderRadius: `${theme.tokens.radii.md}px`,
        bgcolor: theme.tokens.surfaceHigh,
      }}
    >
      <Typography
        noWrap
        sx={{
          fontSize: "0.8125rem",
          lineHeight: "18px",
          color: "text.secondary",
          userSelect: "all",
        }}
      >
        {url}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button
          variant="contained"
          sx={{ flex: 1, minHeight: theme.tokens.touch.min }}
          startIcon={
            copied ? (
              <DoneIcon fontSize="small" />
            ) : (
              <ContentCopyOutlinedIcon fontSize="small" />
            )
          }
          aria-label={copied ? "Copied" : "Copy link"}
          onClick={() => copy(url)}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare && (
          <IconButton
            aria-label="Share link"
            sx={{
              width: theme.tokens.touch.min,
              height: theme.tokens.touch.min,
              borderRadius: `${theme.tokens.radii.sm}px`,
              bgcolor: theme.tokens.surface,
            }}
            onClick={() =>
              navigator
                .share({ title: "Join the trip", url })
                // Dismissing the share sheet rejects; nothing to do.
                .catch(() => undefined)
            }
          >
            <IosShareOutlinedIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Typography variant="caption" color="textSecondary">
        Copy it now - it is shown only once. Works until{" "}
        {formatDate(invite.expires_at)}.
      </Typography>
    </Box>
  );
}
