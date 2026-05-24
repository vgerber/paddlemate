import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { waterwaysApi } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

export interface SectionResult {
	sectionId: number;
	sectionName: string;
	waterwayId: number;
	waterwayName: string;
}

interface SectionSearchInputProps {
	onAdd: (result: SectionResult) => void;
}

export default function SectionSearchInput({ onAdd }: SectionSearchInputProps) {
	const [waterwayQuery, setWaterwayQuery] = useState("");
	const [selectedWaterwayId, setSelectedWaterwayId] = useState<number | null>(
		null,
	);

	const debouncedQuery = useDebouncedValue(waterwayQuery, 300);

	const { data: waterwayPage, isFetching: searchingWaterways } = useQuery({
		queryKey: ["waterway-search-descent", debouncedQuery],
		queryFn: () => waterwaysApi.list({ name: debouncedQuery, per_page: 10 }),
		enabled: debouncedQuery.length >= 2,
	});

	const { data: waterwayDetail, isFetching: loadingSections } = useQuery({
		queryKey: ["waterway-detail-descent", selectedWaterwayId],
		queryFn: () => waterwaysApi.get(selectedWaterwayId as number),
		enabled: selectedWaterwayId !== null,
	});

	const waterwayOptions = waterwayPage?.items ?? [];
	const sectionOptions = waterwayDetail?.sections ?? [];
	const selectedWaterway =
		waterwayOptions.find((w) => w.id === selectedWaterwayId) ??
		(waterwayDetail
			? { id: waterwayDetail.id, name: waterwayDetail.name }
			: null);

	const inputSx = {
		"& .MuiInputBase-root": { borderRadius: 0 },
		"& label": { fontSize: "0.7rem", letterSpacing: "0.08em" },
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
			<Autocomplete
				size="small"
				options={waterwayOptions}
				getOptionLabel={(o) => o.name}
				filterOptions={(x) => x}
				loading={searchingWaterways}
				inputValue={waterwayQuery}
				onInputChange={(_, val) => {
					setWaterwayQuery(val);
					if (!val) setSelectedWaterwayId(null);
				}}
				onChange={(_, val) => setSelectedWaterwayId(val?.id ?? null)}
				renderInput={(params) => (
					<TextField
						{...params}
						label="SEARCH WATERWAY"
						variant="filled"
						sx={inputSx}
					/>
				)}
				renderOption={(props, option) => (
					<Box component="li" {...props} key={option.id}>
						<Typography sx={{ fontSize: "0.8rem" }}>{option.name}</Typography>
					</Box>
				)}
			/>

			{selectedWaterwayId !== null && (
				<Autocomplete
					size="small"
					options={sectionOptions}
					getOptionLabel={(s) => s.name}
					loading={loadingSections}
					onChange={(_, val) => {
						if (val && selectedWaterway) {
							onAdd({
								sectionId: val.id,
								sectionName: val.name,
								waterwayId: selectedWaterwayId,
								waterwayName: selectedWaterway.name,
							});
							setWaterwayQuery("");
							setSelectedWaterwayId(null);
						}
					}}
					renderInput={(params) => (
						<TextField
							{...params}
							label="SELECT SECTION"
							variant="filled"
							sx={inputSx}
						/>
					)}
					renderOption={(props, option) => (
						<Box component="li" {...props} key={option.id}>
							<Typography sx={{ fontSize: "0.8rem" }}>{option.name}</Typography>
						</Box>
					)}
				/>
			)}
		</Box>
	);
}
