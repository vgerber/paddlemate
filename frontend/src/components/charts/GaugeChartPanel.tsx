import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import WaterChart from "@/components/charts/water/WaterChart";
import {
	TIME_RANGE_OPTIONS,
	typeLabel,
	type TimeRange,
} from "@/components/charts/water/types";
import type { WaterRangeWithStatus } from "@/lib/api";

interface GaugeChartPanelProps {
	ranges: WaterRangeWithStatus[];
	onClose: () => void;
}

export default function GaugeChartPanel({
	ranges,
	onClose,
}: GaugeChartPanelProps) {
	const gauge = ranges[0]?.gauge;
	const [timeRange, setTimeRange] = useState<TimeRange>("7d");
	const [measurementType, setMeasurementType] = useState<string | null>(null);

	const measurementTypes = useMemo(() => {
		const types = new Set(ranges.map((r) => r.series.measurement_type));
		return Array.from(types) as ("water_level" | "discharge" | "temperature")[];
	}, [ranges]);

	const subtitle = useMemo(() => {
		const r = ranges[0];
		if (!r) return null;
		const lbl = r.series.label ?? r.gauge.name;
		return `${lbl} (${r.series.unit})`;
	}, [ranges]);

	return (
		<Box
			sx={{
				borderTop: "1px solid",
				borderColor: "divider",
				height: 260,
				display: "flex",
				flexDirection: "column",
				flexShrink: 0,
				p: 1.5,
				pb: 0.5,
			}}
		>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					mb: 1,
					flexShrink: 0,
					gap: 1,
				}}
			>
				<Typography
					variant="subtitle2"
					sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}
					noWrap
				>
					{gauge?.name ?? "Gauge"}
					{subtitle && (
						<Box
							component="span"
							sx={{ fontWeight: 400, color: "text.secondary" }}
						>
							{" — "}
							{subtitle}
						</Box>
					)}
				</Typography>
				{measurementTypes.length > 1 && (
					<ToggleButtonGroup
						value={measurementType}
						exclusive
						size="small"
						onChange={(_, v) => v && setMeasurementType(v)}
						sx={{
							flexShrink: 0,
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
				)}
				<ToggleButtonGroup
					value={timeRange}
					exclusive
					size="small"
					onChange={(_, v) => v && setTimeRange(v)}
					sx={{
						flexShrink: 0,
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
				<IconButton
					size="small"
					onClick={onClose}
					aria-label="Close gauge chart"
					sx={{ flexShrink: 0 }}
				>
					<CloseIcon fontSize="small" />
				</IconButton>
			</Box>
			<Divider sx={{ mb: 1, flexShrink: 0 }} />
			<Box sx={{ flex: 1, minHeight: 0 }}>
				<WaterChart
					ranges={ranges}
					showThresholds={false}
					timeRange={timeRange}
					onTimeRangeChange={setTimeRange}
					measurementType={measurementType}
					onMeasurementTypeChange={setMeasurementType}
				/>
			</Box>
		</Box>
	);
}
