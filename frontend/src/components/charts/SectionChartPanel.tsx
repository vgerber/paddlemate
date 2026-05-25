import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import WaterChart, {
	TIME_RANGE_OPTIONS,
	type TimeRange,
} from "@/components/charts/WaterChart";
import { useWaterStatus } from "@/lib/hooks/useWaterways";

interface SectionChartPanelProps {
	waterwayId: number;
	sectionId: number;
	sectionName?: string;
}

export default function SectionChartPanel({
	waterwayId,
	sectionId,
	sectionName,
}: SectionChartPanelProps) {
	const { data: waterStatus, isLoading } = useWaterStatus(
		waterwayId,
		sectionId,
	);
	const [timeRange, setTimeRange] = useState<TimeRange>("7d");

	const subtitle = useMemo(() => {
		const r = waterStatus?.ranges[0];
		if (!r) return null;
		return `${r.gauge.name} (${r.series.unit})`;
	}, [waterStatus]);

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
					{sectionName ?? "Section"}
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
			</Box>
			<Divider sx={{ mb: 1, flexShrink: 0 }} />
			{isLoading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
					<CircularProgress size={22} />
				</Box>
			) : (
				<Box sx={{ flex: 1, minHeight: 0 }}>
					<WaterChart
						ranges={waterStatus?.ranges ?? []}
						timeRange={timeRange}
						onTimeRangeChange={setTimeRange}
					/>
				</Box>
			)}
		</Box>
	);
}
