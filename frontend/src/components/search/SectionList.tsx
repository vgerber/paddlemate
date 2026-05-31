import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import type { SectionWithFeatures } from "@/lib/api";

interface SectionListProps {
  sections: SectionWithFeatures[];
  selectedSectionId?: number;
  waterwayNames?: Record<number, string>;
  onSectionClick?: (id: number) => void;
}

export default function SectionList({
  sections,
  selectedSectionId,
  waterwayNames,
  onSectionClick,
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
          {group.map((section) => {
            const ww = section.features?.find(
              (f) => f.feature_type === "whitewater",
            );
            const diff = (ww?.metadata as Record<string, unknown> | undefined)
              ?.difficulty as string | undefined;

            return (
              <ListItemButton
                key={section.id}
                selected={section.id === selectedSectionId}
                onClick={() => onSectionClick?.(section.id)}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemText
                  primary={section.name}
                  secondary={
                    [section.region, section.country]
                      .filter(Boolean)
                      .join(", ") || undefined
                  }
                  slotProps={{
                    primary: { variant: "body2" },
                    secondary: { variant: "caption" },
                  }}
                />
                {diff && (
                  <Chip label={diff} size="small" sx={{ flexShrink: 0 }} />
                )}
              </ListItemButton>
            );
          })}
        </Box>
      ))}
    </List>
  );
}
