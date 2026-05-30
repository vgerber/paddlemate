import CloseIcon from "@mui/icons-material/Close";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FeatureType, WaterRangeWithStatus } from "@/lib/api";
import { featuresApi } from "@/lib/api";
import { waterwayKeys } from "@/lib/hooks/useWaterways";

type GeomType = "Point" | "LineString" | "Polygon";

const FEATURE_TYPES: FeatureType[] = [
	"whitewater",
	"freestyle_spot",
	"hole",
	"siphon",
	"strainer",
	"weir",
	"dam",
	"obstacle",
	"bridge",
	"portage",
	"put_in",
	"take_out",
	"waterfall",
];

interface SuggestFeatureFormProps {
	waterwayId: number;
	sectionId: number;
	/** Full line of the section, offered as a one-click fill for LineString features. */
	sectionLine?: { lng: number; lat: number }[];
	/** Gauge ranges for the section — drives the water-level threshold fields. */
	gaugeRanges?: WaterRangeWithStatus[];
	/** Vertices picked from map */
	vertices: { lng: number; lat: number }[];
	/** Geometry type — controlled by parent */
	geomType: GeomType;
	onGeomTypeChange: (t: GeomType) => void;
	/** True while map is accepting clicks */
	pickingActive: boolean;
	onRequestPick: () => void;
	onStopPick: () => void;
	onRemoveVertex?: (i: number) => void;
	onClearVertices: () => void;
	onCancel: () => void;
	onSubmitted: () => void;
}

