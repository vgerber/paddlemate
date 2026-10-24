import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import ListItemButton from "@mui/material/ListItemButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useMemo, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import MemberAvatar from "@/components/trips/MemberAvatar";
import FormSection from "@/components/waterway/FormSection";
import { withAlpha } from "@/lib/alpha";
import { apiErrorMessage } from "@/lib/api/client";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useUserSearch } from "@/lib/hooks/useFollows";
import { useAddTripMember } from "@/lib/hooks/useTrips";
import { AddPersonIcon } from "@/lib/icons";
import { BOTTOM_NAV_SPACE, fonts, theme } from "@/lib/theme";

import InviteLinks from "./InviteLinks";

const { tokens } = theme;

/** Letters typed before the server is asked. */
const MIN_QUERY = 2;

/**
 * Who to add: a link for people not on Paddlemate yet, or somebody already
 * here by name. A trip is invite-only, so these are the only ways in - and
 * both are an admin's to use, which is why it hangs off the members tab rather than
 * offering itself to everyone who can see the trip.
 *
 * A bottom sheet on a phone, a dialog beside the list on a desktop.
 */
export default function AddMemberDialog({
  tripId,
  memberIds,
  open,
  onClose,
}: {
  tripId: number;
  /** Already in the trip, so not offered again. */
  memberIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const phone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  const body = (
    <AddMemberBody tripId={tripId} memberIds={memberIds} open={open} />
  );

  if (phone) {
    return (
      <BottomSheet
        state={open ? "open" : "closed"}
        // There is no peek for a form: anything but open closes it.
        onStateChange={(next) => next !== "open" && onClose()}
        label="Add a member"
      >
        <Box sx={{ px: 2, pb: `calc(${BOTTOM_NAV_SPACE} + 16px)` }}>
          <Typography
            component="h2"
            sx={{
              fontFamily: fonts.body,
              fontSize: 18,
              lineHeight: "24px",
              fontWeight: 700,
            }}
          >
            Add a member
          </Typography>
          <Typography
            color="textSecondary"
            sx={{ fontSize: "0.875rem", lineHeight: "20px", mb: 2 }}
          >
            Send a link, or add someone already here
          </Typography>
          {body}
        </Box>
      </BottomSheet>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <Box sx={{ px: 3, pt: 2.5 }}>
        <Typography
          component="h2"
          sx={{
            fontFamily: fonts.body,
            fontSize: 18,
            lineHeight: "24px",
            fontWeight: 700,
          }}
        >
          Add a member
        </Typography>
        <Typography
          color="textSecondary"
          sx={{ fontSize: "0.875rem", lineHeight: "20px" }}
        >
          Send a link, or add someone already here
        </Typography>
      </Box>
      <DialogContent>{body}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function AddMemberBody({
  tripId,
  memberIds,
  open,
}: {
  tripId: number;
  memberIds: string[];
  open: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), 250);
  // Nobody is listed before a name is typed: the server holds every account.
  const searching = open && query.length >= MIN_QUERY;
  const {
    data: pages,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useUserSearch(searching ? query : "");
  const addMember = useAddTripMember(tripId);
  const [error, setError] = useState<string | null>(null);

  // Tapping a name is the whole action, as the hint says.
  async function handleAdd(userId: string) {
    setError(null);
    try {
      await addMember.mutateAsync(userId);
    } catch (err) {
      setError(apiErrorMessage(err, "Adding failed. Please try again."));
    }
  }

  const candidates = useMemo(
    () =>
      (pages?.pages ?? [])
        .flatMap((p) => p.items)
        .filter((u) => !memberIds.includes(u.id)),
    [pages, memberIds],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <InviteLinks tripId={tripId} />
      <FormSection
        label="Already on Paddlemate"
        hint="Added straight away - no link needed."
      >
        <TextField
          label="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
        />
        {!searching ? (
          <Typography
            color="textSecondary"
            sx={{ fontSize: "0.875rem", lineHeight: "20px" }}
          >
            Type a name to find someone.
          </Typography>
        ) : isLoading ? (
          <LoadingBox size={40} pt={4} />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={
              <AddPersonIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            }
            title="Nobody by that name."
          />
        ) : (
          <Box>
            {candidates.map((user) => (
              <ListItemButton
                key={user.id}
                data-testid="user-pick"
                disabled={addMember.isPending}
                onClick={() => handleAdd(user.id)}
                sx={{
                  minHeight: tokens.touch.min,
                  gap: 1.5,
                  borderBottom: "1px solid",
                  borderColor: withAlpha(tokens.outlineVariant, "hairline"),
                }}
              >
                <MemberAvatar name={user.username} size={32} />
                <Typography sx={{ fontSize: "0.9375rem" }}>
                  {user.username}
                </Typography>
              </ListItemButton>
            ))}
            {hasNextPage && (
              <Button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                sx={{ minHeight: tokens.touch.min }}
              >
                Show more
              </Button>
            )}
          </Box>
        )}
      </FormSection>
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  );
}
