import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import type { SectionWithFeatures } from "@/lib/api";
import { fonts, theme } from "@/lib/theme";
import { PointEntry } from "./PointEntry";

const { tokens } = theme;

import type { ComputedFeature } from "./types";
import { buildTree, computeExtent } from "./utils";
import { ZoneEntry } from "./ZoneEntry";

interface Props {
  section: SectionWithFeatures;
  onFeatureClick?: (coords: [number, number] | null) => void;
}

export default function FeatureTimeline({ section, onFeatureClick }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const lineCoords = useMemo((): [number, number][] => {
    if (section.location?.type !== "LineString") return [];
    return (section.location.coordinates as number[][]).map(
      (c): [number, number] => [c[0], c[1]],
    );
  }, [section.location]);

  const tree = useMemo(() => {
    if (!section.features.length) return [];
    return buildTree(section.features.map((f) => computeExtent(f, lineCoords)));
  }, [section.features, lineCoords]);

  function handleItemClick(cf: ComputedFeature) {
    const newId = activeId === cf.feature.id ? null : cf.feature.id;
    setActiveId(newId);
    onFeatureClick?.(newId != null ? cf.coords : null);
  }

  if (!tree.length) {
    return (
      <Typography
        sx={{
          fontFamily: fonts.body,
          fontSize: 12,
          color: tokens.outline,
          p: "8px 4px",
        }}
      >
        No features for this section.
      </Typography>
    );
  }

  return (
    <Stack direction="column" sx={{ p: 1 }}>
      {tree.map((node, idx) =>
        node.item.isZone ? (
          <ZoneEntry
            key={node.item.feature.id}
            item={node.item}
            nested={node.nested}
            isLast={idx === tree.length - 1}
            activeId={activeId}
            onItemClick={handleItemClick}
          />
        ) : (
          <PointEntry
            key={node.item.feature.id}
            item={node.item}
            isLast={idx === tree.length - 1}
            isActive={activeId === node.item.feature.id}
            onClick={() => handleItemClick(node.item)}
          />
        ),
      )}
    </Stack>
  );
}
