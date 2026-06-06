import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import DescentCard from "@/components/descents/DescentCard";
import DescentForm from "@/components/descents/DescentForm";
import type { Descent } from "@/lib/api";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

function LogsPage() {
  const { isAuthenticated, isLoading: sessionLoading, login } = useSession();
  const { data, isLoading } = useMyDescents({});

  // null = closed, undefined = new, Descent = editing
  const [formTarget, setFormTarget] = useState<Descent | undefined | null>(
    null,
  );

  if (sessionLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pt: 10,
          px: 2,
        }}
      >
        <DirectionsBoatOutlinedIcon
          sx={{ fontSize: 56, color: "text.disabled" }}
        />
        <Typography variant="h6" color="text.secondary">
          Sign in to view your logs
        </Typography>
        <Button variant="contained" color="secondary" onClick={login}>
          Sign In
        </Button>
      </Box>
    );
  }

  const descents = data?.items ?? [];
  const isFormOpen = formTarget !== null;

  return (
    <>
      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 3,
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            My Logs
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setFormTarget(undefined)}
            sx={{ borderRadius: 0, display: { xs: "none", md: "inline-flex" } }}
          >
            Log descent
          </Button>
        </Box>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 6 }}>
            <CircularProgress />
          </Box>
        ) : descents.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
              pt: 8,
              color: "text.disabled",
            }}
          >
            <DirectionsBoatOutlinedIcon sx={{ fontSize: 48 }} />
            <Typography variant="body2">No descents logged yet.</Typography>
          </Box>
        ) : (
          <Box sx={{ border: "1px solid", borderColor: "divider" }}>
            {descents.map((d) => (
              <DescentCard
                key={d.id}
                descent={d}
                onClick={() => setFormTarget(d)}
              />
            ))}
          </Box>
        )}
      </Box>

      <Fab
        color="secondary"
        onClick={() => setFormTarget(undefined)}
        sx={{
          position: "fixed",
          bottom: "calc(56px + env(safe-area-inset-bottom) + 16px)",
          right: 16,
          display: { xs: "flex", md: "none" },
        }}
      >
        <AddIcon />
      </Fab>

      <Dialog
        open={isFormOpen}
        onClose={() => setFormTarget(null)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 2,
            pt: 1.5,
            pb: 0,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              fontFamily: '"Space Grotesk", monospace',
              flex: 1,
            }}
          >
            {formTarget ? "Edit descent" : "Log a descent"}
          </Typography>
          <IconButton size="small" onClick={() => setFormTarget(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <DialogContent sx={{ p: 0 }}>
          {isFormOpen && (
            <DescentForm
              descent={formTarget ?? undefined}
              onSave={() => setFormTarget(null)}
              onCancel={() => setFormTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
