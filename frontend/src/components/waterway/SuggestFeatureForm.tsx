import LocationOnIcon from "@mui/icons-material/LocationOn";
import UndoIcon from "@mui/icons-material/Undo";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FeatureType } from "@/lib/api";
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
	/** Vertices picked from map */
	vertices: { lng: number; lat: number }[];
	/** Geometry type — controlled by parent */
	geomType: GeomType;
	onGeomTypeChange: (t: GeomType) => void;
	/** True while map is accepting clicks */
	pickingActive: boolean;
	onRequestPick: () => void;
	onStopPick: () => void;
	onPopVertex: () => void;
	onRemoveVertex?: (i: number) => void;
	onClearVertices: () => void;
	onCancel: () => void;
	onSubmitted: () => void;
}

export default function SuggestFeatureForm({
	waterwayId,
	sectionId,
	vertices,
	geomType,
	onGeomTypeChange,
	pickingActive,
	onRequestPick,
	onStopPick,
	onPopVertex,
	onRemoveVertex,
	onClearVertices,
	onCancel,
	onSubmitted,
}: SuggestFeatureFormProps) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [featureType, setFeatureType] = useState<FeatureType>("whitewater");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// Auto-stop picking after first vertex in Point mode
	useEffect(() => {
		if (geomType === "Point" && vertices.length >= 1 && pickingActive) {
			onStopPick();
		}
	}, [geomType, vertices.length, pickingActive, onStopPick]);

	function handleGeomTypeChange(newType: GeomType) {
		if (newType === geomType) return;
		onGeomTypeChange(newType); // parent resets vertices
	}

	const minVertices =
		geomType === "Point" ? 1 : geomType === "LineString" ? 2 : 3;
	const canSubmit = vertices.length >= minVertices && !submitting;

	function buildGeometry() {
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
			await featuresApi.create(waterwayId, sectionId, {
				feature_type: featureType,
				location: buildGeometry() as never,
				metadata: {},
				name: name.trim() || null,
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
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						<LocationOnIcon fontSize="small" color="primary" />
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
						{vertices.length > 0 && (
							<Button
								size="small"
								onClick={onPopVertex}
								disabled={submitting}
								startIcon={
									<UndoIcon sx={{ fontSize: "0.875rem !important" }} />
								}
							>
								Undo
							</Button>
						)}
					</Box>
					{vertices.length > 0 && (
						<Box
							sx={{
								display: "flex",
								flexWrap: "wrap",
								gap: 0.5,
							}}
						>
							{vertices.map((_, i) => (
								<Box
									key={i}
									component="span"
									onClick={() => !submitting && onRemoveVertex?.(i)}
									sx={{
										display: "inline-flex",
										alignItems: "center",
										gap: 0.25,
										px: 0.75,
										py: 0.25,
										borderRadius: 1,
										border: "1px solid",
										borderColor: "divider",
										fontSize: "0.7rem",
										cursor: onRemoveVertex ? "pointer" : "default",
										"&:hover": onRemoveVertex
											? {
													borderColor: "error.main",
													color: "error.main",
												}
											: {},
									}}
								>
									{i + 1}
									{onRemoveVertex && (
										<span style={{ opacity: 0.5, fontSize: "0.65rem" }}>
											&times;
										</span>
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
