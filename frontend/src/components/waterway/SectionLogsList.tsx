import AddIcon from "@mui/icons-material/Add";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import DescentCard from "@/components/descents/DescentCard";
import { useInfiniteDescents } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";

interface SectionLogsListProps {
  waterwayId: number;
  sectionId: number;
}

/** Descents that include the given section, newest first. */
export default function SectionLogsList({
  waterwayId,
  sectionId,
}: SectionLogsListProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useSession();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteDescents({ section_id: sectionId, per_page: 20 });

  const descents = data?.pages.flatMap((page) => page.items) ?? [];

  const onLogDescent = () =>
    navigate({
      to: "/logs/new",
      search: { waterwayId, sectionId, startTime: undefined },
    });

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (descents.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          py: 6,
          color: "text.disabled",
        }}
      >
        <DirectionsBoatOutlinedIcon sx={{ fontSize: 40 }} />
        <Typography variant="body2">
          No descents logged for this section yet.
        </Typography>
        {isAuthenticated && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onLogDescent}
          >
            Log descent
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ border: "1px solid", borderColor: "divider" }}>
        {descents.map((descent) => (
          <DescentCard
            key={descent.id}
            descent={descent}
            showAuthor
            onClick={() =>
              navigate({
                to: "/logs/$descentId",
                params: { descentId: String(descent.id) },
                search: { edit: false },
              })
            }
          />
        ))}
      </Box>
      {hasNextPage && (
        <Button
          size="small"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </Box>
  );
}
