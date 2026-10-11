import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { type ReactNode, useLayoutEffect } from "react";
import type { CardSide } from "@/lib/canvasLayout";
import {
  type CardKind,
  readCardFrac,
  resizeBounds,
  writeCardFrac,
} from "@/lib/cardWidth";
import { theme } from "@/lib/theme";
import { layout, useLayout } from "./canvasStore";
import ResizeGrip from "./ResizeGrip";

const { tokens } = theme;
const { canvas } = tokens;

interface FloatingCardProps {
  /** Unique among the cards on screen. */
  id: string;
  side: CardSide;
  kind: CardKind;
  /** The card's title row; all that shows once the card is folded. */
  header: ReactNode;
  children: ReactNode;
  /** Names the screen whose remembered width this card uses. */
  screen?: string;
  /** Whether the grip shows; only a detail card has a resize range. */
  resizable?: boolean;
  /** Full height between the margins; otherwise as tall as its content. */
  fullHeight?: boolean;
  /** Folded first when the cards cover too much; higher stays open longer. */
  priority?: number;
}

/** A card floating over the canvas map. Its width, place and whether it is
 * folded come from the layout store, so the cards, the dock and the map's
 * padding always agree. Render it inside `CanvasLayout`. */
export default function FloatingCard({
  id,
  side,
  kind,
  header,
  children,
  screen = "default",
  resizable = kind === "detail",
  fullHeight = true,
  priority = canvas.cards[kind].priority,
}: FloatingCardProps) {
  useLayoutEffect(() => {
    layout.register({
      id,
      side,
      kind,
      priority,
      frac: resizable ? readCardFrac(screen, id) : null,
    });
    return () => layout.unregister(id);
  }, [id, side, kind, priority, screen, resizable]);

  const placement = useLayout((s) => s.placements.get(id));
  const windowWidth = useLayout((s) => s.viewport.w);
  if (!placement) return null;
  const { x, width, collapsed } = placement;
  const bounds = resizable ? resizeBounds(kind, windowWidth) : null;

  return (
    <Box
      component="section"
      data-testid={`canvas-card-${id}`}
      data-collapsed={collapsed || undefined}
      sx={{
        position: "absolute",
        left: x,
        top: canvas.margin,
        width,
        bottom: collapsed || !fullHeight ? undefined : canvas.margin,
        maxHeight: `calc(100% - ${2 * canvas.margin}px)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        pointerEvents: "auto",
        bgcolor: tokens.surfaceLowest,
        borderRadius: `${tokens.radii.lg}px`,
        boxShadow: tokens.elevation.e2,
      }}
    >
      {collapsed ? (
        <ButtonBase
          aria-expanded={false}
          onClick={() => layout.pin(id)}
          sx={{
            height: canvas.headerHeight,
            minHeight: tokens.touch.min,
            width: "100%",
            display: "flex",
            justifyContent: "flex-start",
            textAlign: "left",
            "&:focus-visible": { outline: `2px solid ${tokens.primary}` },
          }}
        >
          {header}
        </ButtonBase>
      ) : (
        <>
          <Box sx={{ flexShrink: 0, minHeight: canvas.headerHeight }}>
            {header}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {children}
          </Box>
          {bounds && (
            <ResizeGrip
              side={side}
              width={width}
              min={bounds.min}
              max={bounds.max}
              label="Resize panel"
              onLive={(w) => layout.setLive({ id, width: w })}
              onCommit={(w) => {
                const frac = w / layout.get().viewport.w;
                writeCardFrac(screen, id, frac);
                layout.setFrac(id, frac);
                layout.setLive(null);
              }}
            />
          )}
        </>
      )}
    </Box>
  );
}
