import Box from "@mui/material/Box";
import { useEffect, useRef, useState } from "react";
import FeatureTypeIcon from "@/components/FeatureTypeIcon";
import { fonts, theme } from "@/lib/theme";
import {
  DEFAULT_STRIP,
  layoutStrip,
  type StripPoint,
  stripX,
} from "./stripLayout";
import type { ComputedFeature } from "./types";

const { tokens } = theme;

const R = DEFAULT_STRIP.disc / 2;
const ICON = 16;
const STEP = 22;
const FIRST_WIDTH = 280;

/** Width of an element, followed as it resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FIRST_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.clientWidth) || FIRST_WIDTH);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Icon({
  type,
  x,
  y,
  color,
}: {
  type: ComputedFeature["feature"]["feature_type"];
  x: number;
  y: number;
  color: string;
}) {
  return (
    <g
      transform={`translate(${x - ICON / 2} ${y - ICON / 2})`}
      style={{ color }}
    >
      <FeatureTypeIcon type={type} size={ICON} />
    </g>
  );
}

/** The run to scale: ranges on the line (a portage
 * as a dashed path), each feature as its icon in a small white disc, close
 * neighbours stepped below and crowds merged into one group disc. It never
 * folds; the list under it does. */
export function FeatureStrip({
  features,
  totalM,
}: {
  features: ComputedFeature[];
  totalM: number;
}) {
  const { ref, width } = useWidth();
  const ranges = features.filter((f) => f.isZone);
  const points: StripPoint[] = features
    .filter((f) => !f.isZone)
    .map((f) => ({
      id: f.feature.id,
      type: f.feature.feature_type,
      distM: f.distM,
    }));
  const { discs, groups } = layoutStrip(points, totalM, width);

  const lineY = 18;
  const hasStep = discs.some((d) => d.level === 1);
  const axisY = lineY + (hasStep ? 50 : 32);
  const height = axisY + 4;
  const x = (m: number) => stripX(m, totalM, width);
  const km = (m: number) => (m / 1000).toFixed(1);
  const left = x(0);
  const right = x(totalM);

  return (
    <Box ref={ref} data-testid="features-strip" sx={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
        style={{ display: "block" }}
      >
        <line
          x1={left}
          x2={right}
          y1={lineY}
          y2={lineY}
          stroke={tokens.outlineVariant}
          strokeWidth={2}
        />
        {ranges.map((r) =>
          r.feature.feature_type === "portage" ? (
            <path
              key={r.feature.id}
              data-range
              data-type="portage"
              d={`M${x(r.startM)} ${lineY} V${lineY - 14} H${x(r.endM)} V${lineY}`}
              fill="none"
              stroke={tokens.primary}
              strokeWidth={2}
              strokeDasharray="3 3"
            />
          ) : (
            <line
              key={r.feature.id}
              data-range
              data-type={r.feature.feature_type}
              x1={x(r.startM)}
              x2={x(r.endM)}
              y1={lineY}
              y2={lineY}
              stroke={tokens.primary}
              strokeWidth={5}
              strokeLinecap="round"
            />
          ),
        )}
        {discs.map((d) => {
          const cy = lineY + d.level * STEP;
          const filled = d.type === "take_out";
          return (
            <g key={d.id}>
              {d.level === 1 && (
                <line
                  x1={d.x}
                  x2={d.x}
                  y1={lineY}
                  y2={cy - R}
                  stroke={tokens.primary}
                  strokeWidth={1.5}
                />
              )}
              <circle
                data-disc
                data-type={d.type}
                cx={d.x}
                cy={cy}
                r={R}
                fill={filled ? tokens.primary : tokens.surface}
                stroke={tokens.primary}
                strokeWidth={1.5}
              />
              <Icon
                type={d.type}
                x={d.x}
                y={cy}
                color={filled ? tokens.onPrimary : tokens.onSurface}
              />
            </g>
          );
        })}
        {groups.map((g) => (
          <g key={g.ids.join("-")} data-group data-count={g.count}>
            <circle
              cx={g.x}
              cy={lineY}
              r={R}
              fill={tokens.surface}
              stroke={tokens.primary}
              strokeWidth={1.5}
            />
            {g.hazard ? (
              <>
                <Icon
                  type={g.hazard}
                  x={g.x}
                  y={lineY}
                  color={tokens.onSurface}
                />
                <circle
                  cx={g.x + R - 1}
                  cy={lineY - R + 1}
                  r={7}
                  fill={tokens.primary}
                />
                <text
                  x={g.x + R - 1}
                  y={lineY - R + 4.5}
                  textAnchor="middle"
                  fontFamily={fonts.body}
                  fontSize={10}
                  fontWeight={700}
                  fill={tokens.onPrimary}
                >
                  {g.count}
                </text>
              </>
            ) : (
              <text
                x={g.x}
                y={lineY + 4}
                textAnchor="middle"
                fontFamily={fonts.body}
                fontSize={12}
                fontWeight={700}
                fill={tokens.onSurface}
              >
                {g.count}
              </text>
            )}
          </g>
        ))}
        <g
          fontFamily={fonts.body}
          fontSize={11}
          fill={tokens.onSurfaceVariant}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <text x={left} y={axisY}>
            0
          </text>
          <text x={(left + right) / 2} y={axisY} textAnchor="middle">
            {km(totalM / 2)}
          </text>
          <text x={right} y={axisY} textAnchor="end">
            {km(totalM)} km
          </text>
        </g>
      </svg>
    </Box>
  );
}
