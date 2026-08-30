import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { Descent } from "@/lib/api";
import { uniqueSnapshotsBySeries } from "@/lib/descents";
import {
  durationLabel,
  formatDate,
  formatReading,
  formatTime,
  timeAgo,
} from "@/lib/format";
import { fonts } from "@/lib/theme";
import { levelConfig, maxLevel } from "@/lib/waterLevel";

export const VISIBILITY_ICONS = {
  private: <LockOutlinedIcon sx={{ fontSize: 13 }} />,
  shared: <GroupOutlinedIcon sx={{ fontSize: 13 }} />,
  public: <PublicOutlinedIcon sx={{ fontSize: 13 }} />,
};

interface DescentCardProps {
  descent: Descent;
  onClick?: () => void;
  showAuthor?: boolean;
}

export default function DescentCard({
  descent,
  onClick,
  showAuthor,
}: DescentCardProps) {
  const waterwayNames = [
    ...new Set(
      descent.sections
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => s.waterway_name)
        .filter(Boolean),
    ),
  ] as string[];

  const sectionNames = descent.sections
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.section_name)
    .filter(Boolean) as string[];

  const dateStr = formatDate(descent.start_time);
  const titleLine =
    descent.name ||
    (waterwayNames.length > 0 ? waterwayNames.join(" / ") : null) ||
    (sectionNames.length > 0 ? sectionNames.join(", ") : null) ||
    dateStr;
  const titleIsDate = titleLine === dateStr;

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 2,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick ? { bgcolor: "action.hover" } : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      {/* Title row */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "text.primary",
            letterSpacing: "0.02em",
            flex: 1,
          }}
        >
          {titleLine}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            color: "text.disabled",
            flexShrink: 0,
          }}
        >
          {VISIBILITY_ICONS[descent.visibility.type]}
          <Typography
            sx={{
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: fonts.label,
            }}
          >
            {descent.visibility.type}
          </Typography>
        </Box>
      </Box>

      {/* Author attribution (feed view) */}
      {showAuthor && descent.username && (
        <Typography
          sx={{
            fontSize: "0.6875rem",
            color: "text.disabled",
            fontFamily: fonts.label,
            letterSpacing: "0.04em",
          }}
        >
          {descent.username}
        </Typography>
      )}

      {/* Section names */}
      {descent.sections.length > 0 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          {sectionNames.length > 0 &&
            (descent.name || waterwayNames.length > 0) && (
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {sectionNames.join(", ")}
              </Typography>
            )}
          {descent.put_in_label && (
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {descent.put_in_label}
            </Typography>
          )}
        </Box>
      )}

      {/* Note preview */}
      {descent.note && (
        <Typography
          sx={{
            fontSize: "0.75rem",
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {descent.note}
        </Typography>
      )}

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mt: 0.25 }}>
        {(() => {
          const allSnapshots = descent.sections.flatMap((s) =>
            uniqueSnapshotsBySeries(s.water_snapshots ?? []),
          );
          if (allSnapshots.length === 0) return null;
          const level = maxLevel(allSnapshots.map((s) => s.level));
          const cfg = levelConfig[level];
          // One gauge behind every snapshot means one unambiguous reading -
          // show it like the section list does. Mixed gauges fall back to the
          // level letter, where a single number would be misleading.
          const sameGauge = allSnapshots.every(
            (s) => s.series_id === allSnapshots[0].series_id,
          );
          const reading = sameGauge
            ? (allSnapshots.find((s) => s.level === level && s.value != null) ??
              allSnapshots.find((s) => s.value != null))
            : undefined;
          return (
            <Chip
              label={
                reading?.value != null
                  ? formatReading(reading.value, reading.unit)
                  : cfg.label
              }
              size="small"
              variant={level === "empty" ? "outlined" : "filled"}
              sx={{
                fontSize: "0.625rem",
                height: 18,
                color: cfg.color,
                bgcolor: cfg.bgcolor,
                borderColor: "border" in cfg ? cfg.border : undefined,
              }}
            />
          );
        })()}
        {!titleIsDate && (
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontSize: "0.75rem",
              color: "primary.main",
            }}
          >
            {dateStr}
          </Typography>
        )}
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontSize: "0.6875rem",
            color: titleIsDate ? "primary.main" : "text.disabled",
          }}
        >
          {formatTime(descent.start_time)}
        </Typography>
        {durationLabel(descent.start_time, descent.end_time) && (
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontSize: "0.6875rem",
              color: "text.disabled",
            }}
          >
            {durationLabel(descent.start_time, descent.end_time)}
          </Typography>
        )}
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontSize: "0.6875rem",
            color: "text.disabled",
            ml: "auto",
          }}
        >
          {timeAgo(descent.start_time)}
        </Typography>
      </Box>
    </Box>
  );
}
