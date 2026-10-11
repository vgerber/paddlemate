import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import { durations } from "@/lib/motion";
import { alphas, theme } from "@/lib/theme";
import {
  FeatureListRow,
  kmSx,
  PendingDeleteMarker,
  type RowContext,
} from "./FeatureListRow";
import { RAIL_COL, RailLine, RangeTile, ROW_MIN } from "./railParts";
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
}

/** A node of the tree: a band when it is a range with members, else a row. */
export function FeatureNode({
  node,
  ctx,
  endsList,
  startsList,
  dashed,
}: NodeProps) {
  if (isBand(node)) {
    return (
      <RangeBand
        node={node}
        ctx={ctx}
        endsList={endsList}
        startsList={startsList}
        dashed={dashed}
      />
    );
  }
  return (
    <FeatureListRow
      item={node.item}
      ctx={ctx}
      rail={{ top: !startsList, bottom: !endsList, dashed }}
    />
  );
}

/** A range as a soft band. The whole head row folds and opens it; folded, it
 * names what it hides. A portage keeps a dashed rail. */
function RangeBand({ node, ctx, endsList, startsList, dashed }: NodeProps) {
  const { item } = node;
  const [open, setOpen] = useState(true);
  const type = item.feature.feature_type;
  const isPortage = type === "portage";
  const isActive = ctx.activeId === item.feature.id;
  const railDashed = dashed || isPortage;

  const actions: RowAction[] = [];
  if (ctx.onItemClick) {
    actions.push({
      label: "Show on map",
      icon: <PlaceOutlinedIcon fontSize="small" />,
      onClick: () => ctx.onItemClick?.(item),
    });
  }
  if (ctx.onEditItem) {
    actions.push({
      label: "Edit feature",
      icon: <EditOutlinedIcon fontSize="small" />,
      onClick: () => ctx.onEditItem?.(item),
    });
  }
  if (ctx.onDeleteItem) {
    actions.push({
      label: "Delete feature",
      icon: <DeleteOutlinedIcon fontSize="small" />,
      danger: true,
      onClick: () => ctx.onDeleteItem?.(item),
    });
  }

  const subtitle = [
    featureTypeLabel(item.feature),
    open ? null : memberNames(node).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box
      data-band={isPortage ? "portage" : "range"}
      sx={{
        bgcolor: isActive
          ? `${tokens.primary}${alphas.wash}`
          : tokens.surfaceHigh,
        borderRadius: `${tokens.radii.sm}px`,
        my: 0.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "stretch" }}>
        <ButtonBase
          component="div"
          disableRipple
          data-row
          data-type={type}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "stretch",
            textAlign: "left",
            minHeight: ROW_MIN,
            gap: 1,
            pr: actions.length ? 0 : 1.5,
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
              pt: `${(ROW_MIN - 36) / 2}px`,
            }}
          >
            <RailLine
              top={!startsList}
              bottom={open || !endsList}
              dashed={railDashed}
            />
            <RangeTile type={type} open={open} foldable />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, py: 0.75 }}>
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
                sx={{ fontSize: "0.8125rem", color: tokens.onSurfaceVariant }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </ButtonBase>
        {actions.length > 0 && <RowMenu actions={actions} />}
      </Box>

      <Collapse in={open} timeout={durations.base} unmountOnExit>
        {node.nested.map((child, i) => (
          <FeatureNode
            key={child.item.feature.id}
            node={child}
            ctx={ctx}
            startsList={false}
            endsList={endsList && i === node.nested.length - 1}
            dashed={railDashed}
          />
        ))}
      </Collapse>
    </Box>
  );
}
