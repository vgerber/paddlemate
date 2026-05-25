import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { GaugeReading, WaterRangeWithStatus } from "@/lib/api";
import { useGaugeReadings } from "@/lib/hooks/useWaterways";

export type TimeRange = "24h" | "7d" | "1m" | "3m" | "6m" | "1y";

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
	{ value: "24h", label: "24h" },
	{ value: "7d", label: "7d" },
	{ value: "1m", label: "1M" },
	{ value: "3m", label: "3M" },
	{ value: "6m", label: "6M" },
	{ value: "1y", label: "1Y" },
];

function fromForRange(range: TimeRange): string {
	const d = new Date();
	switch (range) {
		case "24h":
			d.setDate(d.getDate() - 1);
			break;
		case "7d":
			d.setDate(d.getDate() - 7);
			break;
		case "1m":
			d.setMonth(d.getMonth() - 1);
			break;
		case "3m":
			d.setMonth(d.getMonth() - 3);
			break;
		case "6m":
			d.setMonth(d.getMonth() - 6);
			break;
		case "1y":
			d.setFullYear(d.getFullYear() - 1);
			break;
	}
	// Truncate to the minute so the query key is stable within the same minute
	d.setSeconds(0, 0);
	return d.toISOString();
}

interface WaterChartProps {
	range: WaterRangeWithStatus;
	from: string;
	showThresholds?: boolean;
	timeRange: TimeRange;
}

