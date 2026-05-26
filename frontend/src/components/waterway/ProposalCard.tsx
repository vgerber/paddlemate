import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { Proposal, ProposalStatus } from "@/lib/api";
import {
	useReviewProposal,
	useUnvoteProposal,
	useVoteProposal,
} from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";

const STATUS_COLOR: Record<
	ProposalStatus,
	"default" | "warning" | "success" | "error"
> = {
	pending: "warning",
	approved: "success",
	rejected: "error",
};

const OP_LABEL: Record<string, string> = {
	create: "Create",
	update: "Update",
	delete: "Delete",
};

const ENTITY_LABEL: Record<string, string> = {
	waterway: "River",
	water_section: "Section",
	feature: "Feature",
};

function diffObjects(
	original: Record<string, unknown>,
	proposed: Record<string, unknown>,
): Array<{ key: string; from: unknown; to: unknown }> {
	const keys = new Set([...Object.keys(original), ...Object.keys(proposed)]);
	const diffs: Array<{ key: string; from: unknown; to: unknown }> = [];
	for (const key of keys) {
		if (JSON.stringify(original[key]) !== JSON.stringify(proposed[key])) {
			diffs.push({ key, from: original[key], to: proposed[key] });
		}
	}
	return diffs;
}

function shortValue(v: unknown): string {
	if (v === null || v === undefined) return "—";
	if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
	return JSON.stringify(v).slice(0, 80);
}

interface ProposalCardProps {
	proposal: Proposal;
	adminMode?: boolean;
}

