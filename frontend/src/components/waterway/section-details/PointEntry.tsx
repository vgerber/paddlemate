import Typography from "@mui/material/Typography";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

import { CoordsInfo } from "./CoordsInfo";
import type { ComputedFeature } from "./types";
import { featureDesc, featureName, fmtKm } from "./utils";

interface Props {
	item: ComputedFeature;
	isLast?: boolean;
	isActive?: boolean;
	onClick?: () => void;
}

export function PointEntry({
	item,
	isLast = false,
	isActive = false,
	onClick,
}: Props) {
	const name = featureName(item.feature);
	const desc = featureDesc(item.feature);

	return (
		<div
			role={onClick ? "button" : undefined}
			style={{
				display: "flex",
				gap: 10,
				cursor: onClick ? "pointer" : undefined,
				background: isActive ? `${tokens.primary}0d` : undefined,
				borderRadius: 4,
			}}
			onClick={onClick}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					width: 16,
					flexShrink: 0,
					paddingTop: 3,
				}}
			>
				<div
					style={{
						width: 12,
						height: 12,
						borderRadius: "50%",
						background: tokens.primary,
						flexShrink: 0,
						boxShadow: `0 0 10px ${tokens.primary}99, 0 0 4px ${tokens.primary}`,
						marginBottom: 4,
					}}
				/>
				{!isLast && (
					<div
						style={{
							width: 2,
							flex: 1,
							minHeight: 20,
							background: tokens.outline,
							opacity: 0.45,
							marginTop: 4,
						}}
					/>
				)}
			</div>

			<div
				style={{
					flex: 1,
					paddingBottom: isLast ? 4 : 20,
					minWidth: 0,
					minHeight: 28,
				}}
			>
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
							fontSize: 13,
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
							fontSize: 12,
							color: tokens.onSurfaceVariant,
							margin: "4px 0 0 0",
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
