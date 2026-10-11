import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import ListItemButton from "@mui/material/ListItemButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useMemo, useState } from "react";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import FormSection from "@/components/waterway/FormSection";
import { apiErrorMessage } from "@/lib/api/client";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useAllUsers } from "@/lib/hooks/useFollows";
import { useAddTripMember } from "@/lib/hooks/useTrips";
import { alphas, theme } from "@/lib/theme";

import InviteLinks from "./InviteLinks";

const { tokens } = theme;

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
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!picked) return;
    setError(null);
    try {
      await addMember.mutateAsync(picked);
      setPicked(null);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Adding failed. Please try again."));
    }
  }

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
      <DialogTitle sx={{ fontWeight: 600 }}>Add a member</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
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
                  data-testid="user-pick"
                  selected={user.id === picked}
                  disabled={addMember.isPending}
                  onClick={() => setPicked(user.id)}
                  sx={{
                    minHeight: tokens.touch.min,
                    borderBottom: "1px solid",
                    borderColor: `${tokens.outlineVariant}${alphas.hairline}`,
                  }}
                >
                  <Typography variant="body2">{user.username}</Typography>
                </ListItemButton>
              ))}
            </Box>
          )}
        </FormSection>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={addMember.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!picked || addMember.isPending}
          onClick={handleAdd}
          startIcon={
            addMember.isPending ? <CircularProgress size={16} /> : undefined
          }
        >
          Add to trip
        </Button>
      </DialogActions>
    </Dialog>
  );
}
