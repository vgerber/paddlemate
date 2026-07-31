import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import DescentCard from "@/components/descents/DescentCard";
import { useInfiniteDescents } from "@/lib/hooks/useDescents";

interface SectionLogsListProps {
  sectionId: number;
}

/** Descents that include the given section, newest first. Logging a new one
 * is the add FAB's job, not this list's. */
export default function SectionLogsList({ sectionId }: SectionLogsListProps) {
  const navigate = useNavigate();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteDescents({ section_id: sectionId, per_page: 20 });

  const descents = data?.pages.flatMap((page) => page.items) ?? [];

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
