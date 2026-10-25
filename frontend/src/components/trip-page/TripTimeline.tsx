import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { phoneRowPad } from "@/components/canvas/flatRow";
import { factLabelSx } from "@/components/Fact";
import { fabRoom } from "@/components/PaneFab";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import { withAlpha } from "@/lib/alpha";
import type { Trip } from "@/lib/api";
import { descentTitle } from "@/lib/descents";
import { formatDate, todayIso } from "@/lib/format";
import { useTripTimeline } from "@/lib/hooks/useTrips";
import { EventNoteIcon, LogIcon } from "@/lib/icons";
import { prefersReducedMotion } from "@/lib/motion";
import { fonts, theme } from "@/lib/theme";
import {
  type PaddledRiver,
  paddledByRiver,
  runCounts,
  type TripDay,
} from "@/lib/tripTimeline";
import DayDetail, { type DayActions } from "./DayDetail";
import {
  EVENT_GAP,
  EVENT_ICON_COLUMN,
  EventIcon,
  EventText,
  eventKey,
  eventLabels,
} from "./eventLabels";
import { foldProps } from "./folds";
import PlanCalendar from "./PlanCalendar";
import { dayAtScroll, openingDay } from "./planWeek";
import { TripMembersSummary, TripStaysSummary } from "./TripSummary";
import TripWeek from "./TripWeek";

const { tokens } = theme;

/** Days before the start have no number of their own. */
function dayLabel(day: number): string {
  return day < 1 ? "Before" : `Day ${day}`;
}

/**
 * The trip as it runs: the week pinned above, one card per day below, with
 * who turned up, where the group was based and what got paddled. Days before
 * the start count backwards, so an early arrival reads as "Before".
 *
 * A day is the unit you act on, and it opens where it sits: the plan stays on
 * screen around it, so moving between days costs nothing.
 */
export default function TripTimeline({
  trip,
  openDay,
  onToggleDay,
  actions,
  wide = false,
  membersBelow = false,
}: {
  trip: Trip;
  /** The day currently expanded, if any. */
  openDay: string | null;
  onToggleDay: (date: string) => void;
  actions: DayActions;
  /** The desktop card: the days as a row of cells, with the stays above the
   * list. */
  wide?: boolean;
  /** With `wide`, the members as initials under the list. */
  membersBelow?: boolean;
}) {
  const { days, isLoading, error, refetch } = useTripTimeline(trip);
  const today = todayIso();
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  // After a jump the list may not be able to scroll the day all the way to
  // the top; the jump stays the current day until the reader scrolls again.
  const jumped = useRef(false);

  const planned = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const runs = useMemo(() => runCounts(days), [days]);
  const shown = current ?? days[0]?.date ?? today;
  const weekOf =
    current ??
    openingDay(
      days.map((d) => d.date),
      today,
    );

  const jumpTo = useCallback((date: string) => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!el || !card) return;
    jumped.current = true;
    setCurrent(date);
    el.scrollTo({
      top: card.offsetTop - el.offsetTop - 8,
      behavior: prefersReducedMotion() ? "instant" : "smooth",
    });
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

  if (error) {
    return (
      <ErrorState
        error={error}
        fallback="Could not load the plan."
        onRetry={refetch}
        py={6}
      />
    );
  }

  if (days.length === 0) {
    return (
      <EmptyState
        icon={<EventNoteIcon />}
        title="Nothing on the plan yet."
        caption="Plan a day to say when you arrive, where you are based, or what you paddled."
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
      {wide ? (
        <TripWeek
          dates={days.map((d) => d.date)}
          runs={runs}
          current={shown}
          today={today}
          onPick={jumpTo}
        />
      ) : (
        <PlanCalendar
          current={shown}
          weekOf={weekOf}
          today={today}
          from={trip.start_date}
          to={trip.end_date ?? null}
          planned={planned}
          runs={runs}
          open={monthOpen}
          onOpenChange={setMonthOpen}
          onPick={jumpTo}
        />
      )}
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
          pb: { ...fabRoom, md: 1.5 },
        }}
      >
        {wide && <TripStaysSummary tripId={trip.id} />}
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
        {wide && membersBelow && <TripMembersSummary tripId={trip.id} />}
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
  // Three states: a day behind is quiet (sunk, no shadow, grey heading), today
  // wears the ring, and a day still ahead is white and outlined.
  const planned = day.date > today;
  const isToday = day.date === today;
  const past = day.date < today;
  const plans = day.events.filter((e) => e.kind !== "paddled");
  const { rivers, unsectioned } = paddledByRiver(day.events);

  return (
    <Box
      data-testid="plan-day"
      data-date={day.date}
      onClick={onToggle}
      sx={{
        flexShrink: 0,
        cursor: "pointer",
        textAlign: "left",
        px: 1.75,
        ...phoneRowPad,
        py: 1.5,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: past ? tokens.surfaceLow : tokens.surfaceLowest,
        boxShadow: isToday
          ? `inset 0 0 0 2px ${tokens.primary}, ${tokens.elevation.e1}`
          : planned
            ? {
                xs: `inset 0 0 0 1px ${tokens.outlineVariant}, ${tokens.elevation.e1}`,
                md: `inset 0 0 0 1px ${tokens.outlineVariant}`,
              }
            : "none",
        outlineOffset: 2,
        // The ring wraps the whole day while its header holds the focus.
        "&:has(> [role='button']:focus-visible)": {
          outline: `2px solid ${tokens.primary}`,
        },
        ...(isOpen ? { bgcolor: withAlpha(tokens.primary, "tint") } : {}),
      }}
    >
      <Stack
        direction="row"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        sx={{ alignItems: "baseline", gap: 1, outline: "none" }}
      >
        <Typography
          component="span"
          sx={{
            fontFamily: fonts.body,
            fontSize: 15,
            fontWeight: 700,
            flex: 1,
            color: past ? "text.secondary" : "text.primary",
          }}
        >
          {dayLabel(day.day)}
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
            fontFamily: fonts.body,
            fontSize: 13,
            fontWeight: 500,
            color: "text.secondary",
            flexShrink: 0,
          }}
        >
          {formatDate(day.date, { weekday: true })}
        </Typography>
      </Stack>

      <Collapse in={!isOpen} {...foldProps}>
        <Stack direction="column" sx={{ gap: 1, mt: 1 }}>
          {day.events.length === 0 && (
            <Typography sx={{ ...factLabelSx, pl: EVENT_ICON_COLUMN }}>
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
              icon={<LogIcon />}
              title={descentTitle(descent)}
              detail={`Paddled by ${descent.username ?? "a member"}`}
            />
          ))}
        </Stack>
      </Collapse>

      <Collapse in={isOpen} {...foldProps} unmountOnExit>
        <DayDetail day={day} actions={actions} />
      </Collapse>
    </Box>
  );
}

function RiverLine({ river }: { river: PaddledRiver }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: EVENT_GAP }}>
      <EventIcon>
        <LogIcon />
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
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: EVENT_GAP }}>
      <EventIcon>{icon}</EventIcon>
      <Box sx={{ minWidth: 0 }}>
        <EventText kind="title">{title}</EventText>
        <EventText kind="detail">{detail}</EventText>
      </Box>
    </Box>
  );
}
