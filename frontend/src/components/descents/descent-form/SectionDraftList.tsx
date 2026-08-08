import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { fonts } from "@/lib/theme";
import type { SectionDraft } from "./model";

interface Props {
  sections: SectionDraft[];
  onChange: (sections: SectionDraft[]) => void;
}

/** Ordered list of picked sections with move up/down and remove controls. */
export default function SectionDraftList({ sections, onChange }: Props) {
  if (sections.length === 0) return null;

  function moveSection(idx: number, dir: -1 | 1) {
    const arr = [...sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    onChange(arr);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {sections.map((s, i) => (
        <Box
          key={s.key}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 0.5,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontFamily: fonts.label,
              color: "text.disabled",
              minWidth: 20,
            }}
          >
            {i + 1}
          </Typography>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {s.display_name}
          </Typography>
          <IconButton
            size="small"
            onClick={() => moveSection(i, -1)}
            disabled={i === 0}
          >
            <ArrowUpwardIcon fontSize="inherit" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => moveSection(i, 1)}
            disabled={i === sections.length - 1}
          >
            <ArrowDownwardIcon fontSize="inherit" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onChange(sections.filter((_, j) => j !== i))}
          >
            <DeleteOutlinedIcon fontSize="inherit" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}
