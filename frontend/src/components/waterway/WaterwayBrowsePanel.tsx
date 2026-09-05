import AddIcon from "@mui/icons-material/Add";
import MapIcon from "@mui/icons-material/Map";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import LoadingBox from "@/components/states/LoadingBox";
import SectionListItem from "@/components/waterway/SectionListItem";
import SectionLogsList from "@/components/waterway/SectionLogsList";
import FeatureTimeline from "@/components/waterway/section-details";
import type {
  Feature,
  Proposal,
  SectionWithFeatures,
  WaterRangeWithStatus,
} from "@/lib/api";
import { useSectionDescentCounts } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";
import CommentThread from "./CommentThread";
import GaugesList from "./GaugesList";
import type { DetailTab, SectionDetailTab, SuggestMode } from "./types";
import WaterwayDetailHeader from "./WaterwayDetailHeader";

interface WaterwayBrowsePanelProps {
  waterwayId: number;
  selectedSectionId?: number;
  favoritedIds?: Set<number>;
  onToggleFavorite?: (id: number) => void;
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
  /** Map-page only: note composer's map pin (see CommentThread). */
  noteMapPin?: React.ComponentProps<typeof CommentThread>["mapPin"];
  onMobileMapToggle?: () => void;
  mobileMapActive?: boolean;
  /** Everything the section feature timeline needs - passed through as one
   * group instead of seven loose props. */
  featureTimeline?: {
    onFeatureClick?: (coords: [number, number] | null) => void;
    onEditFeature?: (f: Feature) => void;
    activeFeatureId?: number | null;
    onActiveFeatureChange?: (id: number | null) => void;
    showProposed?: boolean;
    onToggleProposed?: () => void;
    proposals?: Proposal[];
  };
}

export default function WaterwayBrowsePanel({
  waterwayId,
  selectedSectionId,
  favoritedIds,
  onToggleFavorite,
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
  noteMapPin,
  onMobileMapToggle,
  mobileMapActive,
  featureTimeline,
}: WaterwayBrowsePanelProps) {
  const navigate = useNavigate();
  const { data: waterway, isLoading } = useWaterway(waterwayId);
  const { data: descentCounts } = useSectionDescentCounts(waterwayId);
  const { isAuthenticated } = useSession();
  const sections: SectionWithFeatures[] = waterway?.sections ?? [];

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const inFeatures = selectedSectionId != null && selectedSection != null;

  const showProposedToggle = inFeatures && featureTimeline?.onToggleProposed;
  const showFavoriteToggle = inFeatures && onToggleFavorite != null;
  // Desktop only: on a phone these two are on the section speed dial, and
  // having them in both places gave the same action two homes. There is no
  // speed dial on desktop, so the header is where they live there.
  const desktopOnly = { display: { xs: "none", md: "inline-flex" } } as const;
  const actionButton =
    showProposedToggle || showFavoriteToggle || onMobileMapToggle ? (
      <>
        {showProposedToggle && (
          <IconButton
            size="small"
            sx={desktopOnly}
            onClick={featureTimeline.onToggleProposed}
            aria-label={
              featureTimeline.showProposed
                ? "Hide proposed features"
                : "Show proposed features"
            }
            color={featureTimeline.showProposed ? "primary" : undefined}
          >
            <PendingActionsIcon fontSize="small" />
          </IconButton>
        )}
        {showFavoriteToggle && (
          <IconButton
            size="small"
            sx={desktopOnly}
            onClick={() => onToggleFavorite(selectedSection.id)}
            aria-label={
              favoritedIds?.has(selectedSection.id)
                ? "Remove from favorites"
                : "Add to favorites"
            }
          >
            {favoritedIds?.has(selectedSection.id) ? (
              <StarIcon
                fontSize="small"
                sx={{ color: theme.tokens.tertiary }}
              />
            ) : (
              <StarBorderIcon fontSize="small" />
            )}
          </IconButton>
        )}
        {onMobileMapToggle && (
          <IconButton
            size="small"
            onClick={onMobileMapToggle}
            aria-label={mobileMapActive ? "Back to detail" : "View on map"}
            color={mobileMapActive ? "primary" : undefined}
          >
            <MapIcon fontSize="small" />
          </IconButton>
        )}
      </>
    ) : undefined;

  const showNewSectionFab =
    isAuthenticated &&
    tab === "sections" &&
    !inFeatures &&
    selectedSectionId == null;

  const headerTabs = inFeatures
    ? {
        value: sectionDetailTab as string,
        onChange: (t: string) =>
          onSectionDetailTabChange(t as SectionDetailTab),
        options: [
          { value: "features", label: "Features" },
          { value: "logs", label: "Logs" },
          { value: "notes", label: "Notes" },
        ],
      }
    : {
        value: tab as string,
        onChange: (t: string) => onTabChange(t as DetailTab),
        options: [
          { value: "sections", label: "Sections" },
          { value: "gauges", label: "Gauges" },
          { value: "notes", label: "Notes" },
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
            // Overscroll at the list edge must not chain into a document
            // bounce - that drags the fixed overlay and shows the map
            // behind it (the body-level rule alone does not stop chaining
            // that starts inside a scroller).
            overscrollBehavior: "contain",
            p: 1,
            // Leave room so a floating button never covers the last row.
            // Desktop docks its actions in the row below the list, so only
            // the panel's own FAB and the mobile speed dial need it.
            pb: showNewSectionFab
              ? 9
              : inFeatures && sectionDetailTab !== "notes"
                ? { xs: 9, md: 1 }
                : 1,
          }}
        >
          {isLoading ? (
            <LoadingBox size={22} />
          ) : inFeatures ? (
            sectionDetailTab === "logs" ? (
              <SectionLogsList sectionId={selectedSection.id} />
            ) : sectionDetailTab === "notes" ? (
              <CommentThread
                waterwayId={waterwayId}
                sectionId={selectedSection.id}
                mapPin={noteMapPin}
              />
            ) : (
              <FeatureTimeline
                section={selectedSection}
                proposals={featureTimeline?.proposals ?? []}
                showProposed={featureTimeline?.showProposed ?? false}
                onFeatureClick={featureTimeline?.onFeatureClick}
                onEditFeature={featureTimeline?.onEditFeature}
                activeFeatureId={featureTimeline?.activeFeatureId}
                onActiveFeatureChange={featureTimeline?.onActiveFeatureChange}
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
          ) : tab === "notes" ? (
            <CommentThread
              waterwayId={waterwayId}
              sections={sections}
              mapPin={noteMapPin}
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
      </Box>

      {/* Desktop counterpart of the mobile speed dial: a docked row, so it
          never floats over the last list row. */}
      {isAuthenticated && inFeatures && sectionDetailTab !== "notes" && (
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
          {sectionDetailTab === "logs" ? (
            <Button
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              fullWidth
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
            >
              Log descent
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
