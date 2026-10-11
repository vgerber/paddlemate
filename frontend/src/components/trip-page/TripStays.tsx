import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { factLabelSx } from "@/components/Fact";
import MarkdownText from "@/components/MarkdownText";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import { stayKind } from "@/components/trips/stayKinds";
import WaterLevelChip from "@/components/WaterLevelChip";
import type { TripSection, TripStay } from "@/lib/api";
import { dateRange } from "@/lib/format";
import { useTripCandidates, useTripStays } from "@/lib/hooks/useTrips";
import { useSectionLevels } from "@/lib/hooks/useWaterStatus";
import { durations } from "@/lib/motion";
import { alphas, fonts, theme } from "@/lib/theme";
import { baseColors, baseNumbers } from "@/lib/tripRange";
import { LEVEL_ORDER, type WaterLevel } from "@/lib/waterLevel";
import BasesMap from "./BasesMap";
import TripCandidates from "./TripCandidates";
import WatchList from "./WatchList";

const { tokens } = theme;

interface Props {
  tripId: number;
  isMember: boolean;
  isAdmin: boolean;
  viewerId: string | null;
  /** The bases map above the list; off where the canvas draws it behind. */
  showMap?: boolean;
  onLogSection: (sectionId: number, waterwayId: number) => void;
  onEditStay: (stay: TripStay) => void;
  onEditWatchList: (stay: TripStay) => void;
  onDeleteStay: (stay: TripStay) => void;
}

/**
 * The itinerary as a timeline. The base moves while the trip is already
 * running, so every stay stays editable by any member throughout.
 */
export default function TripStays({
  tripId,
  isMember,
  isAdmin,
  viewerId,
  showMap = true,
  onLogSection,
  onEditStay,
  onEditWatchList,
  onDeleteStay,
}: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const { data: stays, isLoading } = useTripStays(tripId);
  const { data: candidates } = useTripCandidates(tripId, isMember);

  if (isLoading) return <LoadingBox size={40} pt={6} />;

  const list = stays ?? [];
  // The same colour the base wears on the map above, so a ring and a row are
  // recognisably one base.
  const colors = baseColors(list);
  const numbers = baseNumbers(list);

  if (list.length === 0) {
    return (
      <EmptyState
        icon={
          <PlaceOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
        }
        title="No bases yet."
        py={6}
      />
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {showMap && <BasesMap tripId={tripId} isMember={isMember} />}

      <TripCandidates
        tripId={tripId}
        candidates={candidates ?? []}
        stays={list}
        viewerId={viewerId}
        isAdmin={isAdmin}
      />

      {list.map((stay) => (
        <StayRow
          key={stay.id}
          stay={stay}
          isOpen={stay.id === openId}
          onToggle={() =>
            setOpenId((cur) => (cur === stay.id ? null : stay.id))
          }
          color={colors[stay.id]}
          number={numbers[stay.id]}
          isMember={isMember}
          // A trip always keeps somewhere for its watch list to hang off.
          canDelete={isAdmin && list.length > 1}
          onEdit={() => onEditStay(stay)}
          onEditSections={() => onEditWatchList(stay)}
          onDelete={() => onDeleteStay(stay)}
          onLogSection={onLogSection}
        />
      ))}
    </Box>
  );
}

/** The run on the watch list whose water is highest, if any has a level. */
function wettestSection(
  sections: TripSection[],
  levels: Record<number, WaterLevel>,
): TripSection | null {
  let best: TripSection | null = null;
  for (const s of sections) {
    const level = levels[s.section_id];
    if (!level || s.waterway_id == null) continue;
    if (
      !best ||
      LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(levels[best.section_id])
    )
      best = s;
  }
  return best;
}

function StayRow({
  stay,
  color,
  number,
  isOpen,
  onToggle,
  isMember,
  canDelete,
  onEdit,
  onEditSections,
  onDelete,
  onLogSection,
}: {
  isOpen: boolean;
  onToggle: () => void;
  stay: TripStay;
  color: string;
  number: number;
  isMember: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onEditSections: () => void;
  onDelete: () => void;
  onLogSection: (sectionId: number, waterwayId: number) => void;
}) {
  const { label, Icon } = stayKind(stay.kind);
  // Cache-shared with the chips in the watch list below and the section
  // lines on the map, so opening a base costs no extra request.
  const pairs = useMemo(
    () =>
      stay.sections
        .filter((s) => s.waterway_id != null)
        .map((s) => ({
          waterwayId: s.waterway_id as number,
          sectionId: s.section_id,
        })),
    [stay.sections],
  );
  const { levels } = useSectionLevels(pairs);
  const wettest = wettestSection(stay.sections, levels);

  // One control per row: a row of bare icons is clutter and names nothing.
  const actions: RowAction[] = [];
  if (isMember) {
    actions.push({
      label: "Edit base",
      icon: <EditOutlinedIcon fontSize="small" />,
      onClick: onEdit,
    });
    actions.push({
      label: "Edit watch list",
      icon: <PlaylistAddOutlinedIcon fontSize="small" />,
      onClick: onEditSections,
    });
  }
  if (canDelete) {
    actions.push({
      label: "Delete base",
      icon: <DeleteOutlinedIcon fontSize="small" />,
      onClick: onDelete,
      danger: true,
    });
  }

  return (
    <Box
      data-testid="stay-row"
      sx={{
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
        overflow: "hidden",
      }}
    >
      {/* Closed, a base is its name, when it runs, and the water level of
          its wettest run; the list itself is what opening it is for. */}
      <ListItemButton
        onClick={onToggle}
        aria-expanded={isOpen}
        sx={{
          display: "block",
          minHeight: tokens.touch.row,
          py: 1,
          pr: 0.5,
          cursor: "pointer",
          bgcolor: isOpen ? `${tokens.primary}${alphas.tint}` : "transparent",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {/* The same number the marker wears on the map above. */}
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              bgcolor: color,
              color: theme.tokens.white,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fonts.label,
              fontSize: "0.75rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {number}
          </Box>
          <Icon sx={{ fontSize: 18, color: "text.disabled" }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: fonts.label,
                fontWeight: 600,
                fontSize: "0.8125rem",
              }}
              noWrap
            >
              {stay.name}
            </Typography>
            {stay.arrival && (
              <Typography
                sx={{
                  fontFamily: fonts.label,
                  fontSize: "0.75rem",
                  color: "primary.main",
                }}
              >
                {dateRange(stay.arrival, stay.departure)}
              </Typography>
            )}
          </Box>
          {wettest && (
            <WaterLevelChip
              waterwayId={wettest.waterway_id ?? null}
              sectionId={wettest.section_id}
            />
          )}
          <Chip label={label} size="small" variant="outlined" />
          <RowMenu actions={actions} label="Base actions" />
        </Box>

        {stay.description && (
          <Box sx={{ mt: 0.5 }}>
            <MarkdownText>{stay.description}</MarkdownText>
          </Box>
        )}
      </ListItemButton>

      <Collapse in={isOpen} timeout={durations.base} unmountOnExit>
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography sx={{ ...factLabelSx, ml: 3.5, display: "block" }}>
            Watch list
          </Typography>
          <Box sx={{ ml: 3.5 }}>
            <WatchList sections={stay.sections} onSelect={onLogSection} />
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
