import type { GaugeMapState } from "@/lib/api";
import { useTokens } from "@/lib/useTokens";
import { gaugeStates } from "./gaugeStates";

const compact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** SVG donut-arc path for a slice from `start` to `end` (both fractions of the
 * whole), centered at the origin, between inner radius `r0` and outer `r`. */
function donutSegment(
  start: number,
  end: number,
  r: number,
  r0: number,
): string {
  const a0 = 2 * Math.PI * start - Math.PI / 2;
  const a1 = 2 * Math.PI * (end - 1e-6) - Math.PI / 2;
  const x0 = Math.cos(a0);
  const y0 = Math.sin(a0);
  const x1 = Math.cos(a1);
  const y1 = Math.sin(a1);
  const large = end - start > 0.5 ? 1 : 0;
  return [
    "M",
    r0 * x0,
    r0 * y0,
    "L",
    r * x0,
    r * y0,
    "A",
    r,
    r,
    0,
    large,
    1,
    r * x1,
    r * y1,
    "L",
    r0 * x1,
    r0 * y1,
    "A",
    r0,
    r0,
    0,
    large,
    0,
    r0 * x0,
    r0 * y0,
    "Z",
  ].join(" ");
}

/** A cluster rendered as a donut: one slice per state, sized by its share, with
 * the total in the center. A single-state cluster becomes a solid ring. */
export function DonutCluster({
  counts,
  total,
}: {
  counts: Record<GaugeMapState, number>;
  total: number;
}) {
  const tokens = useTokens();
  const r = total >= 1000 ? 26 : total >= 100 ? 22 : total >= 30 ? 18 : 15;
  const r0 = Math.round(r * 0.62);
  const w = r * 2;
  // Only the gauges we collect from are drawn as arcs; the untracked share is
  // left as the bare disc, so grey never dominates the map.
  let cum = 0;
  const slices = gaugeStates(tokens).flatMap((s) => {
    const start = cum / total;
    cum += counts[s.key];
    if (s.key === "available" || counts[s.key] === 0) return [];
    return [{ key: s.key, color: s.color, start, end: cum / total }];
  });

  return (
    <svg
      width={w}
      height={w}
      viewBox={`0 0 ${w} ${w}`}
      style={{ display: "block", cursor: "pointer" }}
      aria-label={`${total} gauges`}
    >
      <title>{`${total} gauges`}</title>
      <g transform={`translate(${r}, ${r})`}>
        <circle
          r={r}
          fill={tokens.surface}
          stroke={tokens.outlineVariant}
          strokeWidth={1}
        />
        {slices.map((s) =>
          s.end - s.start > 0.999 ? (
            <circle key={s.key} r={r} fill={s.color} />
          ) : (
            <path
              key={s.key}
              d={donutSegment(s.start, s.end, r, r0)}
              fill={s.color}
            />
          ),
        )}
        <circle r={r0} fill={tokens.surface} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={total >= 1000 ? 10 : 11}
          fontWeight={700}
          fill={tokens.onSurface}
        >
          {compact.format(total)}
        </text>
      </g>
    </svg>
  );
}
