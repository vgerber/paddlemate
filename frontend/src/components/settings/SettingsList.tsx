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
        gap: 0.75,
        p: 1.5,
        px: { md: 0 },
      }}
    >
      {GROUPS.map((g) => (
        <ListItemButton
          key={g.id}
          selected={g.id === selected}
          onClick={() => onOpen(g.id)}
          sx={{
            borderRadius: `${tokens.radii.sm + 2}px`,
            gap: 1,
            py: 1.25,
            px: 1.75,
            "&.Mui-selected, &.Mui-selected:hover": {
              bgcolor: `${tokens.primary}${alphas.wash}`,
              boxShadow: `inset 3px 0 0 ${tokens.primary}, ${tokens.elevation.e1}`,
            },
            "&.Mui-focusVisible": {
              outline: `2px solid ${tokens.primary}`,
              outlineOffset: 2,
            },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 500,
                fontSize: "0.9375rem",
                lineHeight: "20px",
              }}
            >
              {g.label}
            </Typography>
            <Typography
              color="textSecondary"
              sx={{ fontSize: "0.8125rem", lineHeight: "18px" }}
            >
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
