import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { flatRowSx } from "@/components/canvas/flatRow";
import { useSectionComments } from "@/lib/hooks/useComments";
import { useDescents } from "@/lib/hooks/useDescents";
import { useProposals } from "@/lib/hooks/useProposals";
import { useHistory } from "@/lib/hooks/useProvenance";
import { useSectionWithFeatures } from "@/lib/hooks/useSections";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";
import { LogIcon, NoteIcon, PendingIcon, WarningIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import { currentLevel } from "@/lib/waterLevel";
import {
  CAPTION_PX,
  captionText,
  fitRows,
  hazardNotes,
  hazardRow,
  noteRow,
  orderRows,
  paddledRow,
  proposalRow,
  ROW_PX,
  SKELETON_DELAY_MS,
  type StateRow,
  type StateTab,
  yearStartIso,
} from "./stateRows";

const { tokens } = theme;
const { panel } = tokens.canvas;

/** The icon box: the name lands 56 from the card edge (16 + 28 + 12). */
const TILE = 28;

const ICONS: Record<StateRow["key"], ReactNode> = {
  hazard: <WarningIcon />,
  paddled: <LogIcon />,
  note: <NoteIcon />,
  proposal: <PendingIcon />,
};

const SKELETON_KEYS = ["first", "second"];

const NONE_TEXT = "No logs or notes for this section yet.";

/** True once `active` has held for the delay, so a quick answer never shows
 * a skeleton. */
function useDelayed(active: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!active) {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return active && late;
}

function Line({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  return (
    <Typography
      component="div"
      noWrap
      sx={{
        fontSize: "0.8125rem",
        lineHeight: "18px",
        color: quiet ? tokens.onSurfaceVariant : tokens.onSurfaceVariant,
      }}
    >
      {children}
    </Typography>
  );
}

const rowSx = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  height: ROW_PX,
  px: `${panel.inner}px`,
  width: "100%",
  textAlign: "left",
  boxSizing: "border-box",
  borderTop: `1px solid ${tokens.outlineVariant}`,
  "&:first-of-type": { borderTop: 0 },
} as const;

function Row({
  row,
  onOpen,
}: {
  row: StateRow;
  onOpen?: (tab: StateTab) => void;
}) {
  const body = (
    <>
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          width: TILE,
          height: TILE,
          flex: "none",
          color: tokens.onSurfaceVariant,
        }}
      >
        {ICONS[row.key]}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          noWrap
          sx={{ fontSize: "0.9375rem", fontWeight: 500, lineHeight: "20px" }}
        >
          {row.title}
        </Typography>
        {(row.lead || row.detail) && (
          <Line>
            {row.lead && (
              <Box
                component="span"
                sx={{ color: row.lead.color, fontWeight: 600 }}
              >
                {row.lead.text}
              </Box>
            )}
            {row.detail}
          </Line>
        )}
      </Box>
      {row.when && (
        <Typography
          sx={{
            flex: "none",
            fontSize: "0.8125rem",
            color: tokens.onSurfaceVariant,
          }}
        >
          {row.when}
        </Typography>
      )}
    </>
  );
  if (!onOpen) {
    return (
      <Box data-testid={`river-state-${row.key}`} sx={rowSx}>
        {body}
      </Box>
    );
  }
  return (
    <ListItemButton
      data-testid={`river-state-${row.key}`}
      onClick={() => onOpen(row.opens)}
      sx={{ ...rowSx, "&:hover": flatRowSx["&:hover"] }}
    >
      {body}
    </ListItemButton>
  );
}

function SkeletonRow() {
  return (
    <Box data-testid="river-state-skeleton" sx={rowSx}>
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          bgcolor: tokens.surfaceHighest,
        }}
      />
      <Box sx={{ flex: 1, display: "grid", gap: 0.75 }}>
        <Box
          sx={{
            height: 12,
            width: "60%",
            borderRadius: `${tokens.radii.sm}px`,
            bgcolor: tokens.surfaceHighest,
          }}
        />
        <Box
          sx={{
            height: 12,
            width: "40%",
            borderRadius: `${tokens.radii.sm}px`,
            bgcolor: tokens.surfaceHighest,
          }}
        />
      </Box>
    </Box>
  );
}

