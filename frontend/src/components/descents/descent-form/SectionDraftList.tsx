import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import { DeleteIcon, MoveDownIcon, MoveUpIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import type { SectionDraft } from "./model";

const { tokens } = theme;

interface Props {
  sections: SectionDraft[];
  onChange: (sections: SectionDraft[]) => void;
}

/** The picked sections in paddled order, one card each with a single menu to
 * move or remove it. */
export default function SectionDraftList({ sections, onChange }: Props) {
  if (sections.length === 0) return null;

  function moveSection(idx: number, dir: -1 | 1) {
    const arr = [...sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    onChange(arr);
  }

  function actions(i: number): RowAction[] {
    return [
      ...(i > 0
        ? [
            {
              label: "Move up",
              icon: <MoveUpIcon />,
              onClick: () => moveSection(i, -1),
            },
          ]
        : []),
      ...(i < sections.length - 1
        ? [
            {
              label: "Move down",
              icon: <MoveDownIcon />,
              onClick: () => moveSection(i, 1),
            },
          ]
        : []),
      {
        label: "Remove",
        icon: <DeleteIcon />,
        danger: true,
        onClick: () => onChange(sections.filter((_, j) => j !== i)),
      },
    ];
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {sections.map((s, i) => (
        <Box
          key={s.key}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pl: 1.5,
            pr: 0.5,
            minHeight: 56,
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e1,
          }}
        >
          <Typography
            sx={{
              width: 20,
              color: "text.secondary",
              fontSize: "0.8125rem",
              fontWeight: 600,
            }}
          >
            {i + 1}
          </Typography>
          <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
            {s.display_name}
          </Typography>
          <RowMenu actions={actions(i)} name="Section" />
        </Box>
      ))}
    </Box>
  );
}
