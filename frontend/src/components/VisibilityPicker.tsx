import Autocomplete, {
  type AutocompleteRenderValueGetItemProps,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { factLabelSx } from "@/components/Fact";
import type { Group, UserWithFollowStatus } from "@/lib/api";
import { useAllUsers } from "@/lib/hooks/useFollows";
import { useGroups } from "@/lib/hooks/useGroups";
import { theme } from "@/lib/theme";
import { VISIBILITY_LABEL, type VisibilityType } from "@/lib/visibility";

const { tokens } = theme;

const MIN_NAME_LETTERS = 2;

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
  /** Drops the "Visibility" label where a heading already names the choice. */
  hideLabel?: boolean;
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
  hideLabel,
}: Props) {
  const [userInput, setUserInput] = useState("");
  const { data: groups } = useGroups();
  const { data: users } = useAllUsers(value.type === "shared");

  const selectedGroups: Group[] = (groups ?? []).filter((g) =>
    value.groups.includes(g.id),
  );

  // Ids stay the stored value; a name not loaded yet shows as its id.
  const selectedUsers: UserWithFollowStatus[] = value.users.map(
    (id) =>
      users?.find((u) => u.id === id) ?? {
        id,
        username: id,
        incoming_pending: false,
      },
  );

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {!hideLabel && <Typography sx={factLabelSx}>Visibility</Typography>}
        <Box
          role="radiogroup"
          aria-label="Visibility"
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            maxWidth: 420,
          }}
        >
          {(["private", "shared", "public"] as const).map((t) => {
            const on = value.type === t;
            return (
              <ButtonBase
                key={t}
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ type: t })}
                sx={{
                  minHeight: tokens.touch.min,
                  borderRadius: `${tokens.radii.row}px`,
                  bgcolor: tokens.surface,
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  color: on ? tokens.onSurface : tokens.onSurfaceVariant,
                  boxShadow: on
                    ? `inset 0 0 0 2px ${tokens.primary}`
                    : `inset 0 0 0 1px ${tokens.outlineVariant}`,
                }}
              >
                {VISIBILITY_LABEL[t]}
              </ButtonBase>
            );
          })}
        </Box>
        {privateHint && value.type === "private" && (
          <Typography variant="body2" color="textSecondary">
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
            renderInput={(params) => <TextField {...params} label="Groups" />}
            renderValue={(
              val: Group[],
              getItemProps: AutocompleteRenderValueGetItemProps<true>,
            ) =>
              val.map((opt, idx) => (
                <Chip
                  {...getItemProps({ index: idx })}
                  key={opt.id}
                  label={opt.name}
                />
              ))
            }
          />

          <Autocomplete
            multiple
            // Names show from the second letter, so the whole user list is
            // never laid out. A server-side `q` filter on /users would stop
            // the client loading every account (see useAllUsers).
            open={userInput.trim().length >= MIN_NAME_LETTERS}
            popupIcon={null}
            options={users ?? []}
            getOptionLabel={(u) => u.username}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={selectedUsers}
            inputValue={userInput}
            onInputChange={(_, v, reason) => {
              if (reason !== "reset") setUserInput(v);
            }}
            onChange={(_, val) => {
              setUserInput("");
              onChange({ users: val.map((u) => u.id) });
            }}
            noOptionsText="Nobody by that name."
            renderInput={(params) => (
              <TextField
                {...params}
                label="People"
                helperText="Type a name to find someone."
              />
            )}
            renderValue={(
              val: UserWithFollowStatus[],
              getItemProps: AutocompleteRenderValueGetItemProps<true>,
            ) =>
              val.map((u, idx) => (
                <Chip
                  {...getItemProps({ index: idx })}
                  key={u.id}
                  label={u.username}
                />
              ))
            }
          />
        </>
      )}
    </>
  );
}