function NoneRow() {
  return (
    <Box data-testid="river-state-none" sx={rowSx}>
      <Typography
        sx={{ fontSize: "0.9375rem", color: tokens.onSurfaceVariant }}
      >
        {NONE_TEXT}
      </Typography>
    </Box>
  );
}

/** What the section holds that a paddler at the bank asks about: a hazard,
 * the last log, the latest note, proposals waiting. It fills the height its
 * parent gives it and draws as many rows as fit, dropping from the bottom;
 * under one row it draws nothing. A row with nothing to say, or whose
 * request failed, is not drawn. Rows open their tab when `onOpen` is given. */
export default function RiverState({
  waterwayId,
  sectionId,
  onOpen,
}: {
  waterwayId: number;
  sectionId: number;
  onOpen?: (tab: StateTab) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const { user } = useSession();
  const comments = useSectionComments(waterwayId, sectionId);
  const year = useDescents({
    section_id: sectionId,
    per_page: 1,
    from: yearStartIso(now),
  });
  // A log this year is also the latest one; only a section last paddled in an
  // earlier year needs its own request.
  const latestThisYear = year.data?.items[0];
  const older = useDescents(
    { section_id: sectionId, per_page: 1 },
    year.isSuccess && !latestThisYear,
  );
  const lastLog = latestThisYear ?? older.data?.items[0];
  const proposals = useProposals({ section_id: sectionId, status: "pending" });
  const section = useSectionWithFeatures(waterwayId, sectionId);
  const history = useHistory({ waterwayId, sectionId });
  const water = useWaterStatus(waterwayId, sectionId);

  const rows = useMemo(() => {
    const list = comments.data ?? [];
    const hazards = hazardNotes(list, now);
    return orderRows({
      hazard: hazardRow(hazards, now),
      paddled: paddledRow(lastLog, {
        sectionId,
        viewerId: user?.id ?? null,
        level: currentLevel(water.data?.ranges ?? [], now.getTime()),
        thisYear: year.data?.total ?? 0,
        now,
      }),
      note: noteRow(list, hazards, now),
      proposal: proposalRow(proposals.data ?? [], now),
    });
  }, [
    comments.data,
    lastLog,
    year.data,
    proposals.data,
    water.data,
    sectionId,
    user?.id,
    now,
  ]);

  const caption = section.data
    ? captionText({
        createdAt: section.data.created_at,
        updatedAt: section.data.updated_at,
        by: section.data.created_by
          ? history.data?.items[0]?.actor?.username
          : null,
        now,
      })
    : null;

  const ref = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setRoom(el.clientHeight);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const loading = comments.isLoading || year.isLoading || older.isLoading;
  const waiting = useDelayed(loading, SKELETON_DELAY_MS);
  const failed = [comments, year, older, proposals].some((q) => q.isError);
  const none = !loading && !failed && rows.length === 0;
  const skeletons = waiting ? 2 : 0;

  const count = none ? 1 : rows.length + skeletons;
  const fit = fitRows(count, room, caption !== null && !loading);
  const shown = rows.slice(0, fit.rows);
  const spare = Math.max(0, fit.rows - shown.length);

  return (
    <Box
      ref={ref}
      data-testid="river-state"
      sx={{
        // The invisible box `fitRows` measures; the card inside hugs its
        // rows and the ground below stays plain.
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {fit.rows > 0 && (
        <Box
          sx={{
            alignSelf: "flex-start",
            width: "100%",
            overflow: "hidden",
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e1,
          }}
        >
          {none ? (
            <NoneRow />
          ) : (
            <>
              {shown.map((row) => (
                <Row key={row.key} row={row} onOpen={onOpen} />
              ))}
              {SKELETON_KEYS.slice(0, spare).map((k) => (
                <SkeletonRow key={k} />
              ))}
            </>
          )}
          {fit.caption && (
            <Typography
              data-testid="river-state-caption"
              noWrap
              sx={{
                height: CAPTION_PX,
                lineHeight: `${CAPTION_PX}px`,
                px: 2,
                fontSize: "0.8125rem",
                color: tokens.onSurfaceVariant,
              }}
            >
              {caption}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
