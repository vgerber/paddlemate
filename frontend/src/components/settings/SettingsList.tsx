import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { openRowSx } from "@/components/canvas/flatRow";
import { phoneRowPad } from "@/components/phone/phoneGrid";
import { ChevronRightIcon } from "@/lib/icons";
import { focusRingSx } from "@/lib/theme/focusRing";
import { theme } from "@/lib/theme/theme";
import type { GroupId } from "./groups";

const { tokens } = theme;

/** The settings sections as soft rows. `selected` marks the open one on a
 * desktop; a phone has none selected and shows a chevron instead. */
export default function SettingsList({
  selected,
  onOpen,
  groups,
}: {
  groups: readonly { id: GroupId; label: string; hint: string }[];
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
      {groups.map((g) => (
        <ListItemButton
          key={g.id}
          selected={g.id === selected}
          onClick={() => onOpen(g.id)}
          sx={{
            borderRadius: `${tokens.radii.row}px`,
            gap: 1,
            py: 1.25,
            px: 1.75,
            ...phoneRowPad,
            "&.Mui-selected, &.Mui-selected:hover": openRowSx(true),
            ...focusRingSx(),
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
