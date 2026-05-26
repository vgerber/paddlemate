import EditLocationAltIcon from "@mui/icons-material/EditLocationAlt";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";

import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SectionWithFeatures } from "@/lib/api";
import { sectionsApi } from "@/lib/api";
import { waterwayKeys } from "@/lib/hooks/useWaterways";

/** Dot product of proposed direction vs. estimated river flow.
 *  Negative → proposed take-out is upstream of put-in. */
function downstreamDot(
	sections: SectionWithFeatures[],
	putIn: { lat: number; lon: number },
	takeOut: { lat: number; lon: number },
): number {
	let dx = 0;
	let dy = 0;
	for (const s of sections) {
		const coords = (s.location as unknown as GeoJSON.LineString).coordinates;
		if (coords.length >= 2) {
			const start = coords[0];
			const end = coords[coords.length - 1];
			dx += end[0] - start[0];
			dy += end[1] - start[1];
		}
	}
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len === 0) return 1;
	const fx = dx / len;
	const fy = dy / len;
	return (takeOut.lon - putIn.lon) * fx + (takeOut.lat - putIn.lat) * fy;
}

interface SuggestSectionFormProps {
	waterwayId: number;
	sections: SectionWithFeatures[];
	putIn: { lat: number; lon: number } | null;
	takeOut: { lat: number; lon: number } | null;
	pickingFor: "put-in" | "take-out" | null;
	onRequestPickPutIn: () => void;
	onRequestPickTakeOut: () => void;
	onCancel: () => void;
	onSubmitted: () => void;
}

export default function SuggestSectionForm({
	waterwayId,
	sections,
	putIn,
	takeOut,
	pickingFor,
	onRequestPickPutIn,
	onRequestPickTakeOut,
	onCancel,
	onSubmitted,
}: SuggestSectionFormProps) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [region, setRegion] = useState("");
	const [country, setCountry] = useState("");
	const [description, setDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const hasLocation = putIn != null && takeOut != null;
	const orderWrong =
		hasLocation &&
		sections.length > 0 &&
		downstreamDot(sections, putIn, takeOut) < 0;

	async function handleSubmit() {
		if (!name.trim() || !hasLocation) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			await sectionsApi.create(waterwayId, {
				name: name.trim(),
				region: region.trim() || null,
				country: country.trim() || null,
				description: description.trim() || null,
				location: {
					type: "LineString",
					coordinates: [
						[putIn.lon, putIn.lat],
						[takeOut.lon, takeOut.lat],
					],
				} as never,
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

	const coordLabel = (p: { lat: number; lon: number }) =>
		`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;

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
				required
				fullWidth
			/>
			<Box sx={{ display: "flex", gap: 1 }}>
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
					sx={{ maxWidth: 90 }}
				/>
			</Box>
			<TextField
				label="Description"
				size="small"
				multiline
				rows={2}
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				fullWidth
			/>

			{/* Put-in */}
			<Box>
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ mb: 0.5, display: "block" }}
				>
					Put-in (upstream start)
				</Typography>
				{putIn ? (
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.75,
							flexWrap: "wrap",
						}}
					>
						<Chip
							size="small"
							icon={<LocationOnIcon sx={{ fontSize: "0.875rem !important" }} />}
							label={coordLabel(putIn)}
							color="primary"
							variant="outlined"
						/>
						<IconButton
							size="small"
							onClick={onRequestPickPutIn}
							disabled={submitting}
							title="Re-pick put-in"
						>
							<EditLocationAltIcon fontSize="small" />
						</IconButton>
					</Box>
				) : (
					<IconButton
						size="small"
						color={pickingFor === "put-in" ? "primary" : "default"}
						onClick={onRequestPickPutIn}
						disabled={submitting}
						title={pickingFor === "put-in" ? "Click on map…" : "Pick put-in"}
					>
						<LocationOnIcon fontSize="small" />
					</IconButton>
				)}
			</Box>

			{/* Take-out */}
			<Box>
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ mb: 0.5, display: "block" }}
				>
					Take-out (downstream end)
				</Typography>
				{takeOut ? (
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.75,
							flexWrap: "wrap",
						}}
					>
						<Chip
							size="small"
							icon={<LocationOnIcon sx={{ fontSize: "0.875rem !important" }} />}
							label={coordLabel(takeOut)}
							color="secondary"
							variant="outlined"
						/>
						<IconButton
							size="small"
							onClick={onRequestPickTakeOut}
							disabled={submitting}
							title="Re-pick take-out"
						>
							<EditLocationAltIcon fontSize="small" />
						</IconButton>
					</Box>
				) : (
					<IconButton
						size="small"
						color={pickingFor === "take-out" ? "secondary" : "default"}
						onClick={onRequestPickTakeOut}
						disabled={submitting}
						title={
							pickingFor === "take-out" ? "Click on map…" : "Pick take-out"
						}
					>
						<LocationOnIcon fontSize="small" />
					</IconButton>
				)}
			</Box>

			{orderWrong && (
				<Alert severity="warning" sx={{ py: 0.25, fontSize: "0.75rem" }}>
					Put-in appears to be downstream of take-out — check the order.
				</Alert>
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
					disabled={!name.trim() || !hasLocation || submitting}
				>
					Submit
				</Button>
			</Box>
		</Box>
	);
}
