import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DescentDetail from "@/components/descents/DescentDetail";
import DescentForm from "@/components/descents/DescentForm";
import PanelHeader from "@/components/PanelHeader";
import RowMenu from "@/components/RowMenu";
import LoadingBox from "@/components/states/LoadingBox";
import { formatDate } from "@/lib/format";
import { useDeleteDescent, useDescent } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { theme } from "@/lib/theme";

const VISIBILITY_LABELS = {
  private: "Private",
  shared: "Shared",
  public: "Public",
} as const;

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
  // From md up this renders in the logs pane, where the list beside it
  // already names the log and carries the way back.
  const embedded = useMediaQuery(theme.breakpoints.up("md"));
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
        <Typography variant="body2" color="textDisabled">
          Log not found.
        </Typography>
      </Box>
    );
  }

  const isOwner = user != null && user.id === descent.user_id;

  // The edit form carries a bottom bar, which needs a floor to sit on.
  const formShellSx = embedded
    ? { height: "100%" }
    : { maxWidth: 720, mx: "auto" };

  if (edit && isOwner) {
    return (
      <Box sx={formShellSx}>
        <DescentForm
          descent={descent}
          embedded={embedded}
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
    formatDate(descent.start_time),
    VISIBILITY_LABELS[descent.visibility.type],
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box sx={embedded ? undefined : { maxWidth: 720, mx: "auto" }}>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        onBack={embedded ? undefined : () => history.back()}
        actionButton={
          isOwner ? (
            <RowMenu
              actions={[
                {
                  label: "Edit",
                  icon: <EditOutlinedIcon />,
                  onClick: () => setEdit(true),
                },
                {
                  label: "Delete",
                  icon: <DeleteOutlinedIcon />,
                  danger: true,
                  onClick: () => setConfirmDelete(true),
                },
              ]}
            />
          ) : undefined
        }
      />
      <Box sx={{ px: 2, py: 2 }}>
        <DescentDetail descent={descent} />
      </Box>
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
