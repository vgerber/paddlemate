import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { factLabelSx } from "@/components/Fact";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { Trip } from "@/lib/api";
import { formatDate, todayIso } from "@/lib/format";
import { useTripTimeline } from "@/lib/hooks/useTrips";
import { durations } from "@/lib/motion";
import { alphas, fonts, theme } from "@/lib/theme";
import {
  type PaddledRiver,
  paddledByRiver,
  type TripDay,
} from "@/lib/tripTimeline";
import DayDetail, { type DayActions } from "./DayDetail";
import {
  EVENT_ICON_COLUMN,
  EventIcon,
  EventText,
  eventKey,
  eventLabels,
} from "./eventLabels";
import PlanCalendar from "./PlanCalendar";
import { dayAtScroll } from "./planWeek";

const { tokens } = theme;

// Ink at 22%: the month's veil over the list. alphas has no step this light.
const MONTH_SCRIM = "38";

/**
 * The trip as it runs: the week pinned above, one card per day below, with
 * who turned up, where the group was based and what got paddled. Days before
 * the start count backwards, so an early arrival reads as Day -1.
 *
 * A day is the unit you act on, and it opens where it sits: the plan stays on
 * screen around it, so moving between days costs nothing.
 */
export default function TripTimeline({
  trip,
  openDay,
  onToggleDay,
  actions,
}: {
  trip: Trip;
  /** The day currently expanded, if any. */
  openDay: string | null;
  onToggleDay: (date: string) => void;
  actions: DayActions;
}) {
  const { days, isLoading } = useTripTimeline(trip);
  const today = todayIso();
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  // After a jump the list may not be able to scroll the day all the way to
  // the top; the jump stays the current day until the reader scrolls again.
  const jumped = useRef(false);

  const planned = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const withEntries = useMemo(
    () => new Set(days.filter((d) => d.events.length > 0).map((d) => d.date)),
    [days],
  );
  const shown = current ?? days[0]?.date ?? today;

  const jumpTo = useCallback((date: string) => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!el || !card) return;
    jumped.current = true;
    setCurrent(date);
    el.scrollTo({ top: card.offsetTop - el.offsetTop - 8 });
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || jumped.current) return;
    const tops = Array.from(
      el.querySelectorAll<HTMLElement>("[data-testid=plan-day]"),
    ).map((c) => ({
      date: c.dataset.date ?? "",
      top: c.offsetTop - el.offsetTop - 8,
    }));
    const date = dayAtScroll(tops, el.scrollTop);
    if (date) setCurrent(date);
  };

  // Reading again (a finger or the wheel) hands the strip back to the scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroller only mounts once loading ends
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const release = () => {
      jumped.current = false;
    };
    el.addEventListener("wheel", release, { passive: true });
    el.addEventListener("touchstart", release, { passive: true });
    return () => {
      el.removeEventListener("wheel", release);
      el.removeEventListener("touchstart", release);
    };
  }, [isLoading]);

  if (isLoading) return <LoadingBox size={40} pt={6} />;

  if (days.length === 0) {
    return (
      <EmptyState
        icon={<EventNoteOutlinedIcon />}
        title="Nothing on the plan yet."
        caption="Add a day to say when you arrive, where you are based, or what you paddled."
        py={6}
      />
    );
  }

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {monthOpen && (
        <Box
          data-testid="month-scrim"
          onClick={() => setMonthOpen(false)}
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            bgcolor: `${tokens.onSurface}${MONTH_SCRIM}`,
          }}
        />
      )}
      <PlanCalendar
        current={shown}
        today={today}
        from={trip.start_date}
        to={trip.end_date ?? null}
        planned={planned}
        withEntries={withEntries}
        open={monthOpen}
        onOpenChange={setMonthOpen}
        onPick={jumpTo}
      />
      <Box
        ref={scroller}
        data-testid="plan-scroll"
        onScroll={onScroll}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          p: 1.5,
          // Leave room so the FAB never covers the last day.
          pb: { xs: 12, md: 1.5 },
        }}
      >
        {days.map((day) => (
          <DayEntry
            key={day.date}
            day={day}
            today={today}
            isOpen={day.date === openDay}
            actions={actions}
            onToggle={() => onToggleDay(day.date)}
          />
        ))}
      </Box>
    </Box>
  );
}