export default function ProposalCard({
	proposal,
	adminMode,
}: ProposalCardProps) {
	const { isAuthenticated, user } = useSession();
	const vote = useVoteProposal();
	const unvote = useUnvoteProposal();
	const review = useReviewProposal();
	const [reviewNote, setReviewNote] = useState("");
	const [showReview, setShowReview] = useState(false);

	const isOwn = user?.id === proposal.submitted_by;
	const proposed = proposal.proposed_data as Record<string, unknown>;
	const original = proposal.original_data as
		| Record<string, unknown>
		| null
		| undefined;

	const diffs =
		original && proposal.operation === "update"
			? diffObjects(original, proposed)
			: null;

	function handleVote(v: 1 | -1) {
		if (proposal.user_vote === v) {
			unvote.mutate(proposal.id);
		} else {
			vote.mutate({ id: proposal.id, vote: v });
		}
	}

	return (
		<Card variant="outlined" sx={{ mb: 1.5 }}>
			<CardContent sx={{ pb: "12px !important" }}>
				{/* Header row */}
				<Box
					sx={{
						display: "flex",
						gap: 0.75,
						alignItems: "center",
						flexWrap: "wrap",
						mb: 1,
					}}
				>
					<Chip
						label={ENTITY_LABEL[proposal.entity_type] ?? proposal.entity_type}
						size="small"
						color="primary"
						variant="outlined"
					/>
					<Chip
						label={OP_LABEL[proposal.operation] ?? proposal.operation}
						size="small"
						variant="outlined"
					/>
					<Chip
						label={proposal.status}
						size="small"
						color={STATUS_COLOR[proposal.status]}
					/>
					<Box sx={{ flex: 1 }} />
					<Typography variant="caption" color="text.secondary">
						{new Date(proposal.created_at).toLocaleDateString()}
					</Typography>
				</Box>

				{/* Content */}
				{proposal.operation === "delete" && (
					<Typography variant="body2" color="text.secondary">
						Deletion request
						{original
							? `: "${(original.name as string | undefined) ?? ""}"`
							: ""}
					</Typography>
				)}

				{proposal.operation === "create" && (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: "auto 1fr",
							gap: "2px 8px",
						}}
					>
						{Object.entries(proposed)
							.filter(([k]) => k !== "geometry" && k !== "water_ranges")
							.map(([k, v]) => (
								<>
									<Typography
										key={`k-${k}`}
										variant="caption"
										color="text.secondary"
									>
										{k}
									</Typography>
									<Typography key={`v-${k}`} variant="caption">
										{shortValue(v)}
									</Typography>
								</>
							))}
					</Box>
				)}

				{diffs && diffs.length > 0 && (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: "auto 1fr 1fr",
							gap: "2px 8px",
						}}
					>
						<Typography variant="caption" color="text.secondary">
							field
						</Typography>
						<Typography variant="caption" color="text.secondary">
							before
						</Typography>
						<Typography variant="caption" color="text.secondary">
							after
						</Typography>
						{diffs
							.filter(({ key }) => key !== "geometry" && key !== "water_ranges")
							.map(({ key, from, to }) => (
								<>
									<Typography key={`k-${key}`} variant="caption">
										{key}
									</Typography>
									<Typography
										key={`f-${key}`}
										variant="caption"
										sx={{ textDecoration: "line-through", color: "error.main" }}
									>
										{shortValue(from)}
									</Typography>
									<Typography
										key={`t-${key}`}
										variant="caption"
										sx={{ color: "success.main" }}
									>
										{shortValue(to)}
									</Typography>
								</>
							))}
					</Box>
				)}

				{/* Review note for non-pending */}
				{proposal.review_note && (
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ mt: 1, display: "block" }}
					>
						Note: {proposal.review_note}
					</Typography>
				)}

				{/* Footer: submitter + votes */}
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						mt: 1,
						gap: 1,
					}}
				>
					<Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
						{isOwn ? "You" : proposal.submitted_by}
					</Typography>

					<Tooltip
						title={!isAuthenticated ? "Login to vote" : ""}
						placement="top"
					>
						<span>
							<IconButton
								size="small"
								disabled={!isAuthenticated}
								onClick={() => handleVote(1)}
								color={proposal.user_vote === 1 ? "secondary" : "default"}
							>
								<ThumbUpIcon fontSize="inherit" />
							</IconButton>
						</span>
					</Tooltip>
					<Typography variant="caption">{proposal.upvotes}</Typography>
					<Tooltip
						title={!isAuthenticated ? "Login to vote" : ""}
						placement="top"
					>
						<span>
							<IconButton
								size="small"
								disabled={!isAuthenticated}
								onClick={() => handleVote(-1)}
								color={proposal.user_vote === -1 ? "error" : "default"}
							>
								<ThumbDownIcon fontSize="inherit" />
							</IconButton>
						</span>
					</Tooltip>
					<Typography variant="caption">{proposal.downvotes}</Typography>

					{adminMode && proposal.status === "pending" && (
						<Button
							size="small"
							variant="outlined"
							color="secondary"
							onClick={() => setShowReview((s) => !s)}
							sx={{ ml: 1 }}
						>
							Review
						</Button>
					)}
				</Box>

				{/* Admin review panel */}
				{adminMode && (
					<Collapse in={showReview}>
						<Box
							sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1 }}
						>
							<TextField
								label="Note (optional)"
								size="small"
								multiline
								rows={2}
								value={reviewNote}
								onChange={(e) => setReviewNote(e.target.value)}
								fullWidth
							/>
							<Box sx={{ display: "flex", gap: 1 }}>
								<Button
									size="small"
									variant="contained"
									color="success"
									disabled={review.isPending}
									onClick={() =>
										review.mutate(
											{
												id: proposal.id,
												body: {
													status: "approved",
													review_note: reviewNote || null,
												},
											},
											{ onSuccess: () => setShowReview(false) },
										)
									}
								>
									Approve
								</Button>
								<Button
									size="small"
									variant="contained"
									color="error"
									disabled={review.isPending}
									onClick={() =>
										review.mutate(
											{
												id: proposal.id,
												body: {
													status: "rejected",
													review_note: reviewNote || null,
												},
											},
											{ onSuccess: () => setShowReview(false) },
										)
									}
								>
									Reject
								</Button>
							</Box>
						</Box>
					</Collapse>
				)}
			</CardContent>
		</Card>
	);
}
