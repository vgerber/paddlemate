import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

const OPTIONS = [
	{ label: "Any", value: "" },
	{ label: "I", value: 1 },
	{ label: "II", value: 2 },
	{ label: "III", value: 3 },
	{ label: "IV", value: 4 },
	{ label: "V", value: 5 },
	{ label: "VI", value: 6 },
	{ label: "X", value: 10 },
];

interface DifficultySelectProps {
	minDiff: number | "";
	maxDiff: number | "";
	onMinChange: (value: number | "") => void;
	onMaxChange: (value: number | "") => void;
}

export default function DifficultySelect({
	minDiff,
	maxDiff,
	onMinChange,
	onMaxChange,
}: DifficultySelectProps) {
	return (
		<Box sx={{ display: "flex", gap: 1 }}>
			<FormControl size="small" sx={{ minWidth: 100 }}>
				<InputLabel>Min grade</InputLabel>
				<Select
					label="Min grade"
					value={minDiff}
					onChange={(e) => onMinChange(e.target.value as number | "")}
				>
					{OPTIONS.map((o) => (
						<MenuItem key={o.label} value={o.value}>
							{o.label}
						</MenuItem>
					))}
				</Select>
			</FormControl>
			<FormControl size="small" sx={{ minWidth: 100 }}>
				<InputLabel>Max grade</InputLabel>
				<Select
					label="Max grade"
					value={maxDiff}
					onChange={(e) => onMaxChange(e.target.value as number | "")}
				>
					{OPTIONS.map((o) => (
						<MenuItem key={o.label} value={o.value}>
							{o.label}
						</MenuItem>
					))}
				</Select>
			</FormControl>
		</Box>
	);
}
