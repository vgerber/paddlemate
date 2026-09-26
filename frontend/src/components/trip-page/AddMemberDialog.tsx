import CloseIcon from "@mui/icons-material/Close";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import ListItemButton from "@mui/material/ListItemButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useMemo, useState } from "react";
import PanelBottomBar from "@/components/PanelBottomBar";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import FormSection from "@/components/waterway/FormSection";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useAllUsers } from "@/lib/hooks/useFollows";
import { useAddTripMember } from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";
import InviteLinks from "./InviteLinks";

/**
 * Who to add: a link for people not on Paddlemate yet, or somebody already
 * here by name. A trip is invite-only, so these are the only ways in - and
 * both are an admin's to use, which is why it hangs off the members tab rather than
 * offering itself to everyone who can see the trip.
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
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 200);
  const { data: users, isLoading } = useAllUsers(open);
  const addMember = useAddTripMember(tripId);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => !memberIds.includes(u.id))
      .filter((u) => !q || u.username.toLowerCase().includes(q))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [users, memberIds, query]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={fullScreen}
    >
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <InviteLinks tripId={tripId} />
        <FormSection
          label="Already on Paddlemate"
          hint="Added straight away - no link needed."
        >
          <TextField
            size="small"
            label="Search people"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            autoFocus
          />
          {isLoading ? (
            <LoadingBox size={40} pt={4} />
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={
                <PersonAddOutlinedIcon
                  sx={{ fontSize: 48, color: "text.disabled" }}
                />
              }
              title={
                query
                  ? "Nobody by that name."
                  : "Everybody is already on the trip."
              }
            />
          ) : (
            <Box>
              {candidates.map((user) => (
                <ListItemButton
                  key={user.id}
                  disabled={addMember.isPending}
                  onClick={() => {
                    addMember.mutate(user.id);
                    onClose();
                  }}
                  sx={{
                    py: 1.25,
                    borderBottom: "1px solid",
                    borderColor: `${theme.tokens.outlineVariant}55`,
                  }}
                >
                  <Typography variant="body2">{user.username}</Typography>
                </ListItemButton>
              ))}
            </Box>
          )}
        </FormSection>
      </DialogContent>
      <PanelBottomBar
        leftIcon={<CloseIcon />}
        onLeftClick={onClose}
        leftLabel="Close"
        title="Add a member"
        subtitle="Send a link, or add someone already here"
        action={null}
      />
    </Dialog>
  );
}
