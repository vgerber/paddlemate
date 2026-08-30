import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import Typography from "@mui/material/Typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { VISIBILITY_ICONS } from "@/components/descents/DescentCard";
import DescentDetail from "@/components/descents/DescentDetail";
import DescentForm from "@/components/descents/DescentForm";
import LoadingBox from "@/components/states/LoadingBox";
import { useDeleteDescent, useDescent } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { fonts } from "@/lib/theme";

export const Route = createFileRoute("/logs/$descentId")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === "true",
  }),
  component: LogDetailPage,
});

function LogDetailPage() {
  const navigate = useNavigate();
  const { descentId } = Route.useParams();
  const { edit } = Route.useSearch();
  const { user } = useSession();
  const { data: descent, isLoading } = useDescent(Number(descentId));
  const deleteDescent = useDeleteDescent();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setEdit = (value: boolean) =>
    navigate({
      to: "/logs/$descentId",
      params: { descentId },
      search: { edit: value },
      replace: true,
    });

  if (isLoading) {
    return <LoadingBox size={40} pt={8} />;
  }

  if (!descent) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <Typography variant="body2" color="text.disabled">
          Log not found.
        </Typography>
      </Box>
    );
  }

  const isOwner = user != null && user.id === descent.user_id;

  if (edit && isOwner) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 2 }}>
        <DescentForm
          descent={descent}
          onSave={() => setEdit(false)}
          onCancel={() => setEdit(false)}
        />
      </Box>
    );
  }

  const title =
    descent.name ||
    [
      ...new Set(descent.sections.map((s) => s.waterway_name).filter(Boolean)),
    ].join(" / ") ||
    "Descent";
  const subtitle = [
    descent.username,
    new Date(descent.start_time).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2, gap: 1 }}>
        <IconButton
          size="small"
          onClick={() => history.back()}
          aria-label="Back"
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
            {title}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography variant="caption" color="text.secondary" noWrap>
              {subtitle}
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                color: "text.disabled",
                flexShrink: 0,
              }}
            >
              {VISIBILITY_ICONS[descent.visibility.type]}
              <Typography
                sx={{
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: fonts.label,
                }}
              >
                {descent.visibility.type}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
      <DescentDetail descent={descent} />
      {isOwner && (
        <SpeedDial
          ariaLabel="Log actions"
          icon={
            <SpeedDialIcon icon={<MoreVertIcon />} openIcon={<CloseIcon />} />
          }
          direction="up"
          sx={{
            position: "fixed",
            bottom: {
              xs: "calc(56px + env(safe-area-inset-bottom) + 16px)",
              md: 24,
            },
            right: 16,
          }}
        >
          <SpeedDialAction
            icon={<EditOutlinedIcon />}
            title="Edit"
            onClick={() => setEdit(true)}
          />
          <SpeedDialAction
            icon={<DeleteOutlinedIcon />}
            title="Delete"
            onClick={() => setConfirmDelete(true)}
          />
        </SpeedDial>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this log?"
        body="The log and its water level snapshots are removed permanently."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        color="error"
        pending={deleteDescent.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          // A failure surfaces via the global error snackbar; the dialog
          // stays open so the user can retry or cancel.
          deleteDescent.mutate(descent.id, {
            onSuccess: () => navigate({ to: "/logs" }),
          })
        }
      />
    </Box>
  );
}
