import Typography from "@mui/material/Typography";
import { CoordsInfo } from "./CoordsInfo";
import { fonts, tokens } from "./tokens";
import type { ComputedFeature } from "./types";
import { featureDesc, featureName, fmtKm } from "./utils";

interface Props {
	item: ComputedFeature;
	isActive?: boolean;
	onClick?: () => void;
}

export function SubZoneEntry({ item, isActive = false, onClick }: Props) {
	const name = featureName(item.feature);
	const desc = featureDesc(item.feature);

	return (
		<div
			role={onClick ? "button" : undefined}
			style={{
				display: "flex",
				gap: 10,
				marginBottom: 8,
				cursor: onClick ? "pointer" : undefined,
				background: isActive ? `${tokens.secondary}0d` : undefined,
				borderRadius: 4,
			}}
			onClick={onClick}
		>
			<div
				style={{
					width: 2,
					borderRadius: 999,
					background: `${tokens.secondary}80`,
					flexShrink: 0,
				}}
			/>
			<div style={{ flex: 1, paddingBottom: 2, minWidth: 0 }}>
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
							color: tokens.secondary,
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
