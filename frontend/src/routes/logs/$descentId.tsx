import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
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
import MissingState from "@/components/states/MissingState";
import { descentTitle, VISIBILITY_LABELS } from "@/lib/descents";
import { formatDate } from "@/lib/format";
import { useDeleteDescent, useDescent } from "@/lib/hooks/useDescents";
import { useGoBack } from "@/lib/hooks/useGoBack";
import { useSession } from "@/lib/hooks/useSession";
import { theme } from "@/lib/theme";

export const Route = createFileRoute("/logs/$descentId")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === "true",
  }),
  component: LogDetailPage,
});

function LogDetailPage() {
  const navigate = useNavigate();
  const goBack = useGoBack(() => navigate({ to: "/logs", replace: true }));
  const { descentId } = Route.useParams();
  const { edit } = Route.useSearch();
  const { user } = useSession();
  // From md up this renders in the logs pane, where the list beside it
  // already names the log and carries the way back.
  const embedded = useMediaQuery(theme.breakpoints.up("md"));
  const {
    data: descent,
    isLoading,
    error,
    refetch,
  } = useDescent(Number(descentId));
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
      <Box sx={embedded ? undefined : { maxWidth: 720, mx: "auto" }}>
        {!embedded && <PanelHeader title="Log" onBack={goBack} />}
        <MissingState
          error={error}
          notFound="Log not found."
          onRetry={() => refetch()}
        />
      </Box>
    );
  }

  const isOwner = user != null && user.id === descent.user_id;

  // The edit form carries a bottom bar, which needs a floor to sit on.
  const formShellSx: SxProps<Theme> = embedded
    ? { flex: 1, display: "flex", flexDirection: "column" }
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

  const title = descentTitle(descent);
  const subtitle = [
    descent.username,
    formatDate(descent.start_time),
    VISIBILITY_LABELS[descent.visibility.type],
  ]
    .filter(Boolean)
    .join(" · ");

  const menu = isOwner ? (
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
  ) : undefined;

  return (
    <Box sx={embedded ? undefined : { maxWidth: 720, mx: "auto" }}>
      {embedded ? (
        // The pane is one card: the header and the body share its padding
        // and no rule divides them.
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            px: 3.5,
            pt: 2.5,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h3" noWrap>
              {title}
            </Typography>
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ fontSize: "0.8125rem", lineHeight: "18px" }}
            >
              {subtitle}
            </Typography>
          </Box>
          {menu}
        </Box>
      ) : (
        <PanelHeader
          title={title}
          subtitle={subtitle}
          onBack={goBack}
          actionButton={menu}
        />
      )}
      <Box sx={embedded ? { px: 3.5, py: 2.5 } : { px: 2, py: 2 }}>
        <DescentDetail descent={descent} showMap={!embedded} />
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
