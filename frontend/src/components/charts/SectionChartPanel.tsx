import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import WaterChart from "@/components/charts/WaterChart";
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

	return (
		<Box
			sx={{
				borderTop: "1px solid",
				borderColor: "divider",
				height: 340,
				display: "flex",
				flexDirection: "column",
				flexShrink: 0,
				p: 1.5,
				pb: 0.5,
			}}
		>
			<Typography
				variant="subtitle2"
				sx={{ mb: 1, fontWeight: 600, flexShrink: 0 }}
			>
				{sectionName ?? "Section"} — Water levels
			</Typography>
			<Divider sx={{ mb: 1, flexShrink: 0 }} />
			{isLoading ? (
				<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
					<CircularProgress size={22} />
				</Box>
			) : (
				<Box sx={{ flex: 1, minHeight: 0 }}>
					<WaterChart ranges={waterStatus?.ranges ?? []} />
				</Box>
			)}
		</Box>
	);
}
