import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import SectionListItem from "@/components/waterway/SectionListItem";
import SuggestFeatureForm from "@/components/waterway/SuggestFeatureForm";
import SuggestSectionForm from "@/components/waterway/SuggestSectionForm";
import FeatureTimeline from "@/components/waterway/section-details";
import type { SectionWithFeatures, WaterRangeWithStatus } from "@/lib/api";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway } from "@/lib/hooks/useWaterways";

export type DetailTab = "sections" | "gauges";
export type SuggestMode = "section" | "feature";

interface WaterwayDetailPanelProps {
	waterwayId: number;
	selectedSectionId: number | undefined;
	selectedGaugeId?: number | null;
	gaugeRanges?: WaterRangeWithStatus[];
	tab: DetailTab;
	onTabChange: (tab: DetailTab) => void;
	onBack: () => void;
	onSectionClick: (sectionId: number) => void;
	onSectionDeselect: () => void;
	onGaugeSelect?: (gaugeId: number) => void;
	suggestMode: SuggestMode | null;
	onSuggestModeChange: (mode: SuggestMode | null) => void;
	// Section draft (put-in / take-out picking)
	sectionPutIn?: { lat: number; lon: number } | null;
	sectionTakeOut?: { lat: number; lon: number } | null;
	sectionPickingFor?: "put-in" | "take-out" | null;
	onStartPickPutIn?: () => void;
	onStartPickTakeOut?: () => void;
	onSectionDraftClear?: () => void;
	onPreviewCoordsChange?: (coords: [number, number][] | null) => void;
	// Feature draft (geometry picking)
	featureVertices?: { lng: number; lat: number }[];
	featureGeomType?: "Point" | "LineString" | "Polygon";
	featurePickingActive?: boolean;
	onStartPickFeature?: () => void;
	onStopPickFeature?: () => void;
	onPopFeatureVertex?: () => void;
	onRemoveFeatureVertex?: (i: number) => void;
	onFeatureGeomTypeChange?: (t: "Point" | "LineString" | "Polygon") => void;
	onFeatureDraftClear?: () => void;
	onFeatureClick?: (coords: [number, number] | null) => void;
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
	onSectionDeselect,
	onGaugeSelect,
	suggestMode,
	onSuggestModeChange,
	sectionPutIn,
	sectionTakeOut,
	sectionPickingFor,
	onStartPickPutIn,
	onStartPickTakeOut,
	onSectionDraftClear,
	onPreviewCoordsChange,
	featureVertices,
	featureGeomType,
	featurePickingActive,
	onStartPickFeature,
	onStopPickFeature,
	onRemoveFeatureVertex,
	onFeatureGeomTypeChange,
	onFeatureDraftClear,
	onFeatureClick,
}: WaterwayDetailPanelProps) {
	const { data: waterway, isLoading } = useWaterway(waterwayId);
	const { isAuthenticated } = useSession();
	const sections: SectionWithFeatures[] = waterway?.sections ?? [];

	const [showFeatures, setShowFeatures] = useState(false);
	useEffect(() => {
		setShowFeatures(selectedSectionId != null);
	}, [selectedSectionId]);

	const selectedSection = sections.find((s) => s.id === selectedSectionId);
	const inFeatures = showFeatures && selectedSection != null;

	function exitSuggest() {
		onSuggestModeChange(null);
		onSectionDraftClear?.();
		onFeatureDraftClear?.();
		onStopPickFeature?.();
	}

	return (
		<>
			{/* ── Header ── */}
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
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						mb: suggestMode || inFeatures ? 0 : 0.75,
					}}
				>
					<IconButton
						size="small"
						onClick={
							suggestMode
								? exitSuggest
								: inFeatures
									? () => {
											setShowFeatures(false);
											onSectionDeselect();
										}
									: onBack
						}
						aria-label={
							suggestMode
								? "Cancel"
								: inFeatures
									? "Back to sections"
									: "Back to rivers"
						}
					>
						<ArrowBackIcon fontSize="small" />
					</IconButton>

					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
							{inFeatures ? selectedSection.name : (waterway?.name ?? "…")}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{suggestMode === "section"
								? "Suggest new section"
								: suggestMode === "feature"
									? "Suggest new feature"
									: inFeatures
										? (waterway?.name ?? "")
										: (waterway?.waterway_type ?? "")}
						</Typography>
					</Box>
				</Box>

				{!suggestMode && !inFeatures && (
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
				)}
			</Box>

			{/* ── Body ── */}
			{suggestMode === "section" ? (
				<Box sx={{ flex: 1, overflowY: "auto" }}>
					<SuggestSectionForm
						waterwayId={waterwayId}
						waterwayName={waterway?.name ?? ""}
						sections={sections}
						putIn={sectionPutIn ?? null}
						takeOut={sectionTakeOut ?? null}
						pickingFor={sectionPickingFor ?? null}
						onRequestPickPutIn={() => onStartPickPutIn?.()}
						onRequestPickTakeOut={() => onStartPickTakeOut?.()}
						onCancel={exitSuggest}
						onSubmitted={exitSuggest}
						onPreviewCoordsChange={onPreviewCoordsChange}
					/>
				</Box>
			) : suggestMode === "feature" && selectedSectionId != null ? (
				<Box sx={{ flex: 1, overflowY: "auto" }}>
					<SuggestFeatureForm
						waterwayId={waterwayId}
						sectionId={selectedSectionId}
						sectionLine={(() => {
							const geom = sections.find((s) => s.id === selectedSectionId)
								?.location as unknown as GeoJSON.LineString | undefined;
							return geom?.type === "LineString"
								? geom.coordinates.map(([lng, lat]) => ({ lng, lat }))
								: undefined;
						})()}
						gaugeRanges={gaugeRanges}
						vertices={featureVertices ?? []}
						geomType={featureGeomType ?? "Point"}
						pickingActive={featurePickingActive ?? false}
						onRequestPick={() => onStartPickFeature?.()}
						onStopPick={() => onStopPickFeature?.()}
						onRemoveVertex={(i) => onRemoveFeatureVertex?.(i)}
						onGeomTypeChange={(t) => onFeatureGeomTypeChange?.(t)}
						onClearVertices={() => onFeatureDraftClear?.()}
						onCancel={exitSuggest}
						onSubmitted={exitSuggest}
					/>
				</Box>
			) : (
				<>
					<Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>
						{isLoading ? (
							<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
								<CircularProgress size={22} />
							</Box>
						) : inFeatures ? (
							<FeatureTimeline
								section={selectedSection}
								onFeatureClick={onFeatureClick}
							/>
						) : tab === "sections" ? (
							<SectionsList
								sections={sections}
								waterwayId={waterwayId}
								selectedSectionId={selectedSectionId}
								onSectionClick={onSectionClick}
							/>
						) : (
							<GaugesList
								gaugeRanges={gaugeRanges}
								selectedGaugeId={selectedGaugeId}
								onGaugeSelect={onGaugeSelect}
							/>
						)}
					</Box>

					{isAuthenticated && tab === "sections" && (
						<Box
							sx={{
								px: 1.5,
								py: 1,
								display: "flex",
								gap: 1,
								flexShrink: 0,
								borderTop: "1px solid",
								borderColor: "divider",
							}}
						>
							<Tooltip title="Coming soon">
								<span style={{ display: "contents" }}>
									<Button
										size="small"
										startIcon={<AddIcon />}
										variant="outlined"
										fullWidth
										disabled
										onClick={() => onSuggestModeChange("section")}
									>
										New section
									</Button>
								</span>
							</Tooltip>
							{selectedSectionId != null && (
								<Button
									size="small"
									startIcon={<AddIcon />}
									variant="outlined"
									fullWidth
									onClick={() => onSuggestModeChange("feature")}
								>
									New feature
								</Button>
							)}
						</Box>
					)}
				</>
			)}
		</>
	);
}

// ─── Sections list ───────────────────────────────────────────────────────────

interface SectionsListProps {
	sections: SectionWithFeatures[];
	waterwayId: number;
	selectedSectionId: number | undefined;
	onSectionClick: (id: number) => void;
}

function SectionsList({
	sections,
	waterwayId,
	selectedSectionId,
	onSectionClick,
}: SectionsListProps) {
	if (sections.length === 0) {
		return (
			<Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
				No sections found.
			</Typography>
		);
	}
	return (
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
	);
}

// ─── Gauges list ─────────────────────────────────────────────────────────────

interface GaugesListProps {
	gaugeRanges: WaterRangeWithStatus[];
	selectedGaugeId?: number | null;
	onGaugeSelect?: (id: number) => void;
}

function GaugesList({
	gaugeRanges,
	selectedGaugeId,
	onGaugeSelect,
}: GaugesListProps) {
	if (gaugeRanges.length === 0) {
		return (
			<Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
				No gauges found.
			</Typography>
		);
	}
	return (
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
							{range.latest_reading.value.toFixed(1)}&thinsp;{range.series.unit}
						</Typography>
					)}
				</ListItemButton>
			))}
		</List>
	);
}
