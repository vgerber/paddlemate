import Autocomplete, {
  type AutocompleteRenderValueGetItemProps,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type Group, groupsApi } from "@/lib/api";
import type { StepProps } from "./model";

/** Group and user pickers shown when visibility is "shared". */
export default function SharedVisibilityFields({ form, onChange }: StepProps) {
  const [userInput, setUserInput] = useState("");

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: groupsApi.list,
    staleTime: 60_000,
  });

  const selectedGroups: Group[] = (groups ?? []).filter((g) =>
    form.shared_groups.includes(g.id),
  );

  return (
    <>
      <Autocomplete
        multiple
        options={groups ?? []}
        getOptionLabel={(opt) => opt.name}
        value={selectedGroups}
        onChange={(_, val) => onChange({ shared_groups: val.map((g) => g.id) })}
        renderInput={(params) => (
          <TextField {...params} label="Groups" size="small" />
        )}
        renderValue={(
          value: Group[],
          getItemProps: AutocompleteRenderValueGetItemProps<true>,
        ) =>
          value.map((opt, idx) => (
            <Chip
              {...getItemProps({ index: idx })}
              key={opt.id}
              label={opt.name}
              size="small"
            />
          ))
        }
      />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <TextField
          label="Add user by ID"
          value={userInput}
          size="small"
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const t = userInput.trim();
              if (t && !form.shared_users.includes(t)) {
                onChange({ shared_users: [...form.shared_users, t] });
              }
              setUserInput("");
            }
          }}
          helperText="Press Enter to add"
        />
        {form.shared_users.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {form.shared_users.map((u) => (
              <Chip
                key={u}
                label={u}
                size="small"
                onDelete={() =>
                  onChange({
                    shared_users: form.shared_users.filter((x) => x !== u),
                  })
                }
              />
            ))}
          </Box>
        )}
      </Box>
    </>
  );
}
