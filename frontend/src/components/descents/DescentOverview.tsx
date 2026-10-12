import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Fact, { factLabelSx, valueSx } from "@/components/Fact";
import TimelineRail from "@/components/TimelineRail";
import { LevelPill } from "@/components/WaterLevelChip";
import type { Descent } from "@/lib/api";
import { durationLabel, formatDate, formatTime } from "@/lib/format";
import { levelAtTime } from "./levelAtTime";

function Stop({
  title,
  iso,
  place,
  withDate,
  isLast,
}: {
  title: string;
  iso: string;
  place?: string | null;
  /** A multi-day log names the day as well as the time. */
  withDate: boolean;
  isLast?: boolean;
}) {
  const when = withDate
    ? `${formatDate(iso)} ${formatTime(iso)}`
    : formatTime(iso);
  return (
    <Box data-testid="log-stop" sx={{ display: "flex", gap: 1.5 }}>
      <TimelineRail isLast={isLast} />
      <Box sx={{ pb: isLast ? 0 : 1.5, minWidth: 0 }}>
        <Typography sx={valueSx}>{title}</Typography>
        <Typography sx={{ ...factLabelSx, fontWeight: 400 }}>
          {[when, place].filter(Boolean).join(" · ")}
        </Typography>
      </Box>
    </Box>
  );
}

/** A log on the desktop card: how long, over what, at which level, then the
 * run from put-in to take-out. */
export default function DescentOverview({ descent }: { descent: Descent }) {
  const sections = [...descent.sections].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const names = sections
    .map((s) => s.section_name)
    .filter((n): n is string => !!n);
  const level = levelAtTime(descent.sections);
  const duration = durationLabel(descent.start_time, descent.end_time);
  const multiDay =
    descent.start_time.slice(0, 10) !== descent.end_time.slice(0, 10);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Box
        data-testid="log-facts"
        sx={{ display: "flex", flexWrap: "wrap", columnGap: 4, rowGap: 1.5 }}
      >
        {duration && <Fact label="Duration" value={duration} />}
        {names.length > 0 && <Fact label="Sections" value={names.join(", ")} />}
        {level && (
          <Fact
            label="Level"
            value={<LevelPill level={level.level}>{level.label}</LevelPill>}
          />
        )}
      </Box>
      <Box data-testid="log-timeline">
        <Stop
          title="Put in"
          iso={descent.start_time}
          place={descent.put_in_label ?? names[0]}
          withDate={multiDay}
        />
        <Stop
          title="Take out"
          iso={descent.end_time}
          place={descent.take_out_label ?? names[names.length - 1]}
          withDate={multiDay}
          isLast
        />
      </Box>
    </Box>
  );
}
