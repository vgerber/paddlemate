import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import SectionListItem from "@/components/waterway/SectionListItem";
import type { WaterRangeWithStatus } from "@/lib/api";
import { useWaterway } from "@/lib/hooks/useWaterways";

export type DetailTab = "sections" | "gauges";

interface WaterwayDetailPanelProps {
	waterwayId: number;
	selectedSectionId: number | undefined;
	selectedGaugeId?: number | null;
	gaugeRanges?: WaterRangeWithStatus[];
	tab: DetailTab;
	onTabChange: (tab: DetailTab) => void;
	onBack: () => void;
	onSectionClick: (sectionId: number) => void;
	onGaugeSelect?: (gaugeId: number) => void;
}

export default function WaterwayDetailPanel({
	waterwayId,
	selectedSectionId,
	selectedGaugeId,
	gaugeRanges = [],
	tab,
	onTabChange,
	onBack,
	onSectionClick,
	onGaugeSelect,
}: WaterwayDetailPanelProps) {
	const { data: waterway, isLoading } = useWaterway(waterwayId);
	const sections = waterway?.sections ?? [];

	return (
		<>
			<Box
				sx={{
					px: 1.5,
					pt: 1.5,
					pb: 1,
					borderBottom: "1px solid",
					borderColor: "divider",
					flexShrink: 0,
				}}
			>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
					<IconButton size="small" onClick={onBack} aria-label="Back to rivers">
						<ArrowBackIcon fontSize="small" />
					</IconButton>
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
							{waterway?.name ?? "…"}
						</Typography>
						{waterway && (
							<Typography variant="caption" color="text.secondary">
								{waterway.waterway_type}
							</Typography>
						)}
					</Box>
				</Box>
				<ToggleButtonGroup
					value={tab}
					exclusive
					onChange={(_, v) => v && onTabChange(v)}
					size="small"
					sx={{
						width: "100%",
						"& .MuiToggleButton-root": {
							flex: 1,
							py: 0.5,
							fontSize: "0.75rem",
						},
					}}
				>
					<ToggleButton value="sections">Sections</ToggleButton>
					<ToggleButton value="gauges">Gauges</ToggleButton>
				</ToggleButtonGroup>
			</Box>

			<Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>
				{isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress size={22} />
					</Box>
				) : tab === "sections" ? (
					sections.length === 0 ? (
						<Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
							No sections found.
						</Typography>
					) : (
						<List dense disablePadding>
							{sections.map((section) => (
								<SectionListItem
									key={section.id}
									section={section}
									waterwayId={waterwayId}
									selected={section.id === selectedSectionId}
									onClick={onSectionClick}
								/>
							))}
						</List>
					)
				) : gaugeRanges.length === 0 ? (
					<Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
						No gauges found.
					</Typography>
				) : (
					<List dense disablePadding>
						{gaugeRanges.map((range) => (
							<ListItemButton
								key={range.gauge.id}
								selected={selectedGaugeId === range.gauge.id}
								onClick={() => onGaugeSelect?.(range.gauge.id)}
								sx={{ py: 0.75, px: 1.5, borderRadius: 1 }}
							>
								<ListItemText
									primary={(range.series.label ?? range.gauge.name).replace(
										/\s*\([WQ]\)\s*$/,
										"",
									)}
									secondary={range.gauge.name}
									slotProps={{
										primary: { variant: "body2" },
										secondary: { variant: "caption" },
									}}
								/>
								{range.latest_reading != null && (
									<Typography
										variant="caption"
										color="text.secondary"
										sx={{ mr: 1, whiteSpace: "nowrap" }}
									>
										{range.latest_reading.value.toFixed(1)}&thinsp;
										{range.series.unit}
									</Typography>
								)}
							</ListItemButton>
						))}
					</List>
				)}
			</Box>
		</>
	);
}
