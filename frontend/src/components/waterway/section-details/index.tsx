import { useMemo, useState } from "react";

import type { SectionWithFeatures } from "@/lib/api";
import { PointEntry } from "./PointEntry";
import { fonts, tokens } from "./tokens";
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
      <p
        style={{
          fontFamily: fonts.body,
          fontSize: 12,
          color: tokens.outline,
          padding: "8px 4px",
          margin: 0,
        }}
      >
        No features for this section.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", paddingBottom: 8 }}>
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
    </div>
  );
}
