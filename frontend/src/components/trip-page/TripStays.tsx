import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { factLabelSx } from "@/components/Fact";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import { stayKind } from "@/components/trips/stayKinds";
import type { TripStay } from "@/lib/api";
import { dateRange } from "@/lib/format";
import { useTripStays } from "@/lib/hooks/useTrips";
import { fonts, theme } from "@/lib/theme";
import WatchList from "./WatchList";

interface Props {
  tripId: number;
  isMember: boolean;
  isAdmin: boolean;
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
  onLogSection,
  onEditStay,
  onEditWatchList,
  onDeleteStay,
}: Props) {
  const { data: stays, isLoading } = useTripStays(tripId);

  if (isLoading) return <LoadingBox size={40} pt={6} />;

  const list = stays ?? [];

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
    <Box>
      {list.map((stay) => (
        <StayRow
          key={stay.id}
          stay={stay}
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
  isMember,
  canDelete,
  onEdit,
  onEditSections,
  onDelete,
  onLogSection,
}: {
  stay: TripStay;
  isMember: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onEditSections: () => void;
  onDelete: () => void;
  onLogSection: (sectionId: number, waterwayId: number) => void;
}) {
  const { label, Icon } = stayKind(stay.kind);

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
      sx={{
        borderBottom: "1px solid",
        borderColor: `${theme.tokens.outlineVariant}55`,
      }}
    >
      {/* The named line is the row; the watch list under it is its own list,
          so the click target stops before it. */}
      <ListItemButton
        onClick={isMember ? onEdit : undefined}
        disableRipple={!isMember}
        tabIndex={isMember ? 0 : -1}
        sx={{
          display: "block",
          py: 1.5,
          cursor: isMember ? "pointer" : "default",
          ...(isMember ? {} : { "&:hover": { bgcolor: "transparent" } }),
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
          <Chip label={label} size="small" variant="outlined" />
          <RowMenu actions={actions} label="Base actions" />
        </Box>

        {stay.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {stay.description}
          </Typography>
        )}
      </ListItemButton>

      <Box sx={{ px: 2, pb: 1.5 }}>
        <Typography sx={{ ...factLabelSx, ml: 3.5, display: "block" }}>
          Watch list
        </Typography>
        <Box sx={{ ml: 3.5 }}>
          <WatchList sections={stay.sections} onSelect={onLogSection} />
        </Box>
      </Box>
    </Box>
  );
}
