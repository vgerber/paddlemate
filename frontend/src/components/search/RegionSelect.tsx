import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { Region, RegionKind } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useRegionSearch } from "@/lib/hooks/useRegions";
import ListGroupHeader from "./ListGroupHeader";

const GROUP_LABELS: Record<RegionKind, string> = {
  valley: "Valleys",
  district: "Districts",
  state: "States",
  range: "Mountain ranges",
  country: "Countries",
};

interface RegionSelectProps {
  region: Region | null;
  onChange: (region: Region | null) => void;
}

/** Picks the region to search in. Only regions with an imported outline are
 * offered - the map draws that outline and the search runs against it. */
export default function RegionSelect({ region, onChange }: RegionSelectProps) {
  // The input text stays uncontrolled so a region restored from the URL
  // shows its name without this component having to seed the field.
  const [input, setInput] = useState("");
  const debouncedInput = useDebouncedValue(input);
  const { data: options = [], isFetching } = useRegionSearch(debouncedInput);

  return (
    <Autocomplete
      value={region}
      onChange={(_, value) => onChange(value)}
      onInputChange={(_, value) => setInput(value)}
      options={options}
      loading={isFetching}
      size="small"
      autoHighlight
      // The catalog is small and the server already ranks and folds
      // diacritics; filtering again here would only drop its matches.
      filterOptions={(all) => all}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      getOptionLabel={(option) => option.name}
      groupBy={(option) => option.kind}
      noOptionsText={
        debouncedInput.trim().length >= 2
          ? "No regions found."
          : "Type a valley, district, state or range"
      }
      renderGroup={(params) => (
        <li key={params.key}>
          <ListGroupHeader label={GROUP_LABELS[params.group as RegionKind]} />
          <Box component="ul" sx={{ p: 0, m: 0 }}>
            {params.children}
          </Box>
        </li>
      )}
      renderOption={(props, option) => {
        const { key, ...liProps } = props;
        return (
          <Box component="li" key={key} {...liProps} sx={{ gap: 1 }}>
            {/* Leading, not trailing: a list of valley names says nothing
                about where they are until the country is read first. */}
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ width: 22, flexShrink: 0 }}
            >
              {option.country ?? "--"}
            </Typography>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
              {option.name}
            </Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} placeholder="Search regions…" />
      )}
    />
  );
}
