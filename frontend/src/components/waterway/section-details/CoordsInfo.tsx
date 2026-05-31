import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DoneIcon from "@mui/icons-material/Done";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import { useState } from "react";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

interface Props {
	coords: [number, number]; // [lng, lat]
}

/** Formatted coordinate pair with a Google Maps link and copy-to-clipboard button. */
export function CoordsInfo({ coords }: Props) {
	const [lng, lat] = coords;
	const [copied, setCopied] = useState(false);
	const url = `https://www.google.com/maps?q=${lat},${lng}`;

	function handleCopy(e: React.MouseEvent) {
		e.stopPropagation();
		navigator.clipboard.writeText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<div
			style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 4 }}
		>
			<span
				style={{
					fontFamily: fonts.mono,
					fontSize: 13,
					color: tokens.outline,
					letterSpacing: "0.03em",
				}}
			>
				{lat.toFixed(5)}, {lng.toFixed(5)}
			</span>
			<Box sx={{ flexGrow: 1 }}></Box>
			<IconButton
				title={copied ? "Copied!" : "Copy coordinates"}
				onClick={handleCopy}
				sx={{ color: copied ? tokens.primary : tokens.secondary }}
			>
				{copied ? <DoneIcon /> : <ContentCopyOutlinedIcon />}
			</IconButton>
			<IconButton
				title="Open in Google Maps"
				component="a"
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				onClick={(e: React.MouseEvent) => e.stopPropagation()}
				sx={{ color: tokens.secondary }}
			>
				<OpenInNewIcon />
			</IconButton>
		</div>
	);
}
