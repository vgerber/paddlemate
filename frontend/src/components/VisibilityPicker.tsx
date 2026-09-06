import Autocomplete, {
  type AutocompleteRenderValueGetItemProps,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { Group } from "@/lib/api";
import { useGroups } from "@/lib/hooks/useGroups";
import { VISIBILITY_LABEL, type VisibilityType } from "@/lib/visibility";

export interface Audience {
  type: VisibilityType;
  groups: number[];
  users: string[];
}

interface Props {
  value: Audience;
  onChange: (patch: Partial<Audience>) => void;
  /** What the choice applies to, shown under the toggle. */
  privateHint?: string;
}

/**
 * Visibility toggle plus the group and user pickers that appear when it is
 * "shared". Descents and trips share the same visibility model, so they share
 * this control.
 */
export default function VisibilityPicker({
  value,
  onChange,
  privateHint,
}: Props) {
  const [userInput, setUserInput] = useState("");
  const { data: groups } = useGroups();

  const selectedGroups: Group[] = (groups ?? []).filter((g) =>
    value.groups.includes(g.id),
  );

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography variant="overline" sx={{ lineHeight: 1 }}>
          Visibility
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={value.type}
          onChange={(_, v: VisibilityType | null) => v && onChange({ type: v })}
          size="small"
        >
          {(["private", "shared", "public"] as const).map((t) => (
            <ToggleButton key={t} value={t}>
              {VISIBILITY_LABEL[t]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {privateHint && value.type === "private" && (
          <Typography variant="caption" color="text.secondary">
            {privateHint}
          </Typography>
        )}
      </Box>

      {value.type === "shared" && (
        <>
          <Autocomplete
            multiple
            options={groups ?? []}
            getOptionLabel={(opt) => opt.name}
            value={selectedGroups}
            onChange={(_, val) => onChange({ groups: val.map((g) => g.id) })}
            renderInput={(params) => (
              <TextField {...params} label="Groups" size="small" />
            )}
            renderValue={(
              val: Group[],
              getItemProps: AutocompleteRenderValueGetItemProps<true>,
            ) =>
              val.map((opt, idx) => (
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
                if (e.key !== "Enter") return;
                e.preventDefault();
                const t = userInput.trim();
                if (t && !value.users.includes(t)) {
                  onChange({ users: [...value.users, t] });
                }
                setUserInput("");
              }}
              helperText="Press Enter to add"
            />
            {value.users.length > 0 && (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {value.users.map((u) => (
                  <Chip
                    key={u}
                    label={u}
                    size="small"
                    onDelete={() =>
                      onChange({ users: value.users.filter((x) => x !== u) })
                    }
                  />
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </>
  );
}