function SeriesChart({
	range,
	from,
	showThresholds = true,
	timeRange,
}: WaterChartProps) {
	const { series, gauge } = range;

	const { data: readings, isLoading } = useGaugeReadings(
		gauge.id,
		series.id,
		from,
		1000,
	);

	const chartData = useMemo(() => {
		if (!readings) return [];
		const sorted = [...readings].reverse();

		const rawX = sorted.map((r: GaugeReading) =>
			new Date(r.measured_at).getTime(),
		);
		const rawY = sorted.map((r: GaugeReading) => r.value);

		if (rawX.length < 2)
			return rawX.map((t, i) => ({ time: t, value: rawY[i] }));

		const intervals = rawX.slice(1).map((t, i) => t - rawX[i]);
		const sorted_intervals = [...intervals].sort((a, b) => a - b);
		const median = sorted_intervals[Math.floor(sorted_intervals.length / 2)];
		const threshold = median * 5;

		const out: { time: number; value: number | null }[] = [
			{ time: rawX[0], value: rawY[0] },
		];
		for (let i = 1; i < rawX.length; i++) {
			if (intervals[i - 1] > threshold) {
				out.push({ time: rawX[i - 1] + 1, value: null });
			}
			out.push({ time: rawX[i], value: rawY[i] });
		}
		return out;
	}, [readings]);

	const { yMin, yMax, yAxisWidth } = useMemo(() => {
		const values = chartData
			.map((d) => d.value)
			.filter((v): v is number => v !== null);
		if (values.length === 0)
			return { yMin: undefined, yMax: undefined, yAxisWidth: 32 };
		const thresholds = [
			range.range_low,
			range.range_medium,
			range.range_high,
		].filter((v): v is number => v != null);
		const lo = Math.min(...values, ...thresholds);
		const hi = Math.max(...values, ...thresholds);
		const span = hi - lo || 1;
		const yMinVal = lo >= 0 ? 0 : lo - span / 3;
		const yMaxVal = hi + span / 3;
		const formatTick = (v: number) =>
			Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
		const widestLabel = [yMinVal, yMaxVal]
			.map((v) => formatTick(v))
			.reduce((a, b) => (a.length >= b.length ? a : b));
		// 7px per character at fontSize 11, plus 6px right padding
		const yAxisWidth = widestLabel.length * 7 + 6;
		return { yMin: yMinVal, yMax: yMaxVal, yAxisWidth };
	}, [chartData, range.range_low, range.range_medium, range.range_high]);

	// Defer rendering until the container has been laid out (suppresses Recharts
	// "width/height = -1" warning that fires on the initial zero-size paint).
	const containerRef = useRef<HTMLDivElement>(null);
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		if (containerRef.current) setReady(true);
	}, []);

	if (isLoading) {
		return (
			<Box
				sx={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100%",
				}}
			>
				<CircularProgress size={20} />
			</Box>
		);
	}

	if (chartData.length === 0) {
		return (
			<Box
				sx={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100%",
				}}
			>
				<Typography variant="caption" color="text.secondary">
					No readings available.
				</Typography>
			</Box>
		);
	}

	const tickStyle = { fontSize: 11, fill: "#8a9295" };

	return (
		<div ref={containerRef} style={{ width: "100%", height: "100%" }}>
			{ready && (
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart
						data={chartData}
						margin={{ top: 6, right: 12, bottom: 4, left: 0 }}
					>
						<defs>
							<linearGradient
								id={`fill-${series.id}`}
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop offset="5%" stopColor="#004b5b" stopOpacity={0.9} />
								<stop offset="95%" stopColor="#004b5b" stopOpacity={0.55} />
							</linearGradient>
						</defs>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="rgba(255,255,255,0.06)"
							vertical={false}
						/>
						<XAxis
							dataKey="time"
							type="number"
							scale="time"
							domain={["dataMin", "dataMax"]}
							tickFormatter={(ts: number) => {
								const d = new Date(ts);
								if (timeRange === "24h") {
									return d.toLocaleTimeString(undefined, {
										hour: "2-digit",
										minute: "2-digit",
									});
								}
								return d.toLocaleString(undefined, {
									month: "short",
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								});
							}}
							tick={tickStyle}
							axisLine={false}
							tickLine={false}
							minTickGap={60}
						/>
						<YAxis
							domain={[yMin ?? "auto", yMax ?? "auto"]}
							tick={tickStyle}
							axisLine={false}
							tickLine={false}
							width={yAxisWidth}
							tickCount={5}
							tickFormatter={(v: number) =>
								Math.abs(v) >= 1000
									? `${(v / 1000).toFixed(1)}k`
									: String(Math.round(v))
							}
						/>
						<Tooltip
							labelFormatter={(ts) =>
								new Date(ts as number).toLocaleString(undefined, {
									month: "short",
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								})
							}
							formatter={(value: number) => [
								`${value.toFixed(1)} ${series.unit}`,
								series.label ?? gauge.name,
							]}
							contentStyle={{
								backgroundColor: "#1e2124",
								border: "1px solid #2e3236",
								borderRadius: 6,
								fontSize: 12,
							}}
							itemStyle={{ color: "#e2e2e5" }}
							labelStyle={{ color: "#8a9295", marginBottom: 2 }}
						/>
						<Area
							type="monotone"
							dataKey="value"
							stroke="#1a8ca0"
							strokeWidth={1.5}
							fill={`url(#fill-${series.id})`}
							dot={false}
							connectNulls={false}
							isAnimationActive={false}
						/>
						{showThresholds && range.range_low != null && (
							<ReferenceLine
								y={range.range_low}
								stroke="#b0ceb8"
								strokeDasharray="4 2"
								label={{
									value: `L ${range.range_low}`,
									position: "insideTopRight",
									fontSize: 10,
									fill: "#b0ceb8",
								}}
							/>
						)}
						{showThresholds && range.range_medium != null && (
							<ReferenceLine
								y={range.range_medium}
								stroke="#c2cf47"
								strokeDasharray="4 2"
								label={{
									value: `M ${range.range_medium}`,
									position: "insideTopRight",
									fontSize: 10,
									fill: "#c2cf47",
								}}
							/>
						)}
						{showThresholds && range.range_high != null && (
							<ReferenceLine
								y={range.range_high}
								stroke="#ffb4ab"
								strokeDasharray="4 2"
								label={{
									value: `H ${range.range_high}`,
									position: "insideTopRight",
									fontSize: 10,
									fill: "#ffb4ab",
								}}
							/>
						)}
					</AreaChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}

interface WaterChartListProps {
	ranges: WaterRangeWithStatus[];
	showThresholds?: boolean;
	/** Controlled time range — when provided, the time-range toggle is hidden. */
	timeRange?: TimeRange;
	onTimeRangeChange?: (v: TimeRange) => void;
}

/**
 * Renders all water ranges with a shared time-range filter.
 * When both W (water_level) and Q (discharge) series are present a toggle
 * lets the user switch between them.  Gaps in readings are shown as breaks.
 */
export default function WaterChart({
	ranges,
	showThresholds = true,
	timeRange: controlledTimeRange,
	onTimeRangeChange,
}: WaterChartListProps) {
	const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>("7d");
	const timeRange = controlledTimeRange ?? internalTimeRange;
	const setTimeRange = onTimeRangeChange ?? setInternalTimeRange;
	const from = useMemo(() => fromForRange(timeRange), [timeRange]);

	// Derive available measurement types from the ranges
	const measurementTypes = useMemo(() => {
		const types = new Set(ranges.map((r) => r.series.measurement_type));
		return Array.from(types) as ("water_level" | "discharge" | "temperature")[];
	}, [ranges]);

	const [selectedType, setSelectedType] = useState<string | null>(null);

	// Auto-select the first calibrated type (one with non-null thresholds), or just first
	const activeType = useMemo(() => {
		if (selectedType && (measurementTypes as string[]).includes(selectedType))
			return selectedType;
		const calibrated = ranges.find(
			(r) =>
				r.range_low != null || r.range_medium != null || r.range_high != null,
		);
		return calibrated?.series.measurement_type ?? measurementTypes[0] ?? null;
	}, [selectedType, measurementTypes, ranges]);

	const visibleRanges = useMemo(
		() =>
			activeType
				? ranges.filter((r) => r.series.measurement_type === activeType)
				: ranges,
		[ranges, activeType],
	);

	const typeLabel = (t: string) =>
		t === "water_level" ? "Level" : t === "discharge" ? "Flow" : t;

	return (
		<Box
			sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%" }}
		>
			{/* Measurement-type toggle — always shown when multiple types are present.
			    Time-range toggle only shown in uncontrolled (standalone) mode. */}
			{(onTimeRangeChange == null || measurementTypes.length > 1) && (
				<Box
					sx={{
						display: "flex",
						justifyContent: "flex-end",
						alignItems: "center",
						flexShrink: 0,
						gap: 0.5,
					}}
				>
					{measurementTypes.length > 1 && (
						<>
							<ToggleButtonGroup
								value={activeType}
								exclusive
								size="small"
								onChange={(_, v) => v && setSelectedType(v)}
								sx={{
									"& .MuiToggleButton-root": {
										py: 0.25,
										px: 1,
										fontSize: "0.7rem",
									},
								}}
							>
								{measurementTypes.map((t) => (
									<ToggleButton key={t} value={t}>
										{typeLabel(t)}
									</ToggleButton>
								))}
							</ToggleButtonGroup>
							{onTimeRangeChange == null && (
								<Box
									sx={{ width: "1px", height: 20, bgcolor: "divider", mx: 0.5 }}
								/>
							)}
						</>
					)}
					{onTimeRangeChange == null && (
						<ToggleButtonGroup
							value={timeRange}
							exclusive
							size="small"
							onChange={(_, v) => v && setTimeRange(v)}
							sx={{
								"& .MuiToggleButton-root": {
									py: 0.25,
									px: 1,
									fontSize: "0.7rem",
								},
							}}
						>
							{TIME_RANGE_OPTIONS.map((o) => (
								<ToggleButton key={o.value} value={o.value}>
									{o.label}
								</ToggleButton>
							))}
						</ToggleButtonGroup>
					)}
				</Box>
			)}

			{visibleRanges.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
					No gauge data configured for this section.
				</Typography>
			) : (
				<Box
					sx={{
						flex: 1,
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
						gap: 1,
					}}
				>
					{visibleRanges.map((range) => (
						<Box
							key={range.id}
							sx={{ flex: 1, minHeight: 0, position: "relative" }}
						>
							<Box sx={{ position: "absolute", inset: 0 }}>
								<SeriesChart
									range={range}
									from={from}
									showThresholds={showThresholds}
									timeRange={timeRange}
								/>
							</Box>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
