import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { phoneRowPad, trailSlotSx } from "@/components/canvas/flatRow";
import { factLabelSx } from "@/components/Fact";
import LevelDots from "@/components/LevelDots";
import MarkdownText from "@/components/MarkdownText";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import { stayKind } from "@/components/trips/stayKinds";
import type { TripStay } from "@/lib/api";
import { dateRange } from "@/lib/format";
import { useTripCandidates, useTripStays } from "@/lib/hooks/useTrips";
import { useSectionDotLevels } from "@/lib/hooks/useWaterStatus";
import { AddToListIcon, BaseIcon, DeleteIcon, EditIcon } from "@/lib/icons";
import { durations } from "@/lib/motion";
import { alphas, fonts, theme } from "@/lib/theme";
import { baseColors, baseNumbers } from "@/lib/tripRange";
import BasesMap from "./BasesMap";
import TripCandidates from "./TripCandidates";
import WatchList from "./WatchList";

const { tokens } = theme;
const { phone } = tokens;
// Where a row's name starts, relative to its text line.
const nameIndent = `${phone.icon + phone.iconGap}px`;

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
  const staysQuery = useTripStays(tripId);
  const { data: stays, isLoading } = staysQuery;
  const candidatesQuery = useTripCandidates(tripId, isMember);
  const candidates = candidatesQuery.data;

  if (isLoading) return <LoadingBox size={40} pt={6} />;
  if (staysQuery.isError && !stays) {
    return (
      <ErrorState
        error={staysQuery.error}
        fallback="Could not load the bases."
        onRetry={() => staysQuery.refetch()}
        py={6}
      />
    );
  }

  const list = stays ?? [];
  // The same colour the base wears on the map above, so a ring and a row are
  // recognisably one base.
  const colors = baseColors(list);
  const numbers = baseNumbers(list);

  if (list.length === 0) {
    return <EmptyState icon={<BaseIcon />} title="No bases yet." py={6} />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {showMap && <BasesMap tripId={tripId} isMember={isMember} />}

      {candidatesQuery.isError && !candidates && (
        <ErrorState
          error={candidatesQuery.error}
          fallback="Could not load the proposed bases."
          onRetry={() => candidatesQuery.refetch()}
          py={2}
        />
      )}
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
  const dotLevels = useSectionDotLevels(pairs);
  const dotNames = useMemo(
    () =>
      stay.sections
        .filter((s) => s.waterway_id != null)
        .map((s) => s.section_name ?? "A run"),
    [stay.sections],
  );

  // One control per row: a row of bare icons is clutter and names nothing.
  const actions: RowAction[] = [];
  if (isMember) {
    actions.push({
      label: "Edit base",
      icon: <EditIcon fontSize="small" />,
      onClick: onEdit,
    });
    actions.push({
      label: "Edit watch list",
      icon: <AddToListIcon fontSize="small" />,
      onClick: onEditSections,
    });
  }
  if (canDelete) {
    actions.push({
      label: "Delete base",
      icon: <DeleteIcon fontSize="small" />,
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
      {/* Closed, a base is its name, when it runs, and a dot per run on
          its watch list; the list itself is what opening it is for. */}
      <ListItemButton
        onClick={onToggle}
        aria-expanded={isOpen}
        sx={{
          display: "block",
          minHeight: tokens.touch.row,
          py: 1,
          pr: 0.5,
          ...phoneRowPad,
          cursor: "pointer",
          bgcolor: isOpen ? `${tokens.primary}${alphas.tint}` : "transparent",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: `${phone.iconGap}px`, md: 1 },
          }}
        >
          {/* The same number the marker wears on the map above. */}
          <Box
            sx={{
              width: { xs: phone.icon, md: 22 },
              height: { xs: phone.icon, md: 22 },
              borderRadius: "50%",
              bgcolor: color,
              color: theme.tokens.white,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fonts.body,
              fontSize: "0.75rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {number}
          </Box>
          {/* The kind is also the chip's label; a phone has one icon column. */}
          <Icon
            sx={{
              fontSize: 18,
              color: "text.disabled",
              display: { xs: "none", md: "block" },
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: fonts.body,
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
                  fontFamily: fonts.body,
                  fontSize: "0.75rem",
                  color: "primary.main",
                }}
              >
                {dateRange(stay.arrival, stay.departure)}
              </Typography>
            )}
          </Box>
          <LevelDots levels={dotLevels} names={dotNames} />
          <Chip label={label} size="small" variant="outlined" />
          {actions.length > 0 ? (
            <RowMenu actions={actions} label="Base actions" />
          ) : (
            <Box sx={{ ...trailSlotSx, display: { xs: "flex", md: "none" } }} />
          )}
        </Box>

        {stay.description && (
          <Box sx={{ mt: 0.5, pl: { xs: nameIndent, md: 0 } }}>
            <MarkdownText>{stay.description}</MarkdownText>
          </Box>
        )}
      </ListItemButton>

      <Collapse in={isOpen} timeout={durations.base} unmountOnExit>
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography
            sx={{
              ...factLabelSx,
              ml: { xs: nameIndent, md: 3.5 },
              display: "block",
            }}
          >
            Watch list
          </Typography>
          <Box sx={{ ml: { xs: nameIndent, md: 3.5 } }}>
            <WatchList sections={stay.sections} onSelect={onLogSection} />
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
