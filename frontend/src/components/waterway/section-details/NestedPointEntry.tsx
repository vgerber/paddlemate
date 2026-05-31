import Typography from "@mui/material/Typography";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

import { CoordsInfo } from "./CoordsInfo";
import type { ComputedFeature } from "./types";
import { featureDesc, featureName, fmtKm } from "./utils";

interface Props {
	item: ComputedFeature;
	isActive?: boolean;
	onClick?: () => void;
}

/**
 * A point feature rendered inside a ZoneEntry.
 * The dot column aligns with the zone's absolute rail line (centred at x = 8 px).
 * Gap divs with the surface background visually break the rail above and below
 * the dot, matching the breathing room of the zone's chevron arrows.
 */
export function NestedPointEntry({ item, isActive = false, onClick }: Props) {
	const name = featureName(item.feature);
	const desc = featureDesc(item.feature);

	return (
		<div
			role={onClick ? "button" : undefined}
			style={{
				display: "flex",
				gap: 10,
				marginBottom: 16,
				cursor: onClick ? "pointer" : undefined,
				background: isActive ? `${tokens.primary}0d` : undefined,
				borderRadius: 4,
			}}
			onClick={onClick}
		>
			<div
				style={{
					width: 16,
					flexShrink: 0,
					display: "flex",
					justifyContent: "center",
				}}
			>
				{/* Gap divs use the surface background to visually break the zone rail */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
					}}
				>
					<div
						style={{ width: 12, height: 4, background: tokens.surfaceLow }}
					/>
					<div
						style={{
							width: 10,
							height: 10,
							borderRadius: "50%",
							background: tokens.primary,
						}}
					/>
					<div
						style={{ width: 12, height: 4, background: tokens.surfaceLow }}
					/>
				</div>
			</div>
			<div style={{ flex: 1, paddingTop: 4, minWidth: 0 }}>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						gap: 4,
					}}
				>
					<span
						style={{
							fontFamily: fonts.label,
							fontSize: 12,
							fontWeight: 700,
							letterSpacing: "0.07em",
							textTransform: "uppercase",
							color: tokens.primary,
							lineHeight: 1.25,
						}}
					>
						{name}
					</span>
					<span
						style={{
							fontFamily: fonts.mono,
							fontSize: 12,
							color: tokens.outline,
							flexShrink: 0,
							lineHeight: 1.5,
						}}
					>
						{fmtKm(item.distM)}
					</span>
				</div>
				{desc && (
					<p
						style={{
							fontFamily: fonts.body,
							fontSize: 11,
							color: tokens.onSurfaceVariant,
							margin: "2px 0 0 0",
							lineHeight: 1.5,
						}}
					>
						{desc}
					</p>
				)}
				{isActive && <CoordsInfo coords={item.coords} />}
			</div>
		</div>
	);
}
