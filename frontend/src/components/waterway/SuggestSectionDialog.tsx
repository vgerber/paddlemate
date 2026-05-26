import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { Section } from "@/lib/api";
import { sectionsApi } from "@/lib/api";

interface SuggestSectionDialogProps {
	waterwayId: number;
	existingSection?: Section;
	open: boolean;
	onClose: () => void;
}

export default function SuggestSectionDialog({
	waterwayId,
	existingSection,
	open,
	onClose,
}: SuggestSectionDialogProps) {
	const [name, setName] = useState(existingSection?.name ?? "");
	const [region, setRegion] = useState(existingSection?.region ?? "");
	const [country, setCountry] = useState(existingSection?.country ?? "");
	const [description, setDescription] = useState(
		existingSection?.description ?? "",
	);
	const [locationJson, setLocationJson] = useState(
		existingSection?.location
			? JSON.stringify(existingSection.location, null, 2)
			: "",
	);
	const [locationError, setLocationError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [snackbar, setSnackbar] = useState<string | null>(null);

	function validateLocation(): object | null {
		if (!locationJson.trim()) {
			setLocationError("Location is required");
			return null;
		}
		try {
			const parsed = JSON.parse(locationJson);
			setLocationError("");
			return parsed;
		} catch {
			setLocationError("Invalid GeoJSON");
			return null;
		}
	}

	async function handleSubmit() {
		if (!name.trim()) return;
		const location = validateLocation();
		if (!location) return;
		setSubmitting(true);
		try {
			if (existingSection) {
				await sectionsApi.update(waterwayId, existingSection.id, {
					name: name.trim(),
					region: region.trim() || null,
					country: country.trim() || null,
					description: description.trim() || null,
					location: location as never,
				});
			} else {
				await sectionsApi.create(waterwayId, {
					name: name.trim(),
					region: region.trim() || null,
					country: country.trim() || null,
					description: description.trim() || null,
					location: location as never,
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

	return (
		<>
			<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
				<DialogTitle>
					{existingSection ? "Suggest section update" : "Suggest new section"}
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
					<TextField
						label="Name"
						size="small"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						fullWidth
					/>
					<TextField
						label="Region"
						size="small"
						value={region}
						onChange={(e) => setRegion(e.target.value)}
						fullWidth
					/>
					<TextField
						label="Country"
						size="small"
						value={country}
						onChange={(e) => setCountry(e.target.value)}
						fullWidth
					/>
					<TextField
						label="Description"
						size="small"
						multiline
						rows={3}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						fullWidth
					/>
					<TextField
						label="Location (GeoJSON LineString)"
						size="small"
						multiline
						rows={5}
						value={locationJson}
						onChange={(e) => setLocationJson(e.target.value)}
						error={!!locationError}
						helperText={
							locationError ||
							'e.g. {"type":"LineString","coordinates":[[lon,lat],…]}'
						}
						placeholder='{"type":"LineString","coordinates":[[lon,lat],[lon,lat]]}'
						required
						fullWidth
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button
						variant="contained"
						onClick={handleSubmit}
						disabled={submitting || !name.trim()}
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
