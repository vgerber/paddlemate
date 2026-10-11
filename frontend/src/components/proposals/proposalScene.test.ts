import { describe, expect, test } from "bun:test";
import type { Feature, Proposal, SectionWithFeatures } from "@/lib/api";
import { buildProposalScene, geometryPositions } from "./proposalScene";

const line = (coordinates: number[][]) =>
  ({ type: "LineString", coordinates }) as Feature["location"];

function proposal(over: Partial<Proposal>): Proposal {
  return {
    id: 5,
    entity_type: "water_section",
    entity_id: 1,
    operation: "update",
    status: "pending",
    proposed_data: {},
    original_data: null,
    ...over,
  } as Proposal;
}

const stored = {
  id: 1,
  location: line([
    [10, 46],
    [10.1, 46.1],
  ]),
  features: [
    {
      id: 7,
      feature_type: "weir",
      location: { type: "Point", coordinates: [10.05, 46.05] },
    },
  ],
} as unknown as SectionWithFeatures;

describe("geometryPositions", () => {
  test("flattens points, lines and polygons", () => {
    expect(geometryPositions({ type: "Point", coordinates: [1, 2] })).toEqual([
      [1, 2],
    ]);
    expect(
      geometryPositions(
        line([
          [1, 2],
          [3, 4],
        ]),
      ),
    ).toHaveLength(2);
    expect(
      geometryPositions({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      } as Feature["location"]),
    ).toHaveLength(4);
  });
});

describe("buildProposalScene", () => {
  test("is bare with no proposal open", () => {
    expect(buildProposalScene(undefined, undefined)).toEqual({
      subject: null,
    });
  });

  test("a section update draws the stored line and the proposed one, framed together", () => {
    const scene = buildProposalScene(
      proposal({
        proposed_data: {
          location: line([
            [11, 47],
            [11.2, 47.2],
          ]),
        },
      }),
      [stored],
    );
    expect(scene.sections).toEqual([stored]);
    expect(scene.drawing?.sectionPreviewCoords).toEqual([
      [11, 47],
      [11.2, 47.2],
    ]);
    expect(scene.subject?.bounds).toEqual([
      [10, 46],
      [11.2, 47.2],
    ]);
    expect(scene.subject?.key).toBe("proposal:5:4");
  });

  test("a section delete draws only what exists", () => {
    const scene = buildProposalScene(proposal({ operation: "delete" }), [
      stored,
    ]);
    expect(scene.drawing?.sectionPreviewCoords).toBeUndefined();
    expect(scene.subject?.bounds).toEqual([
      [10, 46],
      [10.1, 46.1],
    ]);
  });

  test("a moved feature frames the old and the new place", () => {
    const scene = buildProposalScene(
      proposal({
        entity_type: "feature",
        entity_id: 7,
        proposed_data: {
          section_id: 1,
          feature_type: "weir",
          location: { type: "Point", coordinates: [10.2, 46.2] },
        },
      }),
      [stored],
    );
    expect(scene.features).toEqual(stored.features);
    expect(scene.proposedFeatures).toHaveLength(1);
    expect(scene.subject?.bounds).toEqual([
      [10.05, 46.05],
      [10.2, 46.2],
    ]);
  });

  test("a rename keeps the feature where it is", () => {
    const scene = buildProposalScene(
      proposal({
        entity_type: "feature",
        entity_id: 7,
        proposed_data: { section_id: 1, name: "New name" },
      }),
      [stored],
    );
    expect(scene.proposedFeatures?.[0].location).toEqual(
      stored.features[0].location,
    );
  });

  test("a river with no geometry frames nothing", () => {
    const scene = buildProposalScene(
      proposal({ entity_type: "waterway", entity_id: null }),
      undefined,
    );
    expect(scene.subject).toBeNull();
  });
});
