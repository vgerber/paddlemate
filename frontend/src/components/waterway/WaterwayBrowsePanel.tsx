import AddIcon from "@mui/icons-material/Add";
import MapIcon from "@mui/icons-material/Map";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import SectionListItem from "@/components/waterway/SectionListItem";
import FeatureTimeline from "@/components/waterway/section-details";
import type {
  Proposal,
  SectionWithFeatures,
  WaterRangeWithStatus,
} from "@/lib/api";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { localizedName } from "@/lib/localization";
import type { DetailTab, SuggestMode } from "./types";
import WaterwayDetailHeader from "./WaterwayDetailHeader";

interface WaterwayBrowsePanelProps {
  waterwayId: number;
  selectedSectionId?: number;
  selectedGaugeId?: number | null;
  gaugeRanges?: WaterRangeWithStatus[];
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onBack: () => void;
  onSectionClick: (id: number) => void;
  onSectionDeselect: () => void;
  onGaugeSelect?: (id: number) => void;
  onSuggestModeChange: (mode: SuggestMode) => void;
  favoritedIds?: Set<number>;
  onToggleFavorite?: (id: number) => void;
  onMobileMapToggle?: () => void;
  mobileMapActive?: boolean;
  onFeatureClick?: (coords: [number, number] | null) => void;
  showProposedFeatures?: boolean;
  onToggleProposedFeatures?: () => void;
  featureProposals?: Proposal[];
}

export default function WaterwayBrowsePanel({
  waterwayId,
  selectedSectionId,
  selectedGaugeId,
  gaugeRanges = [],
  tab,
  onTabChange,
  onBack,
  onSectionClick,
  onSectionDeselect,
  onGaugeSelect,
  onSuggestModeChange,
  favoritedIds,
  onToggleFavorite,
  onMobileMapToggle,
  mobileMapActive,
  onFeatureClick,
  showProposedFeatures = false,
  onToggleProposedFeatures,
  featureProposals = [],
}: WaterwayBrowsePanelProps) {
  const { data: waterway, isLoading } = useWaterway(waterwayId);
  const { isAuthenticated } = useSession();
  const sections: SectionWithFeatures[] = waterway?.sections ?? [];

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const inFeatures = selectedSectionId != null && selectedSection != null;

  const actionButton = onMobileMapToggle ? (
    <>
      {inFeatures && onToggleProposedFeatures && (
        <IconButton
          size="small"
          onClick={onToggleProposedFeatures}
          aria-label={
            showProposedFeatures
              ? "Hide proposed features"
              : "Show proposed features"
          }
          color={showProposedFeatures ? "primary" : undefined}
        >
          <PendingActionsIcon fontSize="small" />
        </IconButton>
      )}
      <IconButton
        size="small"
        onClick={onMobileMapToggle}
        aria-label={mobileMapActive ? "Back to detail" : "View on map"}
        color={mobileMapActive ? "primary" : undefined}
      >
        <MapIcon fontSize="small" />
      </IconButton>
    </>
  ) : inFeatures && onToggleFavorite ? (
    <IconButton
      size="small"
      onClick={() => onToggleFavorite(selectedSection.id)}
      aria-label={
        favoritedIds?.has(selectedSection.id)
          ? "Remove from favorites"
          : "Add to favorites"
      }
    >
      {favoritedIds?.has(selectedSection.id) ? (
        <StarIcon fontSize="small" sx={{ color: "warning.main" }} />
      ) : (
        <StarBorderIcon fontSize="small" />
      )}
    </IconButton>
  ) : undefined;

  return (
    <>
      <WaterwayDetailHeader
        title={
          inFeatures
            ? localizedName(selectedSection.name, selectedSection.names)
            : (waterway?.name ?? "…")
        }
        subtitle={
          inFeatures ? (waterway?.name ?? "") : (waterway?.waterway_type ?? "")
        }
        onBack={inFeatures ? onSectionDeselect : onBack}
        actionButton={actionButton}
        tabs={inFeatures ? undefined : { value: tab, onChange: onTabChange }}
      />

      <Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : inFeatures ? (
          <FeatureTimeline
            section={selectedSection}
            proposals={showProposedFeatures ? featureProposals : undefined}
            onFeatureClick={onFeatureClick}
          />
        ) : tab === "sections" ? (
          <SectionsList
            sections={sections}
            waterwayId={waterwayId}
            selectedSectionId={selectedSectionId}
            onSectionClick={onSectionClick}
          />
        ) : (
          <GaugesList
            gaugeRanges={gaugeRanges}
            selectedGaugeId={selectedGaugeId}
            onGaugeSelect={onGaugeSelect}
          />
        )}
      </Box>

      {isAuthenticated && tab === "sections" && !inFeatures && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            // "New section" opens its own page, so it works on mobile too;
            // "New feature" is desktop-only here (mobile uses the speed dial).
            display: {
              xs: selectedSectionId == null ? "flex" : "none",
              md: "flex",
            },
            gap: 1,
            flexShrink: 0,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          {selectedSectionId == null ? (
            <Button
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              fullWidth
              onClick={() => onSuggestModeChange("section")}
            >
              New section
            </Button>
          ) : (
            <Button
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              fullWidth
              onClick={() => onSuggestModeChange("feature")}
            >
              New feature
            </Button>
          )}
        </Box>
      )}
    </>
  );
}

// ─── Sections list ───────────────────────────────────────────────────────────

interface SectionsListProps {
  sections: SectionWithFeatures[];
  waterwayId: number;
  selectedSectionId: number | undefined;
  onSectionClick: (id: number) => void;
}

function SectionsList({
  sections,
  waterwayId,
  selectedSectionId,
  onSectionClick,
}: SectionsListProps) {
  if (sections.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
        No sections found.
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {sections.map((section) => (
        <SectionListItem
          key={section.id}
          section={section}
          waterwayId={waterwayId}
          selected={section.id === selectedSectionId}
          onClick={onSectionClick}
        />
      ))}
    </List>
  );
}

// ─── Gauges list ─────────────────────────────────────────────────────────────

interface GaugesListProps {
  gaugeRanges: WaterRangeWithStatus[];
  selectedGaugeId?: number | null;
  onGaugeSelect?: (id: number) => void;
}

function GaugesList({
  gaugeRanges,
  selectedGaugeId,
  onGaugeSelect,
}: GaugesListProps) {
  if (gaugeRanges.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
        No gauges found.
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {gaugeRanges.map((range) => (
        <ListItemButton
          key={range.gauge.id}
          selected={selectedGaugeId === range.gauge.id}
          onClick={() => onGaugeSelect?.(range.gauge.id)}
          sx={{ py: 0.75, px: 1.5, borderRadius: 1 }}
        >
          <ListItemText
            primary={(range.series.label ?? range.gauge.name).replace(
              /\s*\([WQ]\)\s*$/,
              "",
            )}
            secondary={range.gauge.name}
            slotProps={{
              primary: { variant: "body2" },
              secondary: { variant: "caption" },
            }}
          />
          {range.latest_reading != null && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mr: 1, whiteSpace: "nowrap" }}
            >
              {range.latest_reading.value.toFixed(1)}&thinsp;{range.series.unit}
            </Typography>
          )}
        </ListItemButton>
      ))}
    </List>
  );
}
