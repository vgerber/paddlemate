import List from "@mui/material/List";
import EmptyState from "@/components/states/EmptyState";
import type { SectionWithFeatures } from "@/lib/api";
import { matchedFeatureName } from "@/lib/sectionMatch";
import SearchSectionRow from "./SearchSectionRow";

interface SectionListProps {
  sections: SectionWithFeatures[];
  selectedSectionId?: number;
  waterwayNames?: Record<number, string>;
  onSectionClick?: (id: number) => void;
  favoritedIds?: Set<number>;
  onToggleFavorite?: (id: number) => void;
  /** Active name search, used to say which rapid made a section match. */
  searchName?: string;
}

/** Sections as one flat list of cards; each names its own river, so no
 * river headings are needed between them. */
export default function SectionList({
  sections,
  selectedSectionId,
  waterwayNames,
  onSectionClick,
  favoritedIds,
  onToggleFavorite,
  searchName,
}: SectionListProps) {
  if (sections.length === 0) {
    return <EmptyState title="No sections found." py={4} />;
  }

  return (
    <List dense disablePadding>
      {sections.map((section) => (
        <SearchSectionRow
          key={section.id}
          section={section}
          riverName={
            waterwayNames?.[section.waterway_id] ??
            `River #${section.waterway_id}`
          }
          selected={section.id === selectedSectionId}
          onClick={(id) => onSectionClick?.(id)}
          isFavorite={favoritedIds?.has(section.id)}
          onToggleFavorite={onToggleFavorite}
          matchedFeature={
            searchName ? matchedFeatureName(section, searchName) : undefined
          }
        />
      ))}
    </List>
  );
}
