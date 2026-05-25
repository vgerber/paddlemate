import Chip from "@mui/material/Chip";
import type { WaterRangeWithStatus } from "@/lib/api";
import type { components } from "@/lib/api/schema";

type WaterLevel = components["schemas"]["WaterLevel"];

const LEVEL_ORDER: WaterLevel[] = ["empty", "low", "medium", "high"];

function maxLevel(levels: WaterLevel[]): WaterLevel {
	return levels.reduce<WaterLevel>((best, cur) => {
		return LEVEL_ORDER.indexOf(cur) > LEVEL_ORDER.indexOf(best) ? cur : best;
	}, "empty");
}

const LEVEL_CONFIG: Record<
	WaterLevel,
	{ label: string; color: string; bgcolor: string; border?: string }
> = {
	empty: {
		label: "E",
		color: "rgba(255,255,255,0.35)",
		bgcolor: "transparent",
		border: "rgba(255,255,255,0.18)",
	},
	low: {
		label: "L",
		color: "#81c784",
		bgcolor: "rgba(129,199,132,0.15)",
	},
	medium: {
		label: "M",
		color: "#ffb74d",
		bgcolor: "rgba(255,183,77,0.15)",
	},
	high: {
		label: "H",
		color: "#e57373",
		bgcolor: "rgba(229,115,115,0.15)",
	},
};

interface WaterLevelChipProps {
	ranges: WaterRangeWithStatus[] | undefined;
	loading?: boolean;
}

export default function WaterLevelChip({
	ranges,
	loading,
}: WaterLevelChipProps) {
	if (loading || ranges === undefined) {
		return (
			<Chip
				label="–"
				size="small"
				sx={{ ml: 0.5, opacity: 0.4, fontSize: "0.65rem", minWidth: 32 }}
			/>
		);
	}

	// No gauge configured for this section - don't show a chip
	if (ranges.length === 0) return null;

	const level = maxLevel(ranges.map((r) => r.level));
	const cfg = LEVEL_CONFIG[level];

	return (
		<Chip
			label={cfg.label}
			size="small"
			variant={level === "empty" ? "outlined" : "filled"}
			sx={{
				ml: 0.5,
				fontSize: "0.65rem",
				fontWeight: 400,
				color: cfg.color,
				bgcolor: cfg.bgcolor,
				borderColor: cfg.border,
				minWidth: 32,
			}}
		/>
	);
}

export type { WaterLevel };
export { LEVEL_CONFIG, maxLevel };
