import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { LEVEL_CONFIG, maxLevel } from "@/components/WaterLevelChip";
import type { Descent } from "@/lib/api";

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function formatTime(iso: string) {
	return new Date(iso).toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function durationLabel(start: string, end: string): string | null {
	const ms = new Date(end).getTime() - new Date(start).getTime();
	if (ms <= 0) return null;
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	if (h === 0) return m > 0 ? `${m}m` : null;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const VISIBILITY_ICONS = {
	private: <LockOutlinedIcon sx={{ fontSize: 13 }} />,
	shared: <GroupOutlinedIcon sx={{ fontSize: 13 }} />,
	public: <PublicOutlinedIcon sx={{ fontSize: 13 }} />,
};

interface DescentCardProps {
	descent: Descent;
	onClick?: () => void;
}

export default function DescentCard({ descent, onClick }: DescentCardProps) {
	const waterwayNames = [
		...new Set(
			descent.sections
				.slice()
				.sort((a, b) => a.sort_order - b.sort_order)
				.map((s) => s.waterway_name)
				.filter(Boolean),
		),
	] as string[];

	const sectionNames = descent.sections
		.slice()
		.sort((a, b) => a.sort_order - b.sort_order)
		.map((s) => s.section_name)
		.filter(Boolean) as string[];

	const dateStr = formatDate(descent.start_time);
	const titleLine =
		descent.name ||
		(waterwayNames.length > 0 ? waterwayNames.join(" / ") : null) ||
		(sectionNames.length > 0 ? sectionNames.join(", ") : null) ||
		dateStr;
	const titleIsDate = titleLine === dateStr;

	return (
		<Box
			onClick={onClick}
			sx={{
				p: 2,
				bgcolor: "background.paper",
				borderBottom: "1px solid",
				borderColor: "divider",
				cursor: onClick ? "pointer" : "default",
				"&:hover": onClick ? { bgcolor: "action.hover" } : undefined,
				display: "flex",
				flexDirection: "column",
				gap: 0.75,
			}}
		>
			{/* Title row */}
			<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
				<Typography
					sx={{
						fontFamily: '"Space Grotesk", monospace',
						fontWeight: 700,
						fontSize: "0.9rem",
						color: "text.primary",
						letterSpacing: "0.02em",
						flex: 1,
					}}
				>
					{titleLine}
				</Typography>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 0.5,
						color: "text.disabled",
						flexShrink: 0,
					}}
				>
					{VISIBILITY_ICONS[descent.visibility.type]}
					<Typography
						sx={{
							fontSize: "0.6rem",
							textTransform: "uppercase",
							letterSpacing: "0.08em",
							fontFamily: '"Space Grotesk", monospace',
						}}
					>
						{descent.visibility.type}
					</Typography>
				</Box>
			</Box>

			{/* Section names */}
			{descent.sections.length > 0 && (
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						flexWrap: "wrap",
					}}
				>
					{sectionNames.length > 0 &&
						(descent.name || waterwayNames.length > 0) && (
							<Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
								{sectionNames.join(", ")}
							</Typography>
						)}
					{descent.put_in_label && (
						<Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
							{descent.put_in_label}
						</Typography>
					)}
				</Box>
			)}

			{/* Note preview */}
			{descent.note && (
				<Typography
					sx={{
						fontSize: "0.75rem",
						color: "text.secondary",
						overflow: "hidden",
						textOverflow: "ellipsis",
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
					}}
				>
					{descent.note}
				</Typography>
			)}

			<Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mt: 0.25 }}>
				{(() => {
					const allSnapshots = descent.sections.flatMap(
						(s) => s.water_snapshots ?? [],
					);
					if (allSnapshots.length === 0) return null;
					const level = maxLevel(allSnapshots.map((s) => s.level));
					const cfg = LEVEL_CONFIG[level];
					return (
						<Chip
							label={cfg.label}
							size="small"
							variant={level === "empty" ? "outlined" : "filled"}
							sx={{
								fontSize: "0.6rem",
								height: 18,
								color: cfg.color,
								bgcolor: cfg.bgcolor,
								borderColor: cfg.border,
							}}
						/>
					);
				})()}
				{!titleIsDate && (
					<Typography
						sx={{
							fontFamily: '"Space Grotesk", monospace',
							fontSize: "0.72rem",
							color: "primary.main",
						}}
					>
						{dateStr}
					</Typography>
				)}
				<Typography
					sx={{
						fontFamily: '"Space Grotesk", monospace',
						fontSize: "0.68rem",
						color: titleIsDate ? "primary.main" : "text.disabled",
					}}
				>
					{formatTime(descent.start_time)}
				</Typography>
				{durationLabel(descent.start_time, descent.end_time) && (
					<Typography
						sx={{
							fontFamily: '"Space Grotesk", monospace',
							fontSize: "0.68rem",
							color: "text.disabled",
						}}
					>
						{durationLabel(descent.start_time, descent.end_time)}
					</Typography>
				)}
			</Box>
		</Box>
	);
}
