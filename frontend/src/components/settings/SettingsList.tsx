import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { alphas, theme } from "@/lib/theme";
import { GROUPS, type GroupId } from "./groups";

const { tokens } = theme;

/** The settings sections as soft rows. `selected` marks the open one on a
 * desktop; a phone has none selected and shows a chevron instead. */
export default function SettingsList({
  selected,
  onOpen,
}: {
  selected?: GroupId;
  onOpen: (id: GroupId) => void;
}) {
  return (
    <Box
      data-testid="settings-list"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        p: 1,
        bgcolor: { md: tokens.surfaceLow },
      }}
    >
      {GROUPS.map((g) => (
        <ListItemButton
          key={g.id}
          selected={g.id === selected}
          onClick={() => onOpen(g.id)}
          sx={{
            borderRadius: `${tokens.radii.md}px`,
            gap: 1,
            "&.Mui-selected, &.Mui-selected:hover": {
              outline: `1px solid ${tokens.primary}${alphas.border}`,
            },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>
              {g.label}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {g.hint}
            </Typography>
          </Box>
          <ChevronRightIcon
            sx={{ color: "text.disabled", display: { md: "none" } }}
          />
        </ListItemButton>
      ))}
    </Box>
  );
}
