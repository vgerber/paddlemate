import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { LineChart } from "@mui/x-charts/LineChart";
import { useMemo, useState } from "react";
import type { GaugeReading, WaterRangeWithStatus } from "@/lib/api";
import { useGaugeReadings } from "@/lib/hooks/useWaterways";

type TimeRange = "24h" | "7d" | "1m" | "3m" | "6m" | "1y";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
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
}

function SeriesChart({ range, from, showThresholds = true }: WaterChartProps) {
	const { series, gauge } = range;

	const { data: readings, isLoading } = useGaugeReadings(
		gauge.id,
		series.id,
		from,
		1000,
	);

	const { xData, yData } = useMemo(() => {
		if (!readings) return { xData: [], yData: [] };
		// Readings come newest-first; reverse for chronological order
		const sorted = [...readings].reverse();

		// Detect gaps: if a consecutive interval is > 5× the median interval,
		// insert a null so the line breaks instead of interpolating.
		const rawX = sorted.map((r: GaugeReading) => new Date(r.measured_at));
		const rawY = sorted.map((r: GaugeReading) => r.value);

		if (rawX.length < 2) return { xData: rawX, yData: rawY };

		const intervals = rawX
			.slice(1)
			.map((t, i) => t.getTime() - rawX[i].getTime());
		const sorted_intervals = [...intervals].sort((a, b) => a - b);
		const median = sorted_intervals[Math.floor(sorted_intervals.length / 2)];
		const threshold = median * 5;

		const xOut: Date[] = [rawX[0]];
		const yOut: (number | null)[] = [rawY[0]];
		for (let i = 1; i < rawX.length; i++) {
			if (intervals[i - 1] > threshold) {
				// Insert a null just after the previous point to create a gap
				xOut.push(new Date(rawX[i - 1].getTime() + 1));
				yOut.push(null);
			}
			xOut.push(rawX[i]);
			yOut.push(rawY[i]);
		}

		return { xData: xOut, yData: yOut };
	}, [readings]);

	// Y axis: include calibrated thresholds in the extent when present, then add 1/3 padding
	const { yMin, yMax } = useMemo(() => {
		const values = yData.filter((v) => v !== null) as number[];
		if (values.length === 0) return { yMin: undefined, yMax: undefined };
		const thresholds = [
			range.range_low,
			range.range_medium,
			range.range_high,
		].filter((v): v is number => v != null);
		const lo = Math.min(...values, ...thresholds);
		const hi = Math.max(...values, ...thresholds);
		const span = hi - lo || 1;
		return { yMin: lo - span / 3, yMax: hi + span / 3 };
	}, [yData, range.range_low, range.range_medium, range.range_high]);

	const unit = series.unit ?? "";
	const label = series.label ?? gauge.name;

	if (isLoading) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
				<CircularProgress size={20} />
			</Box>
		);
	}

	if (xData.length === 0) {
		return (
			<Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
				No readings available.
			</Typography>
		);
	}

	return (
		<Box>
			<Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
				{label} ({unit}) — {gauge.name}
			</Typography>
			<LineChart
				xAxis={[
					{
						data: xData,
						scaleType: "time",
						valueFormatter: (v: Date) =>
							v.toLocaleString(undefined, {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							}),
					},
				]}
				yAxis={[{ label: unit, min: yMin, max: yMax }]}
				series={[
					{
						data: yData,
						showMark: false,
						color: "#004b5b",
						area: true,
						connectNulls: false,
					},
				]}
				height={220}
				margin={{ top: 10, right: 16, bottom: 40, left: 56 }}
			>
				{showThresholds && (
					<>
						{range.range_low != null && (
							<ChartsReferenceLine
								y={range.range_low}
								label={`L  ${range.range_low}`}
								labelAlign="end"
								lineStyle={{ stroke: "#b0ceb8", strokeDasharray: "4 2" }}
								labelStyle={{ fill: "#b0ceb8", fontSize: 10 }}
							/>
						)}
						{range.range_medium != null && (
							<ChartsReferenceLine
								y={range.range_medium}
								label={`M  ${range.range_medium}`}
								labelAlign="end"
								lineStyle={{ stroke: "#c2cf47", strokeDasharray: "4 2" }}
								labelStyle={{ fill: "#c2cf47", fontSize: 10 }}
							/>
						)}
						{range.range_high != null && (
							<ChartsReferenceLine
								y={range.range_high}
								label={`H  ${range.range_high}`}
								labelAlign="end"
								lineStyle={{ stroke: "#ffb4ab", strokeDasharray: "4 2" }}
								labelStyle={{ fill: "#ffb4ab", fontSize: 10 }}
							/>
						)}
					</>
				)}
			</LineChart>
		</Box>
	);
}

interface WaterChartListProps {
	ranges: WaterRangeWithStatus[];
	showThresholds?: boolean;
}

/**
 * Renders all water ranges with a shared time-range filter.
 * When both W (water_level) and Q (discharge) series are present a toggle
 * lets the user switch between them.  Gaps in readings are shown as breaks.
 */
export default function WaterChart({
	ranges,
	showThresholds = true,
}: WaterChartListProps) {
	const [timeRange, setTimeRange] = useState<TimeRange>("7d");
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
			{/* Controls row — measurement type + time range in one line */}
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
						<Box
							sx={{ width: "1px", height: 20, bgcolor: "divider", mx: 0.5 }}
						/>
					</>
				)}
				<ToggleButtonGroup
					value={timeRange}
					exclusive
					size="small"
					onChange={(_, v) => v && setTimeRange(v)}
					sx={{
						"& .MuiToggleButton-root": { py: 0.25, px: 1, fontSize: "0.7rem" },
					}}
				>
					{TIME_RANGE_OPTIONS.map((o) => (
						<ToggleButton key={o.value} value={o.value}>
							{o.label}
						</ToggleButton>
					))}
				</ToggleButtonGroup>
			</Box>

			{visibleRanges.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
					No gauge data configured for this section.
				</Typography>
			) : (
				<Box
					sx={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						gap: 1,
					}}
				>
					{visibleRanges.map((range) => (
						<SeriesChart
							key={range.id}
							range={range}
							from={from}
							showThresholds={showThresholds}
						/>
					))}
				</Box>
			)}
		</Box>
	);
}