function DayEntry({
  day,
  today,
  isOpen,
  actions,
  onToggle,
}: {
  day: TripDay;
  today: string;
  isOpen: boolean;
  actions: DayActions;
  onToggle: () => void;
}) {
  // A day still ahead is a plan, not a record: it sits outlined, not raised.
  const planned = day.date > today;
  const isToday = day.date === today;
  const plans = day.events.filter((e) => e.kind !== "paddled");
  const { rivers, unsectioned } = paddledByRiver(day.events);

  return (
    <Box
      data-testid="plan-day"
      data-date={day.date}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={isOpen}
      aria-label={`Day ${day.day}, ${formatDate(day.date)}`}
      sx={{
        flexShrink: 0,
        cursor: "pointer",
        textAlign: "left",
        px: 1.75,
        py: 1.5,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: planned ? "transparent" : tokens.surface,
        boxShadow: isToday
          ? `inset 0 0 0 2px ${tokens.primary}, ${tokens.elevation.e1}`
          : planned
            ? `inset 0 0 0 1px ${tokens.outlineVariant}`
            : tokens.elevation.e1,
        outlineOffset: 2,
        ...(isOpen ? { bgcolor: `${tokens.primary}${alphas.tint}` } : {}),
      }}
    >
      <Stack direction="row" sx={{ alignItems: "baseline", gap: 1 }}>
        <Typography
          component="span"
          sx={{
            fontFamily: fonts.label,
            fontSize: 15,
            fontWeight: 700,
            flex: 1,
          }}
        >
          Day {day.day}
          {isToday && (
            <Box
              component="span"
              sx={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                bgcolor: tokens.primary,
                ml: 1,
                verticalAlign: "middle",
              }}
            />
          )}
        </Typography>
        <Typography
          component="span"
          sx={{
            fontFamily: fonts.label,
            fontSize: 13,
            fontWeight: 500,
            color: "text.secondary",
            flexShrink: 0,
          }}
        >
          {formatDate(day.date, { weekday: true })}
        </Typography>
      </Stack>

      <Collapse in={!isOpen} timeout={durations.base}>
        <Stack direction="column" sx={{ gap: 1, mt: 1 }}>
          {day.events.length === 0 && (
            <Typography sx={{ ...factLabelSx, pl: `${EVENT_ICON_COLUMN}px` }}>
              Rest
            </Typography>
          )}

          {plans.map((event) => {
            const { icon, title, detail } = eventLabels(event);
            return (
              <EventLine
                key={eventKey(event)}
                icon={icon}
                title={title}
                detail={detail}
              />
            );
          })}

          {rivers.map((river) => (
            <RiverLine key={river.waterwayId ?? river.name} river={river} />
          ))}

          {unsectioned.map((descent) => (
            <EventLine
              key={`paddled-${descent.id}`}
              icon={<DirectionsBoatOutlinedIcon />}
              title={descent.name ?? "A descent"}
              detail={`Paddled by ${descent.username ?? "a member"}`}
            />
          ))}
        </Stack>
      </Collapse>

      <Collapse in={isOpen} timeout={durations.base} unmountOnExit>
        <DayDetail day={day} actions={actions} />
      </Collapse>
    </Box>
  );
}

function RiverLine({ river }: { river: PaddledRiver }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <EventIcon>
        <DirectionsBoatOutlinedIcon />
      </EventIcon>
      <Box sx={{ minWidth: 0 }}>
        <EventText kind="title">{river.name}</EventText>
        {river.sections.map((section) => (
          <EventText key={section.sectionId} kind="detail">
            {section.name} · {section.paddlers.join(", ")}
          </EventText>
        ))}
      </Box>
    </Box>
  );
}

function EventLine({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <EventIcon>{icon}</EventIcon>
      <Box sx={{ minWidth: 0 }}>
        <EventText kind="title">{title}</EventText>
        <EventText kind="detail">{detail}</EventText>
      </Box>
    </Box>
  );
}
