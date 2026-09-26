import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { type SectionWithFeatures, waterwaysApi } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { waterwayKeys } from "@/lib/hooks/useWaterways";
import { localizedName } from "@/lib/localization";

interface Props {
  waterwayId: number | null;
  onWaterwayChange: (id: number | null) => void;
  /** Sections of the selected waterway; the caller loads them. */
  sections: SectionWithFeatures[];
  addedIds: Set<number>;
  onAdd: (section: SectionWithFeatures) => void;
  /** Rendered between the waterway search and the add-section picker. */
  children?: ReactNode;
}

/**
 * Waterway search plus an add-section picker. Shared by the descent wizard and
 * a trip stay's watch list, which build the same kind of ordered list.
 */
export default function SectionAdder({
  waterwayId,
  onWaterwayChange,
  sections,
  addedIds,
  onAdd,
  children,
}: Props) {
  const [input, setInput] = useState("");

  // Shares the map page's cache keys, so a waterway browsed there loads
  // instantly here (and vice versa). Debounced to one request per pause.
  const debounced = useDebouncedValue(input, 300);
  const filters = { name: debounced, per_page: 10 };
  const { data: results, isFetching: searching } = useQuery({
    queryKey: waterwayKeys.lists(filters),
    queryFn: ({ signal }) => waterwaysApi.list(filters, signal),
    enabled: debounced.trim().length >= 2,
    staleTime: 60_000,
  });

  const unadded = sections.filter((s) => !addedIds.has(s.id));

  return (
    <>
      <Autocomplete
        options={results?.items ?? []}
        getOptionLabel={(opt) => opt.name}
        inputValue={input}
        onInputChange={(_, v) => setInput(v)}
        onChange={(_, val) => onWaterwayChange(val?.id ?? null)}
        loading={searching}
        noOptionsText={
          input.length < 2 ? "Type to search waterways" : "No results"
        }
        renderInput={(params) => (
          <TextField {...params} label="Search waterway" />
        )}
      />

      {children}

      <Autocomplete
        key={waterwayId ?? "none"}
        options={unadded}
        getOptionLabel={(opt) => localizedName(opt.name, opt.names)}
        value={null}
        onChange={(_, val) => val && onAdd(val)}
        disabled={sections.length === 0}
        noOptionsText={
          sections.length === 0
            ? "Search a waterway first"
            : "All sections added"
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Add section"
            size="small"
            placeholder={
              sections.length === 0 ? "Search a waterway first" : undefined
            }
          />
        )}
      />
    </>
  );
}
