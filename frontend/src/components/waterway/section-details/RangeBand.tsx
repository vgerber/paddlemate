import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { withAlpha } from "@/lib/alpha";
import { css, durations, useReducedMotion } from "@/lib/motion";
import { theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";
import {
  FeatureListRow,
  kmSx,
  PendingDeleteMarker,
  type RowContext,
} from "./FeatureListRow";
import { Fold, selectionFade } from "./Fold";
import {
  DISC,
  RAIL_COL,
  RailLine,
  RangeTile,
  ROW_MIN,
  TrailSlot,
} from "./railParts";
import { isBand, memberNames } from "./rows";
import type { TreeNode } from "./types";
import { featureName, featureTypeLabel, fmtKmSpan } from "./utils";

const { tokens } = theme;

interface NodeProps {
  node: TreeNode;
  ctx: RowContext;
  /** Nothing follows this node in the whole list. */
  endsList: boolean;
  /** First row of the whole list. */
  startsList: boolean;
  dashed: boolean;
  /** Inside another band: its rows share that band's inset. */
  inBand?: boolean;
}

/** A node of the tree: a band when it is a range with members, else a row. */
export function FeatureNode({
  node,
  ctx,
  endsList,
  startsList,
  dashed,
  inBand,
}: NodeProps) {
  if (isBand(node)) {
    return (
      <RangeBand
        node={node}
        ctx={ctx}
        endsList={endsList}
        startsList={startsList}
        dashed={dashed}
        inBand={inBand}
      />
    );
  }
  return (
    <FeatureListRow
      inBand={inBand}
      item={node.item}
      ctx={ctx}
      rail={{ top: !startsList, bottom: !endsList, dashed }}
    />
  );
}

/** A range as a soft band. The whole head row folds and opens it; folded, it
 * names what it hides. A portage keeps a dashed rail. */
function RangeBand({
  node,
  ctx,
  endsList,
  startsList,
  dashed,
  inBand,
}: NodeProps) {
  const { item } = node;
  const [open, setOpen] = useState(true);
  const reduced = useReducedMotion();
  const type = item.feature.feature_type;
  const isPortage = type === "portage";
  const isActive = ctx.activeId === item.feature.id;
  const railDashed = dashed || isPortage;

  const subtitle = [
    featureTypeLabel(item.feature),
    open ? null : memberNames(node).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box
      data-reduced-fade
      data-band={isPortage ? "portage" : "range"}
      sx={{
        bgcolor: isActive
          ? withAlpha(tokens.primary, "wash")
          : tokens.surfaceHigh,
        outline: isActive ? `2px solid ${tokens.primary}` : "none",
        outlineOffset: -2,
        borderRadius: `${tokens.radii.row}px`,
        transition: selectionFade(["background-color"]),
        mx: { xs: inBand ? 0 : 1, md: 1 },
        my: 0.25,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "stretch" }}>
        <ButtonBase
          component="div"
          disableRipple
          data-row
          data-type={type}
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            ctx.onItemClick?.(item);
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "stretch",
            textAlign: "left",
            minHeight: ROW_MIN,
            gap: 1,
            // On a phone the band sits 8 in from the card edge, so 4 and 8 put its
            // rail and value on the same lines as a plain row's 12 and 16.
            pl: { xs: 0.5, md: 0 },
            pr: { xs: 1, md: 1.5 },
          }}
        >
          <Box
            sx={{
              position: "relative",
              width: RAIL_COL,
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              pt: `${(ROW_MIN - DISC - 4) / 2}px`,
            }}
          >
            <RailLine
              top={!startsList}
              bottom={open || !endsList}
              dashed={railDashed}
            />
            <RangeTile
              type={type}
              open={open}
              foldable
              n={ctx.numbers?.get(item.feature.id)}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{ minHeight: ROW_MIN, display: "flex", alignItems: "center" }}
            >
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    <Typography
                      component="span"
                      sx={{ fontWeight: 600, fontSize: "0.9375rem" }}
                    >
                      {featureName(item.feature)}
                    </Typography>
                    {ctx.pendingDeleteIds?.has(item.feature.id) && (
                      <PendingDeleteMarker />
                    )}
                  </Box>
                  <Typography component="span" data-km sx={kmSx}>
                    {fmtKmSpan(item.startM, item.endM)}
                  </Typography>
                </Box>
                {subtitle && (
                  <Typography
                    noWrap
                    sx={{
                      fontSize: "0.8125rem",
                      color: tokens.onSurfaceVariant,
                    }}
                  >
                    {subtitle}
                  </Typography>
                )}
              </Box>
              <TrailSlot open={open} />
            </Box>
            <Collapse
              in={isActive}
              timeout={reduced ? 0 : durations.base}
              easing={css.easeInOut}
              unmountOnExit
            >
              <CoordsInfo
                coords={item.coords}
                onHistory={
                  ctx.onHistoryItem && (() => ctx.onHistoryItem?.(item))
                }
                onEdit={ctx.onEditItem && (() => ctx.onEditItem?.(item))}
                onDelete={ctx.onDeleteItem && (() => ctx.onDeleteItem?.(item))}
              />
            </Collapse>
          </Box>
        </ButtonBase>
      </Box>

      <Fold open={open}>
        <Box sx={{ pl: { xs: 0, md: 3 } }}>
          {node.nested.map((child, i) => (
            <FeatureNode
              key={child.item.feature.id}
              node={child}
              ctx={ctx}
              startsList={false}
              endsList={endsList && i === node.nested.length - 1}
              dashed={railDashed}
              inBand
            />
          ))}
        </Box>
      </Fold>
    </Box>
  );
}
