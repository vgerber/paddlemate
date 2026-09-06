import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import LoadingBox from "@/components/states/LoadingBox";
import SectionListItem from "@/components/waterway/SectionListItem";
import type { TripSection } from "@/lib/api";
import { useWaterwaySections } from "@/lib/hooks/useWaterwaySections";

interface Props {
  sections: TripSection[];
  onSelect: (sectionId: number, waterwayId: number) => void;
}

/**
 * The sections watched from a base, shown the way the section list shows
 * them: place, difficulty and the live water level. A trip section carries
 * only an id, so the waterways behind them are fetched to fill the rest in -
 * the same cache the map page fills.
 */
export default function WatchList({ sections, onSelect }: Props) {
  const waterwayIds = useMemo(
    () => [
      ...new Set(
        sections
          .map((s) => s.waterway_id)
          .filter((id): id is number => id != null),
      ),
    ],
    [sections],
  );

  const { sections: loaded, arePending } = useWaterwaySections(
    waterwayIds,
    waterwayIds.length > 0,
  );

  const byId = useMemo(() => new Map(loaded.map((s) => [s.id, s])), [loaded]);

  const ordered = useMemo(
    () => [...sections].sort((a, b) => a.sort_order - b.sort_order),
    [sections],
  );

  if (ordered.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ px: 2, py: 1 }}>
        Nothing on the list yet.
      </Typography>
    );
  }

  if (arePending) return <LoadingBox size={28} pt={2} />;

  return (
    <Box>
      {ordered.map((tripSection) => {
        const section = byId.get(tripSection.section_id);
        if (!section) {
          // The waterway did not load - name it from what the trip carries
          // rather than dropping the row.
          return (
            <Typography
              key={tripSection.id}
              variant="body2"
              sx={{ px: 2, py: 0.5 }}
            >
              {tripSection.section_name ?? `Section #${tripSection.section_id}`}
            </Typography>
          );
        }
        return (
          <SectionListItem
            key={tripSection.id}
            section={section}
            waterwayId={section.waterway_id}
            selected={false}
            onClick={() => onSelect(section.id, section.waterway_id)}
          />
        );
      })}
    </Box>
  );
}
