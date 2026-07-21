import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import DescentCard from "@/components/descents/DescentCard";
import DescentForm from "@/components/descents/DescentForm";
import { useDeleteDescent, useDescent } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";

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

  const setEdit = (value: boolean) =>
    navigate({
      to: "/logs/$descentId",
      params: { descentId },
      search: { edit: value },
      replace: true,
    });

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <CircularProgress />
      </Box>
    );
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

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
        <IconButton
          size="small"
          onClick={() => history.back()}
          aria-label="Back"
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        {isOwner && (
          <>
            <IconButton
              size="small"
              onClick={() => setEdit(true)}
              aria-label="Edit"
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete"
              disabled={deleteDescent.isPending}
              onClick={async () => {
                if (!window.confirm("Delete this log?")) return;
                await deleteDescent.mutateAsync(descent.id);
                navigate({ to: "/logs" });
              }}
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </Box>
      <Box sx={{ border: "1px solid", borderColor: "divider" }}>
        <DescentCard descent={descent} showAuthor />
      </Box>
      {descent.note && (
        <Typography variant="body2" sx={{ mt: 2, whiteSpace: "pre-wrap" }}>
          {descent.note}
        </Typography>
      )}
    </Box>
  );
}
