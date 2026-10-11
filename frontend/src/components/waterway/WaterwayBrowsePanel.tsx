import AddIcon from "@mui/icons-material/Add";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import MapIcon from "@mui/icons-material/Map";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import DockedAction from "@/components/DockedAction";
import PanelHeader from "@/components/PanelHeader";
import type { EditsFilter } from "@/components/provenance/EditsTimeline";
import SourcesTab from "@/components/provenance/SourcesTab";
import RowMenu, { type RowAction } from "@/components/RowMenu";
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
import { apiErrorMessage } from "@/lib/api/client";
import { useSectionDescentCounts } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
import { useSwipeTabs } from "@/lib/hooks/useSwipeTabs";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { localizedName } from "@/lib/localization";
import { theme } from "@/lib/theme";
import CommentThread from "./CommentThread";
import GaugesList from "./GaugesList";
import type { DetailTab, SectionDetailTab, SuggestMode } from "./types";

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
  /** The chart card, shown at the top of the tabs it belongs to (the section's
   * Features, the river's Sections and Gauges). */
  chart?: ReactNode;
  /** Everything the section feature timeline needs - passed through as one
   * group instead of loose props. */
  featureTimeline?: {
    onFeatureClick?: (coords: [number, number] | null) => void;
    onEditFeature?: (f: Feature) => void;
    activeFeatureId?: number | null;
    onActiveFeatureChange?: (id: number | null) => void;
    showProposed?: boolean;
    onToggleProposed?: () => void;
    proposals?: Proposal[];
    onFoldedChange?: (folded: boolean) => void;
  };
}

const { tokens } = theme;

/** The header's icons are small to look at and 44px to hit. */
const headerIconSx = {
  width: tokens.touch.min,
  height: tokens.touch.min,
} as const;

