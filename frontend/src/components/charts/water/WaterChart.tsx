import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import type { WaterRangeWithStatus } from "@/lib/api";
import SeriesChart from "./SeriesChart";
import {
	TIME_RANGE_OPTIONS,
	fromForRange,
	typeLabel,
	type TimeRange,
} from "./types";

export interface WaterChartProps {
	ranges: WaterRangeWithStatus[];
	showThresholds?: boolean;
	/** Controlled time range - when provided the time-range toggle is hidden. */
	timeRange?: TimeRange;
	onTimeRangeChange?: (v: TimeRange) => void;
	/** Controlled measurement type - when provided the type toggle is hidden. */
	measurementType?: string | null;
	onMeasurementTypeChange?: (v: string) => void;
}

export default function WaterChart({
	ranges,
	showThresholds = true,
	timeRange: controlledTimeRange,
	onTimeRangeChange,
	measurementType: controlledMeasurementType,
	onMeasurementTypeChange,
}: WaterChartProps) {
	const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>("7d");
	const timeRange = controlledTimeRange ?? internalTimeRange;
	const setTimeRange = onTimeRangeChange ?? setInternalTimeRange;
	const from = useMemo(() => fromForRange(timeRange), [timeRange]);

	const measurementTypes = useMemo(() => {
		const types = new Set(ranges.map((r) => r.series.measurement_type));
		return Array.from(types) as ("water_level" | "discharge" | "temperature")[];
	}, [ranges]);

	const [selectedType, setSelectedType] = useState<string | null>(null);

	// Prefer controlled value, then internal selection, then auto-select the
	// first calibrated type (one with threshold values), then the first type.
	const activeType = useMemo(() => {
		if (
			controlledMeasurementType != null &&
			(measurementTypes as string[]).includes(controlledMeasurementType)
		)
			return controlledMeasurementType;
		if (selectedType && (measurementTypes as string[]).includes(selectedType))
			return selectedType;
		const calibrated = ranges.find(
			(r) =>
				r.range_low != null || r.range_medium != null || r.range_high != null,
		);
		return calibrated?.series.measurement_type ?? measurementTypes[0] ?? null;
	}, [controlledMeasurementType, selectedType, measurementTypes, ranges]);

	const handleTypeChange = onMeasurementTypeChange ?? setSelectedType;

	const visibleRanges = useMemo(
		() =>
			activeType
				? ranges.filter((r) => r.series.measurement_type === activeType)
				: ranges,
		[ranges, activeType],
	);

	const showInternalControls =
		onTimeRangeChange == null ||
		(onMeasurementTypeChange == null && measurementTypes.length > 1);

	return (
		<Box
			sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%" }}
		>
			{showInternalControls && (
				<Box
					sx={{
						display: "flex",
						justifyContent: "flex-end",
						alignItems: "center",
						flexShrink: 0,
						gap: 0.5,
					}}
				>
					{onMeasurementTypeChange == null && measurementTypes.length > 1 && (
						<>
							<ToggleButtonGroup
								value={activeType}
								exclusive
								size="small"
								onChange={(_, v) => v && handleTypeChange(v)}
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
