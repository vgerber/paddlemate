import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import {
  type MapScene,
  useCanvasScene,
} from "@/components/canvas/CanvasContext";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import ChartDock from "@/components/canvas/ChartDock";
import FloatingCard from "@/components/canvas/FloatingCard";
import type { Bounds } from "@/lib/geo";
import { theme } from "@/lib/theme";

const { tokens } = theme;

const BOUNDS: Bounds = [
  [11.0, 47.6],
  [12.6, 48.4],
];

const PINS = [
  [BOUNDS[0][0], BOUNDS[0][1]],
  [BOUNDS[1][0], BOUNDS[0][1]],
  [BOUNDS[1][0], BOUNDS[1][1]],
  [BOUNDS[0][0], BOUNDS[1][1]],
].map(([lon, lat], i) => ({
  id: `corner-${i}`,
  lon,
  lat,
  color: tokens.primary,
}));

const CARDS = {
  detail: { side: "left", kind: "detail", title: "Detail" },
  list: { side: "left", kind: "list", title: "List" },
  side: { side: "right", kind: "side", title: "Side" },
} as const;

type CardKey = keyof typeof CARDS;

const isCardKey = (k: string): k is CardKey => k in CARDS;

/** A fake scene with cards and a chart dock, for driving the canvas
 * foundation in a browser. `?cards=detail,list,side` picks the cards in
 * their order; the default is the detail card alone. Development only. */
export default function CanvasDemo() {
  const asked = new URLSearchParams(window.location.search).get("cards");
  const keys = (asked ?? "detail").split(",").filter(isCardKey);

  const scene = useMemo<MapScene>(
    () => ({
      pointPins: PINS,
      subject: { key: "demo", bounds: BOUNDS },
    }),
    [],
  );
  useCanvasScene(scene);

  return (
    <CanvasLayout>
      {keys.map((key) => {
        const { side, kind, title } = CARDS[key];
        return (
          <FloatingCard
            key={key}
            id={key}
            side={side}
            kind={kind}
            screen="demo"
            title={title}
            subtitle="Canvas foundation"
          >
            {key === "detail" && (
              <ChartDock>
                <Box
                  data-testid="demo-chart"
                  sx={{
                    height: "100%",
                    minHeight: 120,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: tokens.surface,
                  }}
                >
                  <Typography variant="body2">Chart</Typography>
                </Box>
              </ChartDock>
            )}
            <Typography variant="body2" sx={{ p: 2 }}>
              {title} content
            </Typography>
          </FloatingCard>
        );
      })}
    </CanvasLayout>
  );
}
