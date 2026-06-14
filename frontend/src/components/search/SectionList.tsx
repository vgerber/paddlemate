import Box from "@mui/material/Box";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import type { SectionWithFeatures } from "@/lib/api";
import SectionListItem from "@/components/waterway/SectionListItem";

interface SectionListProps {
  sections: SectionWithFeatures[];
  selectedSectionId?: number;
  waterwayNames?: Record<number, string>;
  onSectionClick?: (id: number) => void;
  favoritedIds?: Set<number>;
  onToggleFavorite?: (id: number) => void;
}

export default function SectionList({
  sections,
  selectedSectionId,
  waterwayNames,
  onSectionClick,
  favoritedIds,
  onToggleFavorite,
}: SectionListProps) {
  // Group sections by waterway
  const grouped = useMemo(() => {
    const result: { waterwayId: number; sections: SectionWithFeatures[] }[] =
      [];
    const seen = new Map<number, SectionWithFeatures[]>();
    for (const s of sections) {
      const existing = seen.get(s.waterway_id);
      if (existing) {
        existing.push(s);
      } else {
        const arr = [s];
        seen.set(s.waterway_id, arr);
        result.push({ waterwayId: s.waterway_id, sections: arr });
      }
    }
    return result;
  }, [sections]);

  if (sections.length === 0) {
    return (
      <Typography
        color="text.secondary"
        variant="body2"
        sx={{ textAlign: "center", py: 4 }}
      >
        No sections found.
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {grouped.map(({ waterwayId, sections: group }) => (
        <Box key={waterwayId}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1,
              pt: 1.5,
              pb: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: "text.secondary",
                textTransform: "uppercase",
                fontSize: "0.65rem",
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
              }}
            >
              {waterwayNames?.[waterwayId] ?? `River #${waterwayId}`}
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>
          {group.map((section) => (
            <SectionListItem
              key={section.id}
              section={section}
              waterwayId={section.waterway_id}
              selected={section.id === selectedSectionId}
              onClick={(id) => onSectionClick?.(id)}
              isFavorite={favoritedIds?.has(section.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </Box>
      ))}
    </List>
  );
}
