import MyLocationIcon from "@mui/icons-material/MyLocation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { Feature, FeatureType } from "@/lib/api";
import { featuresApi } from "@/lib/api";

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

interface SuggestFeatureDialogProps {
	waterwayId: number;
	sectionId: number;
	existingFeature?: Feature;
	/** [longitude, latitude] from map click */
	initialLocation?: [number, number] | null;
	open: boolean;
	onClose: () => void;
}

export default function SuggestFeatureDialog({
	waterwayId,
	sectionId,
	existingFeature,
	initialLocation,
	open,
	onClose,
}: SuggestFeatureDialogProps) {
	const existingCoords = (() => {
		const loc = existingFeature?.location as
			| { type: string; coordinates: number[] }
			| undefined;
		if (loc?.type === "Point" && loc.coordinates.length >= 2) {
			return { lng: loc.coordinates[0], lat: loc.coordinates[1] };
		}
		return null;
	})();

	const [featureType, setFeatureType] = useState<FeatureType>(
		(existingFeature?.feature_type as FeatureType | undefined) ?? "whitewater",
	);
	const [lng, setLng] = useState<string>(
		existingCoords ? String(existingCoords.lng) : "",
	);
	const [lat, setLat] = useState<string>(
		existingCoords ? String(existingCoords.lat) : "",
	);
	const [locationError, setLocationError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [snackbar, setSnackbar] = useState<string | null>(null);

	// Sync when map click arrives
	useEffect(() => {
		if (initialLocation) {
			setLng(initialLocation[0].toFixed(6));
			setLat(initialLocation[1].toFixed(6));
			setLocationError("");
		}
	}, [initialLocation]);

	function buildLocation(): object | null {
		const lngNum = parseFloat(lng);
		const latNum = parseFloat(lat);
		if (Number.isNaN(lngNum) || Number.isNaN(latNum)) {
			setLocationError("Enter valid coordinates or click on the map");
			return null;
		}
		if (lngNum < -180 || lngNum > 180 || latNum < -90 || latNum > 90) {
			setLocationError("Coordinates out of range");
			return null;
		}
		setLocationError("");
		return { type: "Point", coordinates: [lngNum, latNum] };
	}

	async function handleSubmit() {
		const location = buildLocation();
		if (!location) return;
		setSubmitting(true);
		try {
			if (existingFeature) {
				await featuresApi.update(waterwayId, sectionId, existingFeature.id, {
					feature_type: featureType,
					location: location as never,
					metadata: (existingFeature.metadata as object) ?? {},
				});
			} else {
				await featuresApi.create(waterwayId, sectionId, {
					feature_type: featureType,
					location: location as never,
					metadata: {},
				});
			}
			setSnackbar("Submitted for review");
			onClose();
		} catch {
			setSnackbar("Failed to submit");
		} finally {
			setSubmitting(false);
		}
	}

	const hasLocation = lng.trim() !== "" && lat.trim() !== "";

	return (
		<>
			<Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
				<DialogTitle>
					{existingFeature ? "Suggest feature update" : "Suggest new feature"}
				</DialogTitle>
				<DialogContent
					sx={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
						pt: "16px !important",
					}}
				>
					<Typography variant="caption" color="text.secondary">
						Your suggestion will be submitted for admin review.
					</Typography>

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

					{/* Location */}
					<Box>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ flex: 1 }}
							>
								Location
							</Typography>
							{hasLocation && (
								<Chip
									icon={<MyLocationIcon />}
									label="Set"
									size="small"
									color="success"
									variant="outlined"
								/>
							)}
						</Box>
						<Box sx={{ display: "flex", gap: 1 }}>
							<TextField
								label="Longitude"
								size="small"
								type="number"
								value={lng}
								onChange={(e) => setLng(e.target.value)}
								inputProps={{ step: "any" }}
								error={!!locationError}
								sx={{ flex: 1 }}
							/>
							<TextField
								label="Latitude"
								size="small"
								type="number"
								value={lat}
								onChange={(e) => setLat(e.target.value)}
								inputProps={{ step: "any" }}
								error={!!locationError}
								sx={{ flex: 1 }}
							/>
						</Box>
						{locationError && (
							<Typography
								variant="caption"
								color="error"
								sx={{ mt: 0.5, display: "block" }}
							>
								{locationError}
							</Typography>
						)}
						{!hasLocation && (
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ mt: 0.5, display: "block" }}
							>
								Close this dialog and click on the map, or enter coordinates
								above.
							</Typography>
						)}
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button
						variant="contained"
						onClick={handleSubmit}
						disabled={submitting || !hasLocation}
					>
						Submit
					</Button>
				</DialogActions>
			</Dialog>
			<Snackbar
				open={!!snackbar}
				autoHideDuration={3000}
				onClose={() => setSnackbar(null)}
				message={snackbar}
			/>
		</>
	);
}
