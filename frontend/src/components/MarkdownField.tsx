import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import LinkIcon from "@mui/icons-material/Link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";
import { factLabelSx } from "@/components/Fact";
import MarkdownText from "@/components/MarkdownText";

/** Wrap the selection, or drop a placeholder in when there is none. */
function wrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): { text: string; caret: [number, number] } {
  const selected = value.slice(start, end) || placeholder;
  const text =
    value.slice(0, start) + before + selected + after + value.slice(end);
  return {
    text,
    caret: [start + before.length, start + before.length + selected.length],
  };
}

/** Prefix every line of the selection, the way a list button should. */
function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
) {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const to =
    value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end);
  const block = value
    .slice(from, to)
    .split("\n")
    .map((l) => (l.startsWith(prefix) ? l : prefix + l))
    .join("\n");
  return {
    text: value.slice(0, from) + block + value.slice(to),
    caret: [from, from + block.length] as [number, number],
  };
}

/**
 * A text field that takes Markdown, with the three marks people actually
 * reach for and a preview. Editing stays a plain textarea - Markdown's whole
 * point is that the source is readable - and the buttons are there so nobody
 * has to know the syntax to paste a link.
 */
export default function MarkdownField({
  label,
  value,
  onChange,
  placeholder,
  minRows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const apply = (
    fn: (
      v: string,
      s: number,
      e: number,
    ) => { text: string; caret: [number, number] },
  ) => {
    const el = ref.current;
    if (!el) return;
    const { text, caret } = fn(value, el.selectionStart, el.selectionEnd);
    onChange(text);
    // Put the caret back where the writer expects it, after React re-renders.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret[0], caret[1]);
    });
  };

  const marks: {
    key: string;
    title: string;
    icon: React.ReactNode;
    run: () => void;
  }[] = [
    {
      key: "bold",
      title: "Bold",
      icon: <FormatBoldIcon fontSize="small" />,
      run: () => apply((v, s, e) => wrap(v, s, e, "**", "**", "bold text")),
    },
    {
      key: "italic",
      title: "Italic",
      icon: <FormatItalicIcon fontSize="small" />,
      run: () => apply((v, s, e) => wrap(v, s, e, "_", "_", "italic text")),
    },
    {
      key: "link",
      title: "Link",
      icon: <LinkIcon fontSize="small" />,
      run: () =>
        apply((v, s, e) => {
          // A pasted URL becomes the target, not the label.
          const selected = v.slice(s, e);
          const isUrl = /^https?:\/\/\S+$/.test(selected.trim());
          return isUrl
            ? {
                text: `${v.slice(0, s)}[](${selected.trim()})${v.slice(e)}`,
                caret: [s + 1, s + 1],
              }
            : wrap(v, s, e, "[", "](https://)", "link text");
        }),
    },
    {
      key: "list",
      title: "Bulleted list",
      icon: <FormatListBulletedIcon fontSize="small" />,
      run: () => apply((v, s, e) => prefixLines(v, s, e, "- ")),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        <Typography sx={{ ...factLabelSx, flex: 1 }}>{label}</Typography>
        {marks.map((mark) => (
          <IconButton
            key={mark.key}
            size="small"
            title={mark.title}
            aria-label={mark.title}
            onClick={mark.run}
            disabled={preview}
          >
            {mark.icon}
          </IconButton>
        ))}
        <Button size="small" onClick={() => setPreview((p) => !p)}>
          {preview ? "Write" : "Preview"}
        </Button>
      </Box>

      {preview ? (
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            p: 1.5,
            minHeight: minRows * 24,
          }}
        >
          {value.trim() ? (
            <MarkdownText>{value}</MarkdownText>
          ) : (
            <Typography variant="body2" color="text.disabled">
              Nothing to preview yet.
            </Typography>
          )}
        </Box>
      ) : (
        <TextField
          inputRef={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          multiline
          minRows={minRows}
          fullWidth
          size="small"
        />
      )}

      <Typography sx={{ ...factLabelSx, mt: 0.5, display: "block" }}>
        Markdown: **bold**, _italic_, [text](https://...), - lists
      </Typography>
    </Box>
  );
}
