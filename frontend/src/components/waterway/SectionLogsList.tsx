import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useNavigate } from "@tanstack/react-router";
import DescentCard from "@/components/descents/DescentCard";
import QueryStates from "@/components/states/QueryStates";
import { useInfiniteDescents } from "@/lib/hooks/useDescents";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface SectionLogsListProps {
  sectionId: number;
}

/** Descents that include the given section, newest first. Logging a new one
 * is the add FAB's job, not this list's. */
export default function SectionLogsList({ sectionId }: SectionLogsListProps) {
  const navigate = useNavigate();
  const query = useInfiniteDescents({ section_id: sectionId, per_page: 20 });
  const { data, isFetchingNextPage, hasNextPage, fetchNextPage } = query;

  const descents = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <QueryStates
      query={query}
      count={descents.length}
      empty={{
        icon: <DirectionsBoatOutlinedIcon />,
        title: "No descents logged for this section yet.",
      }}
      errorFallback="Could not load the logs."
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          mx: { xs: 1.5, md: 0 },
        }}
      >
        {descents.map((descent) => (
          <Box
            key={descent.id}
            data-testid="section-log"
            sx={{
              bgcolor: tokens.surface,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: tokens.elevation.e1,
              px: 2,
              overflow: "hidden",
            }}
          >
            <DescentCard
              flush
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
          </Box>
        ))}
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
    </QueryStates>
  );
}
