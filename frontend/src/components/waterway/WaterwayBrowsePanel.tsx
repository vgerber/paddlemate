import AddIcon from "@mui/icons-material/Add";
import MapIcon from "@mui/icons-material/Map";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import SectionListItem from "@/components/waterway/SectionListItem";
import SectionLogsList from "@/components/waterway/SectionLogsList";
import FeatureTimeline from "@/components/waterway/section-details";
import type {
  Proposal,
  SectionWithFeatures,
  WaterRangeWithStatus,
} from "@/lib/api";
import { useSectionDescentCounts } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { localizedName } from "@/lib/localization";
import type { DetailTab, SectionDetailTab, SuggestMode } from "./types";
import WaterwayDetailHeader from "./WaterwayDetailHeader";

interface WaterwayBrowsePanelProps {
  waterwayId: number;
  selectedSectionId?: number;
  selectedGaugeId?: number | null;
  gaugeRanges?: WaterRangeWithStatus[];
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  sectionDetailTab: SectionDetailTab;
  onSectionDetailTabChange: (tab: SectionDetailTab) => void;
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
  activeFeatureId?: number | null;
  onActiveFeatureChange?: (id: number | null) => void;
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
  sectionDetailTab,
  onSectionDetailTabChange,
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
  activeFeatureId,
  onActiveFeatureChange,
  showProposedFeatures = false,
  onToggleProposedFeatures,
  featureProposals = [],
}: WaterwayBrowsePanelProps) {
  const navigate = useNavigate();
  const { data: waterway, isLoading } = useWaterway(waterwayId);
  const { data: descentCounts } = useSectionDescentCounts(waterwayId);
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

  const showNewSectionFab =
    isAuthenticated &&
    tab === "sections" &&
    !inFeatures &&
    selectedSectionId == null;

  const showLogDescentFab =
    isAuthenticated && inFeatures && sectionDetailTab === "logs";

  const headerTabs = inFeatures
    ? {
        value: sectionDetailTab as string,
        onChange: (t: string) =>
          onSectionDetailTabChange(t as SectionDetailTab),
        options: [
          { value: "features", label: "Features" },
          { value: "logs", label: "Logs" },
        ],
      }
    : {
        value: tab as string,
        onChange: (t: string) => onTabChange(t as DetailTab),
        options: [
          { value: "sections", label: "Sections" },
          { value: "gauges", label: "Gauges" },
        ],
      };

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
        tabs={headerTabs}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 1,
            // Leave room so a floating button never covers the last row -
            // the panel's own FABs, or the mobile speed dial in the
            // section features view (its km labels are right-aligned).
            pb: showNewSectionFab || showLogDescentFab || inFeatures ? 9 : 1,
          }}
        >
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={22} />
            </Box>
          ) : inFeatures ? (
            sectionDetailTab === "logs" ? (
              <SectionLogsList sectionId={selectedSection.id} />
            ) : (
              <FeatureTimeline
                section={selectedSection}
                proposals={featureProposals}
                showProposed={showProposedFeatures}
                onFeatureClick={onFeatureClick}
                activeFeatureId={activeFeatureId}
                onActiveFeatureChange={onActiveFeatureChange}
              />
            )
          ) : tab === "sections" ? (
            <SectionsList
              sections={sections}
              waterwayId={waterwayId}
              selectedSectionId={selectedSectionId}
              onSectionClick={onSectionClick}
              descentCounts={descentCounts}
            />
          ) : (
            <GaugesList
              gaugeRanges={gaugeRanges}
              selectedGaugeId={selectedGaugeId}
              onGaugeSelect={onGaugeSelect}
            />
          )}
        </Box>

        {showNewSectionFab && (
          <Fab
            color="secondary"
            aria-label="New section"
            title="New section"
            onClick={() => onSuggestModeChange("section")}
            sx={{ position: "absolute", bottom: 16, right: 16 }}
          >
            <AddIcon />
          </Fab>
        )}

        {showLogDescentFab && (
          <Fab
            color="primary"
            aria-label="Log descent"
            title="Log descent"
            onClick={() =>
              navigate({
                to: "/logs/new",
                search: {
                  waterwayId,
                  sectionId: selectedSectionId,
                  startTime: undefined,
                },
              })
            }
            sx={{ position: "absolute", bottom: 16, right: 16 }}
          >
            <AddIcon />
          </Fab>
        )}
      </Box>

      {/* "New feature" is desktop-only here (mobile uses the speed dial). */}
      {isAuthenticated &&
        tab === "sections" &&
        !inFeatures &&
        selectedSectionId != null && (
          <Box
            sx={{
              px: 1.5,
              py: 1,
              display: { xs: "none", md: "flex" },
              gap: 1,
              flexShrink: 0,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Button
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              fullWidth
              onClick={() => onSuggestModeChange("feature")}
            >
              New feature
            </Button>
          </Box>
        )}
    </>
  );
}

interface SectionsListProps {
  sections: SectionWithFeatures[];
  waterwayId: number;
  selectedSectionId: number | undefined;
  onSectionClick: (id: number) => void;
  descentCounts?: Record<number, number>;
}

function SectionsList({
  sections,
  waterwayId,
  selectedSectionId,
  onSectionClick,
  descentCounts,
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
          descentCount={descentCounts?.[section.id]}
        />
      ))}
    </List>
  );
}

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
