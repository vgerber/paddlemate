import Typography from "@mui/material/Typography";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

import { CoordsInfo } from "./CoordsInfo";
import { NestedPointEntry } from "./NestedPointEntry";
import { SubZoneEntry } from "./SubZoneEntry";
import type { ComputedFeature } from "./types";
import { featureDesc, featureName, fmtKm } from "./utils";

interface Props {
	item: ComputedFeature;
	nested: ComputedFeature[];
	isLast?: boolean;
	activeId?: number | null;
	onItemClick?: (item: ComputedFeature) => void;
}

/**
 * Renders a zone as a vertical bracket: a ↓ chevron at the start row and a ↑
 * chevron at the end row, connected by a faint rail line.
 *
 * The rail is `position: absolute` with `zIndex: -1` so it paints behind the
 * normal-flow dot elements of nested entries, which each sit in a 16 px left
 * column aligned with the rail centre (x = 8 px).
 */
export function ZoneEntry({
	item,
	nested,
	isLast = false,
	activeId,
	onItemClick,
}: Props) {
	const name = featureName(item.feature);
	const desc = featureDesc(item.feature);
	const isActive = activeId === item.feature.id;

	return (
		<div style={{ position: "relative", marginBottom: isLast ? 4 : 16 }}>
			{/* Rail line spanning from below the ↓ to above the ↑ */}
			<div
				style={{
					position: "absolute",
					left: 7,
					top: 13,
					bottom: 13,
					width: 2,
					background: tokens.secondary,
					opacity: 0.3,
					zIndex: -1,
				}}
			/>

			{/* Zone start row */}
			<div
				role={onItemClick ? "button" : undefined}
				style={{
					display: "flex",
					gap: 10,
					alignItems: "flex-start",
					paddingBottom: 16,
					cursor: onItemClick ? "pointer" : undefined,
					background: isActive ? `${tokens.secondary}0d` : undefined,
					borderRadius: 4,
				}}
				onClick={() => onItemClick?.(item)}
			>
				<div
					style={{
						width: 16,
						flexShrink: 0,
						display: "flex",
						justifyContent: "center",
						paddingTop: 3,
					}}
				>
					<svg
						aria-hidden="true"
						width="10"
						height="10"
						viewBox="0 0 10 10"
						fill="none"
					>
						<path
							d="M2 3.5 L5 6.5 L8 3.5"
							stroke={tokens.secondary}
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						paddingTop: 2,
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "flex-start",
							gap: 8,
						}}
					>
						<span
							style={{
								fontFamily: fonts.label,
								fontSize: 13,
								fontWeight: 900,
								letterSpacing: "0.2em",
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
								lineHeight: 1.4,
							}}
						>
							{fmtKm(item.startM)}
						</span>
					</div>
					{isActive && <CoordsInfo coords={item.coords} />}
				</div>
			</div>

			{desc && (
				<div style={{ paddingLeft: 26 }}>
					<p
						style={{
							fontFamily: fonts.body,
							fontSize: 12,
							color: tokens.onSurfaceVariant,
							margin: "0 0 6px 0",
							lineHeight: 1.5,
						}}
					>
						{desc}
					</p>
				</div>
			)}

			{nested.map((child) =>
				child.isZone ? (
					<SubZoneEntry
						key={child.feature.id}
						item={child}
						isActive={activeId === child.feature.id}
						onClick={() => onItemClick?.(child)}
					/>
				) : (
					<NestedPointEntry
						key={child.feature.id}
						item={child}
						isActive={activeId === child.feature.id}
						onClick={() => onItemClick?.(child)}
					/>
				),
			)}

			{/* Zone end row */}
			<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
				<div
					style={{
						width: 16,
						flexShrink: 0,
						display: "flex",
						justifyContent: "center",
					}}
				>
					<svg
						aria-hidden="true"
						width="10"
						height="10"
						viewBox="0 0 10 10"
						fill="none"
					>
						<path
							d="M2 6.5 L5 3.5 L8 6.5"
							stroke={tokens.secondary}
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
				<div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
					<span
						style={{
							fontFamily: fonts.mono,
							fontSize: 12,
							color: tokens.outline,
						}}
					>
						{fmtKm(item.endM)}
					</span>
				</div>
			</div>
		</div>
	);
}
