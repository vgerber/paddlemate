import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { type SectionWithFeatures, waterwaysApi } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { waterwayKeys } from "@/lib/hooks/useWaterways";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The open arrow is a button: full touch size, not the 28px default. */
const POPUP_INDICATOR = {
  popupIndicator: {
    sx: { width: tokens.touch.min, height: tokens.touch.min },
  },
};

interface Props {
  waterwayId: number | null;
  onWaterwayChange: (id: number | null) => void;
  /** Sections of the selected waterway; the caller loads them. */
  sections: SectionWithFeatures[];
  addedIds: Set<number>;
  onAdd: (section: SectionWithFeatures) => void;
  /** Rendered between the river search and the add-section picker. */
  children?: ReactNode;
}

/**
 * River search plus an add-section picker. Shared by the descent wizard and
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
  // The picker stays empty after a pick: the section moves to the list above.
  const [sectionInput, setSectionInput] = useState("");

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
          input.length < 2 ? "Type to search rivers" : "No results"
        }
        renderInput={(params) => <TextField {...params} label="Search river" />}
        slotProps={POPUP_INDICATOR}
      />

      {children}

      <Autocomplete
        key={waterwayId ?? "none"}
        options={unadded}
        getOptionLabel={(opt) => localizedName(opt.name, opt.names)}
        value={null}
        inputValue={sectionInput}
        onInputChange={(_, v, reason) => {
          if (reason !== "reset") setSectionInput(v);
        }}
        onChange={(_, val) => {
          if (!val) return;
          setSectionInput("");
          onAdd(val);
        }}
        disabled={sections.length === 0}
        noOptionsText={
          sections.length === 0 ? "Search a river first" : "All sections added"
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Add section"
            placeholder={
              sections.length === 0 ? "Search a river first" : undefined
            }
          />
        )}
        slotProps={POPUP_INDICATOR}
      />
    </>
  );
}
