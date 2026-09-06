import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import useMediaQuery from "@mui/material/useMediaQuery";
import DescentCard from "@/components/descents/DescentCard";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { useLinkDescentToTrip } from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";

interface Props {
  tripId: number;
  open: boolean;
  onClose: () => void;
}

/** Credit one of your existing logs to the trip. A log belongs to one trip. */
export default function LinkDescentDialog({ tripId, open, onClose }: Props) {
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const { data, isLoading } = useMyDescents({});
  const linkDescent = useLinkDescentToTrip(tripId);

  const unlinked = (data?.items ?? []).filter((d) => d.trip_id !== tripId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle>Link a log</DialogTitle>
      <DialogContent sx={{ px: 0 }}>
        {isLoading ? (
          <LoadingBox size={40} pt={4} />
        ) : unlinked.length === 0 ? (
          <EmptyState title="Every log of yours is already in this trip." />
        ) : (
          <Box>
            {unlinked.map((d) => (
              <DescentCard
                key={d.id}
                descent={d}
                onClick={() => {
                  linkDescent.mutate({ id: d.id, trip_id: tripId });
                  onClose();
                }}
              />
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
