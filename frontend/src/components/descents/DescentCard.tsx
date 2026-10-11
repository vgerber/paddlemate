import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { LevelPill } from "@/components/WaterLevelChip";
import type { Descent } from "@/lib/api";
import { durationLabel, formatDate, formatTime, timeAgo } from "@/lib/format";
import { theme } from "@/lib/theme";
import { levelAtTime } from "./levelAtTime";

const { tokens } = theme;

const VISIBILITY = {
  private: { icon: LockOutlinedIcon, label: "Private" },
  shared: { icon: GroupOutlinedIcon, label: "Shared" },
  public: { icon: PublicOutlinedIcon, label: "Public" },
} as const;

/** Who can see a log: an icon and one plain word. */
export function VisibilityTag({
  type,
}: {
  type: Descent["visibility"]["type"];
}) {
  const { icon: Icon, label } = VISIBILITY[type];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
        color: "text.secondary",
        fontSize: "0.75rem",
        fontWeight: 500,
      }}
    >
      <Icon sx={{ fontSize: 14 }} />
      {label}
    </Box>
  );
}

interface DescentCardProps {
  descent: Descent;
  onClick?: () => void;
  showAuthor?: boolean;
  /** The list supplies the card and the side padding - used where a row
   * sits inside a card of its own. */
  flush?: boolean;
  /** Marks the row the desktop detail pane is showing. */
  selected?: boolean;
}

const line = { display: "block", minWidth: 0 } as const;

export default function DescentCard({
  descent,
  onClick,
  showAuthor,
  flush,
  selected,
}: DescentCardProps) {
  const sections = descent.sections
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const waterwayNames = [
    ...new Set(sections.map((s) => s.waterway_name).filter(Boolean)),
  ] as string[];
  const sectionNames = sections
    .map((s) => s.section_name)
    .filter(Boolean) as string[];

  const dateStr = formatDate(descent.start_time);
  const title =
    descent.name ||
    (waterwayNames.length > 0 ? waterwayNames.join(" / ") : null) ||
    (sectionNames.length > 0 ? sectionNames.join(", ") : null) ||
    dateStr;
  const duration = durationLabel(descent.start_time, descent.end_time);
  const level = levelAtTime(descent.sections);
  const meta = [dateStr, formatTime(descent.start_time), duration]
    .filter(Boolean)
    .join(" · ");
  const subline = [
    ...(descent.name || waterwayNames.length > 0
      ? [sectionNames.join(", ")]
      : []),
    descent.put_in_label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ButtonBase
      data-testid="descent-card"
      component={onClick ? "button" : "div"}
      onClick={onClick}
      focusRipple
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        columnGap: 1.5,
        rowGap: 0.25,
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        boxSizing: "border-box",
        minHeight: 56,
        px: flush ? 0 : 1.75,
        py: flush ? 1.5 : 1.5,
        font: "inherit",
        color: "text.primary",
        cursor: onClick ? "pointer" : "default",
        ...(flush
          ? { bgcolor: "transparent" }
          : {
              bgcolor: tokens.surface,
              border: 0,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: selected
                ? `${tokens.elevation.e1}, 0 0 0 2px ${tokens.primary}`
                : tokens.elevation.e1,
            }),
        ...(flush && selected && { bgcolor: "action.selected" }),
      }}
    >
      <Box
        component="span"
        sx={{
          ...line,
          fontSize: "0.9375rem",
          fontWeight: 600,
          lineHeight: 1.33,
        }}
      >
        {title}
      </Box>
      <VisibilityTag type={descent.visibility.type} />

      {showAuthor && descent.username && (
        <Box
          component="span"
          sx={{
            ...line,
            gridColumn: "1 / -1",
            fontSize: "0.75rem",
            color: "text.secondary",
          }}
        >
          {descent.username}
        </Box>
      )}

      {subline && (
        <Box
          component="span"
          sx={{ ...line, gridColumn: "1 / -1", fontSize: "0.875rem" }}
        >
          {subline}
        </Box>
      )}

      {descent.note && (
        <Box
          component="span"
          sx={{
            ...line,
            gridColumn: "1 / -1",
            fontSize: "0.8125rem",
            color: "text.secondary",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {descent.note}
        </Box>
      )}

      <Box
        component="span"
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          columnGap: 1.25,
          minHeight: 24,
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "text.secondary",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {level && <LevelPill level={level.level}>{level.label}</LevelPill>}
        {meta}
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "text.secondary",
          justifySelf: "end",
        }}
      >
        {timeAgo(descent.start_time)}
      </Box>
    </ButtonBase>
  );
}