const SECTION_TABS: SectionDetailTab[] = [
  "features",
  "logs",
  "notes",
  "sources",
];
const RIVER_TABS: DetailTab[] = ["sections", "gauges", "notes"];

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
  chart,
  featureTimeline,
}: WaterwayBrowsePanelProps) {
  const navigate = useNavigate();
  // The entry the Sources tab is narrowed to; a new section starts unfiltered.
  const [editsFilter, setEditsFilter] = useState<{
    sectionId: number | undefined;
    filter: EditsFilter;
  }>({ sectionId: undefined, filter: null });
  const {
    data: waterway,
    isLoading,
    isError,
    error,
    refetch,
  } = useWaterway(waterwayId);
  const { data: descentCounts } = useSectionDescentCounts(waterwayId);
  const { isAuthenticated } = useSession();
  const sections: SectionWithFeatures[] = waterway?.sections ?? [];

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const inFeatures = selectedSectionId != null && selectedSection != null;

  const { current: standingDescent, start: startDescent } =
    useStandingDescent();

  // The section's actions live in one overflow menu in the header, on a phone
  // and on a desktop alike; the floating or docked button is only the
  // primary add.
  const sectionActions: RowAction[] = [];
  if (inFeatures && onToggleFavorite) {
    const starred = favoritedIds?.has(selectedSection.id) ?? false;
    sectionActions.push({
      label: starred ? "Remove favorite" : "Add favorite",
      icon: starred ? (
        <StarIcon fontSize="small" sx={{ color: tokens.tertiary }} />
      ) : (
        <StarBorderIcon fontSize="small" />
      ),
      onClick: () => onToggleFavorite(selectedSection.id),
    });
  }
  if (
    inFeatures &&
    sectionDetailTab === "features" &&
    featureTimeline?.onToggleProposed
  ) {
    sectionActions.push({
      label: featureTimeline.showProposed
        ? "Hide proposed features"
        : "Show proposed features",
      icon: (
        <PendingActionsOutlinedIcon
          fontSize="small"
          sx={
            featureTimeline.showProposed ? { color: tokens.primary } : undefined
          }
        />
      ),
      onClick: featureTimeline.onToggleProposed,
    });
  }
  if (inFeatures && isAuthenticated) {
    if (!standingDescent) {
      sectionActions.push({
        label: "Start descent",
        icon: <PlayArrowOutlinedIcon fontSize="small" />,
        onClick: () =>
          startDescent({
            startTime: new Date().toISOString(),
            waterwayId,
            sectionId: selectedSection.id,
            sectionName: selectedSection.name,
          }),
      });
    }
    sectionActions.push({
      label: "Log descent",
      icon: <DirectionsBoatOutlinedIcon fontSize="small" />,
      onClick: () =>
        navigate({
          to: "/logs/new",
          search: {
            waterwayId,
            sectionId: selectedSection.id,
            startTime: undefined,
          },
        }),
    });
  }

  const actionButton =
    sectionActions.length > 0 || onMobileMapToggle ? (
      <>
        <RowMenu actions={sectionActions} label="Section actions" />
        {onMobileMapToggle && (
          <IconButton
            size="small"
            sx={headerIconSx}
            onClick={onMobileMapToggle}
            aria-label={mobileMapActive ? "Back to detail" : "View on map"}
            color={mobileMapActive ? "primary" : undefined}
          >
            <MapIcon fontSize="small" />
          </IconButton>
        )}
      </>
    ) : undefined;

  const chartTab = inFeatures
    ? sectionDetailTab === "features"
    : tab === "sections" || tab === "gauges";

  const showNewSectionFab =
    isAuthenticated &&
    tab === "sections" &&
    !inFeatures &&
    selectedSectionId == null;

  // One swipe for whichever tab bar is showing: the section's or the river's.
  const swipe = useSwipeTabs({
    index: inFeatures
      ? SECTION_TABS.indexOf(sectionDetailTab)
      : RIVER_TABS.indexOf(tab),
    count: inFeatures ? SECTION_TABS.length : RIVER_TABS.length,
    onIndexChange: (i) =>
      inFeatures
        ? onSectionDetailTabChange(SECTION_TABS[i])
        : onTabChange(RIVER_TABS[i]),
    enabled: !isLoading,
  });

  const headerTabs = inFeatures
    ? {
        progress: swipe.progress,
        dragging: swipe.dragging,
        gesture: swipe.gestureProps,
        value: sectionDetailTab as string,
        onChange: (t: string) =>
          onSectionDetailTabChange(t as SectionDetailTab),
        options: [
          { value: "features", label: "Features" },
          { value: "logs", label: "Logs" },
          { value: "notes", label: "Notes" },
          { value: "sources", label: "Sources" },
        ],
      }
    : {
        progress: swipe.progress,
        dragging: swipe.dragging,
        gesture: swipe.gestureProps,
        value: tab as string,
        onChange: (t: string) => onTabChange(t as DetailTab),
        options: [
          { value: "sections", label: "Sections" },
          { value: "gauges", label: "Gauges" },
          { value: "notes", label: "Notes" },
        ],
      };

  if (isError && !waterway) {
    return (
      <>
        <PanelHeader
          title={selectedSectionId != null ? "Section" : "River"}
          onBack={selectedSectionId != null ? onSectionDeselect : onBack}
        />
        <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
          <Typography variant="body2" color="textSecondary">
            {apiErrorMessage(error, "The river could not be loaded.")}
          </Typography>
          <Button onClick={() => refetch()}>Retry</Button>
        </Box>
      </>
    );
  }

  return (
    <>
      <Box
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PanelHeader
          title={
            inFeatures
              ? localizedName(selectedSection.name, selectedSection.names)
              : (waterway?.name ?? "…")
          }
          subtitle={
            inFeatures
              ? (waterway?.name ?? "")
              : (waterway?.waterway_type ?? "")
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
            overflowX: "hidden",
          }}
        >
          <Box
            data-testid="tab-pane"
            {...swipe.paneProps}
            sx={{
              flex: 1,
              overflowY: "auto",
              // Overscroll at the list edge must not chain into a document
              // bounce - that drags the fixed overlay and shows the map
              // behind it (the body-level rule alone does not stop chaining
              // that starts inside a scroller).
              overscrollBehavior: "contain",
              py: 1,
              // Leave room so a floating button never covers the last row.
              // Desktop docks its actions in the row below the list, so only
              // the panel's own FAB and the mobile speed dial need it.
              pb:
                showNewSectionFab ||
                (inFeatures &&
                  (sectionDetailTab === "features" ||
                    sectionDetailTab === "logs"))
                  ? { xs: 9, md: 1 }
                  : 1,
            }}
          >
            {!isLoading && chartTab && chart}
            {isLoading ? (
              <LoadingBox size={22} />
            ) : inFeatures ? (
              sectionDetailTab === "logs" ? (
                <SectionLogsList sectionId={selectedSection.id} />
              ) : sectionDetailTab === "sources" ? (
                <SourcesTab
                  section={selectedSection}
                  filter={
                    editsFilter.sectionId === selectedSection.id
                      ? editsFilter.filter
                      : null
                  }
                  onFilterChange={(filter) =>
                    setEditsFilter({ sectionId: selectedSection.id, filter })
                  }
                  onEditFeature={featureTimeline?.onEditFeature}
                />
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
                  onFoldedChange={featureTimeline?.onFoldedChange}
                  onOpenHistory={(filter) => {
                    setEditsFilter({ sectionId: selectedSection.id, filter });
                    onSectionDetailTabChange("sources");
                  }}
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
              sx={{
                position: "absolute",
                bottom: 16,
                right: 16,
                display: { xs: "flex", md: "none" },
              }}
            >
              <AddIcon />
            </Fab>
          )}
        </Box>

        {showNewSectionFab && (
          <DockedAction
            label="New section"
            onClick={() => onSuggestModeChange("section")}
          />
        )}

        {/* Desktop counterpart of the mobile speed dial, docked like every
          other pane's action. */}
        {isAuthenticated &&
          inFeatures &&
          (sectionDetailTab === "features" || sectionDetailTab === "logs") &&
          (sectionDetailTab === "logs" ? (
            <DockedAction
              label="Log descent"
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
            />
          ) : (
            <DockedAction
              label="New feature"
              onClick={() => onSuggestModeChange("feature")}
            />
          ))}
      </Box>
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
      <Typography color="textSecondary" variant="body2" sx={{ p: 1.5 }}>
        No sections found.
      </Typography>
    );
  }
  return (
    <List dense disablePadding sx={{ px: 1.5 }}>
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
