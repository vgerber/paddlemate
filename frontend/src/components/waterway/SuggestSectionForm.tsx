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
import { useEffect, useRef, useState } from "react";
import type { SectionWithFeatures } from "@/lib/api";
import { sectionsApi } from "@/lib/api";
import { waterwayKeys } from "@/lib/hooks/useWaterways";
import { type Coord, fetchOsmRiver, snapSection } from "@/lib/riverSnap";

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
	/** River name used for the Overpass geometry query. */
	waterwayName: string;
	sections: SectionWithFeatures[];
	putIn: { lat: number; lon: number } | null;
	takeOut: { lat: number; lon: number } | null;
	pickingFor: "put-in" | "take-out" | null;
	onRequestPickPutIn: () => void;
	onRequestPickTakeOut: () => void;
	onCancel: () => void;
	onSubmitted: () => void;
	onPreviewCoordsChange?: (coords: Coord[] | null) => void;
}

export default function SuggestSectionForm({
	waterwayId,
	waterwayName,
	sections,
	putIn,
	takeOut,
	pickingFor,
	onRequestPickPutIn,
	onRequestPickTakeOut,
	onCancel,
	onSubmitted,
	onPreviewCoordsChange,
}: SuggestSectionFormProps) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [region, setRegion] = useState("");
	const [country, setCountry] = useState("");
	const [description, setDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// OSM river snap
	type SnapStatus = "idle" | "loading" | "done" | "failed";
	const [snapStatus, setSnapStatus] = useState<SnapStatus>("idle");
	const [snappedCoords, setSnappedCoords] = useState<Coord[] | null>(null);
	// Cache the fetched river so we only call Overpass once per waterway
	const riverRef = useRef<Coord[] | null>(null);
	const riverNameRef = useRef<string>("");

	useEffect(() => {
		if (!putIn || !takeOut || !waterwayName) return;

		// Clear cached river if the waterway changed
		if (riverNameRef.current !== waterwayName) {
			riverRef.current = null;
			riverNameRef.current = waterwayName;
		}

		const controller = new AbortController();

		async function run() {
			setSnapStatus("loading");

			let river = riverRef.current;
			if (!river) {
				const pad = 0.05;
				const bbox = {
					south: Math.min(putIn.lat, takeOut.lat) - pad,
					north: Math.max(putIn.lat, takeOut.lat) + pad,
					west: Math.min(putIn.lon, takeOut.lon) - pad,
					east: Math.max(putIn.lon, takeOut.lon) + pad,
				};
				try {
					river = await fetchOsmRiver(waterwayName, bbox, controller.signal);
					riverRef.current = river;
				} catch (err) {
					if (
						!controller.signal.aborted &&
						!(err instanceof Error && err.name === "AbortError")
					) {
						setSnapStatus("failed");
						setSnappedCoords(null);
					}
					return;
				}
			}

			if (!river) {
				setSnapStatus("failed");
				setSnappedCoords(null);
				return;
			}

			const coords = snapSection(river, putIn, takeOut);
			if (coords) {
				setSnapStatus("done");
				setSnappedCoords(coords);
			} else {
				setSnapStatus("failed");
				setSnappedCoords(null);
			}
		}

		run();
		return () => controller.abort();
	}, [putIn, takeOut, waterwayName]);

	// Notify parent whenever the snapped coords change
	useEffect(() => {
		onPreviewCoordsChange?.(snappedCoords);
	}, [snappedCoords, onPreviewCoordsChange]);

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
			const coordinates: [number, number][] =
				snappedCoords && snappedCoords.length >= 2
					? snappedCoords
					: [
							[putIn.lon, putIn.lat],
							[takeOut.lon, takeOut.lat],
						];
			await sectionsApi.create(waterwayId, {
				name: name.trim(),
				region: region.trim() || null,
				country: country.trim() || null,
				description: description.trim() || null,
				location: {
					type: "LineString",
					coordinates,
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
							icon={
								<LocationOnIcon
									sx={{
										fontSize: "0.875rem !important",
										color: "text.secondary !important",
									}}
								/>
							}
							label={coordLabel(putIn)}
							variant="filled"
							sx={{ bgcolor: "action.selected" }}
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
							icon={
								<LocationOnIcon
									sx={{
										fontSize: "0.875rem !important",
										color: "text.secondary !important",
									}}
								/>
							}
							label={coordLabel(takeOut)}
							variant="filled"
							sx={{ bgcolor: "action.selected" }}
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

			{/* Show a note only when OSM snap failed */}
			{snapStatus === "failed" && hasLocation && (
				<Typography variant="caption" color="text.disabled">
					No OSM mapping found — straight line will be used.
				</Typography>
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
