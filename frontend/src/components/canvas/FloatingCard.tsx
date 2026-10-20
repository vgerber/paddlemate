import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { type ReactNode, useLayoutEffect } from "react";
import PanelHeader from "@/components/PanelHeader";
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
  /** Names the card; all that shows once the card is folded. */
  title: string;
  subtitle?: string;
  /** The screen's actions in the title row, right of the title. */
  actions?: ReactNode;
  /** Adds a close button to the title row. */
  onClose?: () => void;
  /** The content brings its own panel header (title, tabs, back arrow), so
   * the card draws no title row of its own while open and the screen never
   * shows two. The folded card still shows `title`. */
  selfHeaded?: boolean;
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
  title,
  subtitle,
  actions,
  onClose,
  selfHeaded = false,
  children,
  screen = "default",
  resizable = kind === "detail",
  fullHeight = false,
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
      aria-label={title}
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
        pointerEvents: "auto",
        bgcolor: tokens.surfaceLowest,
        borderRadius: `${tokens.radii.lg}px`,
        boxShadow: tokens.elevation.e2,
      }}
    >
      {/* Clips the content to the corners; the resize tab sits outside it,
          on the card's edge. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "inherit",
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
            <PanelHeader title={title} subtitle={subtitle} />
          </ButtonBase>
        ) : (
          <>
            {!selfHeaded && (
              <Box sx={{ flexShrink: 0, minHeight: canvas.headerHeight }}>
                <PanelHeader
                  title={title}
                  subtitle={subtitle}
                  actionButton={actions}
                  onBack={onClose}
                  backIcon="close"
                />
              </Box>
            )}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {children}
            </Box>
          </>
        )}
      </Box>
      {!collapsed && bounds && (
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
    </Box>
  );
}