export default function SuggestFeatureForm({
	waterwayId,
	sectionId,
	sectionLine,
	gaugeRanges,
	vertices,
	geomType,
	onGeomTypeChange,
	pickingActive,
	onRequestPick,
	onStopPick,
	onRemoveVertex,
	onClearVertices,
	onCancel,
	onSubmitted,
}: SuggestFeatureFormProps) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [featureType, setFeatureType] = useState<FeatureType>("whitewater");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [useSectionLine, setUseSectionLine] = useState(false);
	const [difficulty, setDifficulty] = useState("");
	// Gauge range thresholds
	const availableSeries = gaugeRanges?.map((r) => r.series) ?? [];
	const [seriesId, setSeriesId] = useState<number | "">(
		availableSeries[0]?.id ?? "",
	);
	const [rangeLow, setRangeLow] = useState("");
	const [rangeMedium, setRangeMedium] = useState("");
	const [rangeHigh, setRangeHigh] = useState("");
	const activeSeries =
		seriesId !== ""
			? (gaugeRanges?.find((r) => r.series.id === seriesId) ?? gaugeRanges?.[0])
			: gaugeRanges?.[0];

	// Auto-stop picking after first vertex in Point mode
	useEffect(() => {
		if (geomType === "Point" && vertices.length >= 1 && pickingActive) {
			onStopPick();
		}
	}, [geomType, vertices.length, pickingActive, onStopPick]);

	function handleGeomTypeChange(newType: GeomType) {
		if (newType === geomType) return;
		setUseSectionLine(false);
		onGeomTypeChange(newType); // parent resets vertices
	}

	const minVertices =
		geomType === "Point" ? 1 : geomType === "LineString" ? 2 : 3;
	const canSubmit =
		(useSectionLine && geomType === "LineString" && !!sectionLine) ||
		(vertices.length >= minVertices && !submitting);

	function buildGeometry() {
		if (useSectionLine && geomType === "LineString" && sectionLine) {
			return {
				type: "LineString" as const,
				coordinates: sectionLine.map((v) => [v.lng, v.lat] as [number, number]),
			};
		}
		const coords = vertices.map((v) => [v.lng, v.lat] as [number, number]);
		if (geomType === "Point")
			return { type: "Point" as const, coordinates: coords[0] };
		if (geomType === "LineString")
			return { type: "LineString" as const, coordinates: coords };
		return { type: "Polygon" as const, coordinates: [[...coords, coords[0]]] };
	}

	async function handleSubmit() {
		if (!canSubmit) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			const diff = difficulty.trim() || null;
			const low = rangeLow !== "" ? Number(rangeLow) : null;
			const med = rangeMedium !== "" ? Number(rangeMedium) : null;
			const high = rangeHigh !== "" ? Number(rangeHigh) : null;
			const hasRange =
				seriesId !== "" && (low != null || med != null || high != null);
			await featuresApi.create(waterwayId, sectionId, {
				feature_type: featureType,
				location: buildGeometry() as never,
				metadata: {
					...(diff ? { difficulty: diff } : {}),
					...(hasRange
						? {
								water_range: {
									series_id: seriesId,
									...(low != null ? { range_low: low } : {}),
									...(med != null ? { range_medium: med } : {}),
									...(high != null ? { range_high: high } : {}),
								},
							}
						: {}),
				},
				name: name.trim() || null,
				description: description.trim() || null,
			});
			queryClient.invalidateQueries({
				queryKey: waterwayKeys.detail(waterwayId),
			});
			onSubmitted();
		} catch {
			setSubmitError("Failed to submit. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	const coordLabel = (v: { lng: number; lat: number }) =>
		`${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`;

	return (
		<Box
			sx={{
				px: 1.5,
				pt: 1.5,
				pb: 1.5,
				display: "flex",
				flexDirection: "column",
				gap: 1.5,
			}}
		>
			<TextField
				label="Name"
				size="small"
				value={name}
				onChange={(e) => setName(e.target.value)}
				fullWidth
			/>

			<TextField
				label="Description"
				size="small"
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				fullWidth
				multiline
				minRows={2}
			/>

			<FormControl fullWidth size="small">
				<InputLabel id="feature-type-label">Feature type</InputLabel>
				<Select
					labelId="feature-type-label"
					label="Feature type"
					value={featureType}
					onChange={(e) => setFeatureType(e.target.value as FeatureType)}
				>
					{FEATURE_TYPES.map((t) => (
						<MenuItem key={t} value={t}>
							{t.replace(/_/g, " ")}
						</MenuItem>
					))}
				</Select>
			</FormControl>

			<TextField
				label="Difficulty"
				size="small"
				value={difficulty}
				onChange={(e) => setDifficulty(e.target.value)}
				placeholder="e.g. III+, III-IV, IV-V+"
				fullWidth
			/>

			{availableSeries.length > 0 && (
				<>
					{availableSeries.length > 1 && (
						<FormControl fullWidth size="small">
							<InputLabel id="series-label">Gauge series</InputLabel>
							<Select
								labelId="series-label"
								label="Gauge series"
								value={seriesId}
								onChange={(e) => setSeriesId(e.target.value as number | "")}
							>
								{(gaugeRanges ?? []).map((r) => (
									<MenuItem key={r.series.id} value={r.series.id}>
										{r.series.label ?? r.gauge.name}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					)}
					<Box sx={{ display: "flex", gap: 1 }}>
						<TextField
							label="Low"
							size="small"
							inputMode="decimal"
							value={rangeLow}
							onChange={(e) => setRangeLow(e.target.value)}
							sx={{
								flex: 1,
								"& label": { color: "#81c784" },
								"& label.Mui-focused": { color: "#81c784" },
								"& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
									{ borderColor: "#81c784" },
							}}
						/>
						<TextField
							label="Medium"
							size="small"
							inputMode="decimal"
							value={rangeMedium}
							onChange={(e) => setRangeMedium(e.target.value)}
							sx={{
								flex: 1,
								"& label": { color: "#ffb74d" },
								"& label.Mui-focused": { color: "#ffb74d" },
								"& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
									{ borderColor: "#ffb74d" },
							}}
						/>
						<TextField
							label="High"
							size="small"
							inputMode="decimal"
							value={rangeHigh}
							onChange={(e) => setRangeHigh(e.target.value)}
							sx={{
								flex: 1,
								"& label": { color: "#e57373" },
								"& label.Mui-focused": { color: "#e57373" },
								"& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
									{ borderColor: "#e57373" },
							}}
						/>
					</Box>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ mt: -0.5 }}
					>
						{activeSeries?.gauge.name}
						{activeSeries?.series.unit ? ` · ${activeSeries.series.unit}` : ""}
					</Typography>
				</>
			)}

			<ToggleButtonGroup
				value={geomType}
				exclusive
				onChange={(_, v) => v && handleGeomTypeChange(v as GeomType)}
				size="small"
				fullWidth
				sx={{
					"& .MuiToggleButton-root": { flex: 1, py: 0.5, fontSize: "0.75rem" },
				}}
			>
				<ToggleButton value="Point">Point</ToggleButton>
				<ToggleButton value="LineString">Line</ToggleButton>
				<ToggleButton value="Polygon">Area</ToggleButton>
			</ToggleButtonGroup>

			{geomType === "Point" ? (
				vertices.length > 0 ? (
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
							bgcolor: "action.hover",
							borderRadius: 1,
							px: 1,
							py: 0.5,
							border: "1px solid",
							borderColor: "divider",
						}}
					>
						<LocationOnIcon
							fontSize="small"
							sx={{ color: "text.disabled", flexShrink: 0 }}
						/>
						<Typography
							variant="body2"
							sx={{ flex: 1, fontFamily: "monospace", fontSize: "0.75rem" }}
						>
							{coordLabel(vertices[0])}
						</Typography>
						<Button
							size="small"
							onClick={() => {
								onClearVertices();
								onRequestPick();
							}}
							disabled={submitting}
						>
							Move
						</Button>
					</Box>
				) : (
					<Button
						variant={pickingActive ? "contained" : "outlined"}
						color="primary"
						size="small"
						fullWidth
						startIcon={<LocationOnIcon />}
						onClick={pickingActive ? onStopPick : onRequestPick}
						disabled={submitting}
					>
						{pickingActive ? "Tap the map to place\u2026" : "Place on map"}
					</Button>
				)
			) : (
				<>
					{geomType === "LineString" && sectionLine && (
						<FormControlLabel
							control={
								<Checkbox
									size="small"
									checked={useSectionLine}
									onChange={(e) => {
										setUseSectionLine(e.target.checked);
										if (e.target.checked) onClearVertices();
									}}
									disabled={submitting}
								/>
							}
							label={
								<Typography variant="caption">Use full section line</Typography>
							}
						/>
					)}
					{!useSectionLine && (
						<>
							<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
								<Typography
									variant="caption"
									color={
										vertices.length === 0
											? "text.secondary"
											: vertices.length < minVertices
												? "warning.main"
												: "success.main"
									}
									sx={{ flex: 1 }}
								>
									{vertices.length === 0
										? `Min. ${minVertices} points required`
										: vertices.length < minVertices
											? `${vertices.length} point${vertices.length !== 1 ? "s" : ""} \u2014 ${minVertices - vertices.length} more needed`
											: `${vertices.length} point${vertices.length !== 1 ? "s" : ""} placed`}
								</Typography>
							</Box>
							{vertices.length > 0 && (
								<Box
									sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
								>
									{vertices.map((v, i) => (
										<Box
											key={`${v.lat},${v.lng}`}
											sx={{
												display: "flex",
												alignItems: "center",
												gap: 1,
												bgcolor: "action.hover",
												borderRadius: 1,
												px: 1,
												py: 0.5,
												border: "1px solid",
												borderColor: "divider",
											}}
										>
											<Typography
												variant="caption"
												sx={{
													color: "text.disabled",
													minWidth: "1rem",
													textAlign: "center",
													flexShrink: 0,
												}}
											>
												{i + 1}
											</Typography>
											<Typography
												variant="body2"
												sx={{
													flex: 1,
													fontFamily: "monospace",
													fontSize: "0.75rem",
												}}
											>
												{coordLabel(v)}
											</Typography>
											{onRemoveVertex && (
												<Box
													component="span"
													onClick={() => !submitting && onRemoveVertex(i)}
													sx={{
														display: "inline-flex",
														alignItems: "center",
														justifyContent: "center",
														width: 20,
														height: 20,
														borderRadius: 0.5,
														bgcolor: "action.selected",
														color: "text.disabled",
														fontSize: "0.8rem",
														cursor: submitting ? "default" : "pointer",
														flexShrink: 0,
														"&:hover": submitting
															? {}
															: {
																	color: "text.secondary",
																},
													}}
												>
													<CloseIcon sx={{ fontSize: "0.75rem" }} />
												</Box>
											)}
										</Box>
									))}
								</Box>
							)}
							<Button
								variant={pickingActive ? "contained" : "outlined"}
								color="primary"
								size="small"
								fullWidth
								startIcon={<LocationOnIcon />}
								onClick={pickingActive ? onStopPick : onRequestPick}
								disabled={submitting}
							>
								{pickingActive
									? "Done adding points"
									: vertices.length === 0
										? "Start drawing"
										: "Add another point"}
							</Button>
						</>
					)}
				</>
			)}

			{submitError && (
				<Alert severity="error" sx={{ py: 0.25, fontSize: "0.75rem" }}>
					{submitError}
				</Alert>
			)}

			<Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
				<Button size="small" onClick={onCancel} disabled={submitting}>
					Cancel
				</Button>
				<Button
					size="small"
					variant="contained"
					onClick={handleSubmit}
					disabled={!canSubmit}
				>
					Submit
				</Button>
			</Box>
		</Box>
	);
}
