import AddIcon from "@mui/icons-material/Add";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { Fragment } from "react";
import type { WaterwayListItem } from "@/lib/api";

interface PendingRiver {
  id: number;
  name: string;
}

/** Why a river is in the results, when it did not match on its own name.
 * Without this a hit through a rapid or a translation looks arbitrary. */
function matchReason(waterway: WaterwayListItem): string | undefined {
  const { matched_source, matched_name, matched_lang, matched_section_name } =
    waterway;
  if (!matched_source || !matched_name || matched_source === "waterway") {
    return undefined;
  }
  if (matched_source === "section") return `Section: ${matched_name}`;
  if (matched_source === "feature_name") {
    // A rapid name alone does not say where on the river it is, so name the
    // section it belongs to as well.
    return matched_section_name
      ? `Rapid: ${matched_section_name} - ${matched_name}`
      : `Rapid: ${matched_name}`;
  }
  const label = matched_lang
    ? `${matched_lang.toUpperCase()} name: ${matched_name}`
    : matched_name;
  // The translation and the section's own name are different strings; showing
  // both makes clear which section matched.
  return matched_section_name && matched_section_name !== matched_name
    ? `${label} - ${matched_section_name}`
    : label;
}

interface RiverListProps {
  waterways: WaterwayListItem[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onSelect: (id: number) => void;
  onLoadMore: () => void;
  /** Own pending river proposals matching the search - shown as disabled entries. */
  pendingRivers?: PendingRiver[];
  /** Current name search term (used for the "add it" CTA). */
  searchName?: string;
  /** Opens the "suggest new river" flow; only rendered when search found nothing. */
  onProposeRiver?: () => void;
}

function PendingRiverItems({
  pendingRivers,
}: {
  pendingRivers: PendingRiver[];
}) {
  return (
    <>
      {pendingRivers.map((p) => (
        <ListItem
          key={`pending-${p.id}`}
          sx={{ borderRadius: 1, mb: 0.5, opacity: 0.6 }}
        >
          <ListItemText
            primary={p.name}
            slotProps={{
              primary: { variant: "body2", sx: { fontWeight: 600 } },
            }}
          />
          <Chip
            icon={<HourglassEmptyIcon sx={{ fontSize: "0.8rem !important" }} />}
            label="PENDING APPROVAL"
            color="warning"
            size="small"
            variant="outlined"
            sx={{ flexShrink: 0, fontSize: "0.65rem" }}
          />
        </ListItem>
      ))}
    </>
  );
}

export default function RiverList({
  waterways,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onSelect,
  onLoadMore,
  pendingRivers = [],
  searchName,
  onProposeRiver,
}: RiverListProps) {
  if (!isLoading && waterways.length === 0) {
    return (
      <>
        {pendingRivers.length > 0 && (
          <List dense disablePadding>
            <PendingRiverItems pendingRivers={pendingRivers} />
          </List>
        )}
        <Typography
          color="text.secondary"
          variant="body2"
          sx={{ textAlign: "center", py: pendingRivers.length > 0 ? 2 : 4 }}
        >
          No rivers found.
        </Typography>
        {onProposeRiver && searchName && (
          <Button
            onClick={onProposeRiver}
            variant="outlined"
            size="small"
            fullWidth
            startIcon={<AddIcon />}
          >
            Can't find your river? Add it
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <List dense disablePadding>
        <PendingRiverItems pendingRivers={pendingRivers} />
        {waterways.map((waterway, index) => (
          <Fragment key={waterway.id}>
            {/* Approximate matches sort last, so one divider separates them
                from the exact ones and explains why they are here. */}
            {waterway.fuzzy && !waterways[index - 1]?.fuzzy && (
              <Typography
                variant="overline"
                color="text.disabled"
                sx={{ display: "block", px: 1, pt: 1, lineHeight: 1.6 }}
              >
                Similar names
              </Typography>
            )}
            <ListItemButton
              onClick={() => onSelect(waterway.id)}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemText
                primary={waterway.name}
                secondary={matchReason(waterway)}
                slotProps={{
                  primary: { variant: "body2", sx: { fontWeight: 600 } },
                  secondary: { variant: "caption" },
                }}
              />
              <Chip
                label={waterway.waterway_type.toUpperCase()}
                color="primary"
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0, fontSize: "0.65rem" }}
              />
            </ListItemButton>
          </Fragment>
        ))}
      </List>
      {hasNextPage && (
        <Button
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          variant="outlined"
          size="small"
          fullWidth
          sx={{ mt: 1 }}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </>
  );
}
