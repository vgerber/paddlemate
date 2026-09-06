import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { VISIBILITY_ICONS } from "@/components/descents/DescentCard";
import type { Trip } from "@/lib/api";
import { dateRange } from "@/lib/format";
import { fonts, labelSx, theme } from "@/lib/theme";

/** One scannable line in the trips list: what it is called, when it runs, how
 * many are coming and how many logs it has gathered. */
export default function TripRow({
  trip,
  selected = false,
  onSelect,
}: {
  trip: Trip;
  /** Marks the row the desktop detail pane is showing. */
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <ListItemButton
      selected={selected}
      onClick={onSelect}
      sx={{
        display: "block",
        borderBottom: "1px solid",
        // A full-strength rule between every row turns the list into a grid;
        // these only need to separate.
        borderColor: `${theme.tokens.outlineVariant}55`,
        py: 1.25,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontWeight: 600,
            fontSize: "0.8125rem",
            flex: 1,
            minWidth: 0,
          }}
          noWrap
        >
          {trip.name}
        </Typography>
        {trip.viewer_role === "admin" && (
          <Typography sx={{ ...labelSx, flexShrink: 0 }}>admin</Typography>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mt: 0.25,
          color: "text.disabled",
        }}
      >
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontSize: "0.75rem",
            color: "primary.main",
          }}
        >
          {dateRange(trip.start_date, trip.end_date)}
        </Typography>
        <Count icon={<PeopleAltOutlinedIcon sx={{ fontSize: 13 }} />}>
          {trip.member_count}
        </Count>
        {/* Logs, not runs: each paddler on a run keeps their own. */}
        {trip.descent_count > 0 && (
          <Count icon={<DirectionsBoatOutlinedIcon sx={{ fontSize: 13 }} />}>
            {trip.descent_count}
          </Count>
        )}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            ml: "auto",
            flexShrink: 0,
          }}
        >
          {VISIBILITY_ICONS[trip.visibility.type]}
          <Typography sx={labelSx}>{trip.visibility.type}</Typography>
        </Box>
      </Box>

      {trip.description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {trip.description}
        </Typography>
      )}
    </ListItemButton>
  );
}

function Count({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {icon}
      <Typography sx={{ fontFamily: fonts.label, fontSize: "0.6875rem" }}>
        {children}
      </Typography>
    </Box>
  );
}
