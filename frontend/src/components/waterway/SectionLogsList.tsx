import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useNavigate } from "@tanstack/react-router";
import DescentCard from "@/components/descents/DescentCard";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
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
    return <LoadingBox size={22} />;
  }

  if (descents.length === 0) {
    return (
      <EmptyState
        icon={
          <DirectionsBoatOutlinedIcon
            sx={{ fontSize: 40, color: "text.disabled" }}
          />
        }
        title="No descents logged for this section yet."
      />
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
