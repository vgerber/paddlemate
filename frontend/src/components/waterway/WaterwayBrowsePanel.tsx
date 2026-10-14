import AddIcon from "@mui/icons-material/Add";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import MapIcon from "@mui/icons-material/Map";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useMoreBelow } from "@/components/canvas/useMoreBelow";
import DockedAction from "@/components/DockedAction";
import PanelHeader from "@/components/PanelHeader";
import type { EditsFilter } from "@/components/provenance/EditsTimeline";
import SourcesTab from "@/components/provenance/SourcesTab";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import { SwipeGhost } from "@/components/SwipeGhost";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import SectionListItem from "@/components/waterway/SectionListItem";
import SectionLogsList from "@/components/waterway/SectionLogsList";
import FeatureTimeline from "@/components/waterway/section-details";
import {
  gradeLabel,
  sectionGradeOf,
} from "@/components/waterway/section-details/grade";
import { useGradeActions } from "@/components/waterway/section-details/useGradeActions";
import { sectionLengthM } from "@/components/waterway/section-details/utils";
import { useChartGrow } from "@/components/waterway/useChartGrow";
import type {
  Feature,
  Proposal,
  SectionWithFeatures,
  WaterRangeWithStatus,
} from "@/lib/api";
import { lineCoords } from "@/lib/geo";
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
  /** The foot of the card on a wide screen: the reading block beside the
   * rail, or the note that the section has no gauge. Shown on every tab. */
  foot?: ReactNode;
  /** The river-state block under the features list. It takes the pane's
   * spare room (at least 96px) and scrolls with the list when that is long. */
  riverState?: ReactNode;
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
  };
}

const { tokens } = theme;
const { panel } = tokens.canvas;

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
  foot,
  riverState,
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
  const logSearch = {
    waterwayId,
    sectionId: selectedSection?.id,
    startTime: undefined,
  };

  const grade = useGradeActions(
    selectedSection,
    featureTimeline?.onEditFeature,
    () => featureTimeline?.onActiveFeatureChange?.(null),
  );

  // The section's actions live in one overflow menu in the header, on a phone
  // and on a desktop alike; the floating or docked button is only the
  // primary add. Three groups, a divider between: the section's own, the
  // grade, the view toggle.
  const own: RowAction[] = [];
  if (inFeatures && onToggleFavorite) {
    const starred = favoritedIds?.has(selectedSection.id) ?? false;
    own.push({
      label: starred ? "Remove favorite" : "Add favorite",
      icon: starred ? (
        <StarIcon fontSize="small" sx={{ color: tokens.tertiary }} />
      ) : (
        <StarBorderIcon fontSize="small" />
      ),
      onClick: () => onToggleFavorite(selectedSection.id),
    });
  }
  if (inFeatures && isAuthenticated) {
    if (!standingDescent) {
      own.push({
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
    // The Logs tab's docked button is this action.
    if (sectionDetailTab !== "logs") {
      own.push({
        label: "Log descent",
        icon: <DirectionsBoatOutlinedIcon fontSize="small" />,
        onClick: () => navigate({ to: "/logs/new", search: logSearch }),
      });
    }
  }
  const view: RowAction[] = [];
  if (
    inFeatures &&
    sectionDetailTab === "features" &&
    featureTimeline?.onToggleProposed
  ) {
    view.push({
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
  const sectionActions = [own, grade.actions, view].flatMap((group, i, all) =>
    group.map((action, j) => ({
      ...action,
      groupStart: j === 0 && all.slice(0, i).some((g) => g.length > 0),
    })),
  );

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

  const chartTab = (t: string) =>
    inFeatures ? t === "features" : t === "sections" || t === "gauges";
  const tabNames: readonly string[] = inFeatures ? SECTION_TABS : RIVER_TABS;
  const current = inFeatures ? sectionDetailTab : tab;
  const swipeIndex = tabNames.indexOf(current);
  const paneSx = (t: string, live: boolean) => ({
    flex: 1,
    overflowY: "auto",
    // From md every tab of a section is one well: 8 round, 8 between
    // cards. Below it the cards keep their own insets; the river's
    // lists run edge to edge.
    // On a phone only the features tab is a column (the river state
    // takes the spare room).
    display: {
      xs: inFeatures && t === "features" ? "flex" : "block",
      md: "flex",
    },
    flexDirection: "column",
    gap: { md: `${panel.gutter}px` },
    "& > *": { flexShrink: 0 },
    // The features card takes the pane's room and its list scrolls
    // inside it.
    "& > [data-testid='features-card']": { flexShrink: { md: 1 } },
    // A fade over the last 20px says more is below.
    ...(live &&
      moreBelow && {
        maskImage:
          "linear-gradient(to bottom, #000 calc(100% - 20px), transparent)",
      }),
    // Overscroll at the list edge must not chain into a document
    // bounce - that drags the fixed overlay and shows the map
    // behind it (the body-level rule alone does not stop chaining
    // that starts inside a scroller).
    overscrollBehavior: "contain",
    py: 1,
    ...(inFeatures && { p: { md: `${panel.gutter}px` } }),
    // Leave room so a floating button never covers the last row.
    // Desktop docks its actions in the row below the list, so only
    // the panel's own FAB and the mobile speed dial need it.
    pb:
      showNewSectionFab || (inFeatures && (t === "features" || t === "logs"))
        ? { xs: 9, md: inFeatures ? `${panel.gutter}px` : 0 }
        : 1,
  });
  const paneBody = (t: string) => (
    <>
      {!isLoading && chartTab(t) && chart}
      {isLoading ? (
        <LoadingBox size={22} />
      ) : inFeatures ? (
        t === "logs" ? (
          <SectionLogsList sectionId={selectedSection.id} />
        ) : t === "sources" ? (
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
        ) : t === "notes" ? (
          <CommentThread
            waterwayId={waterwayId}
            sectionId={selectedSection.id}
            mapPin={noteMapPin}
          />
        ) : (
          <>
            <FeatureTimeline
              section={selectedSection}
              proposals={featureTimeline?.proposals ?? []}
              showProposed={featureTimeline?.showProposed ?? false}
              onFeatureClick={featureTimeline?.onFeatureClick}
              onEditFeature={featureTimeline?.onEditFeature}
              activeFeatureId={featureTimeline?.activeFeatureId}
              onActiveFeatureChange={featureTimeline?.onActiveFeatureChange}
              onOpenHistory={(filter) => {
                setEditsFilter({ sectionId: selectedSection.id, filter });
                onSectionDetailTabChange("sources");
              }}
            />
            <Box
              data-testid="river-state-slot"
              sx={{
                flex: "1 1 0",
                mx: { xs: 1.5, md: 0 },
                minHeight: { xs: riverState ? 96 : 0, md: 0 },
              }}
            >
              {riverState}
            </Box>
          </>
        )
      ) : t === "sections" ? (
        <SectionsList
          sections={sections}
          waterwayId={waterwayId}
          selectedSectionId={selectedSectionId}
          onSectionClick={onSectionClick}
          descentCounts={descentCounts}
        />
      ) : t === "notes" ? (
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
    </>
  );

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

  // The swipe hook owns the pane's ref; the fade reads the same element.
  const [pane, setPaneEl] = useState<HTMLElement | null>(null);
  const swipePaneRef = useRef(swipe.paneProps.ref);
  swipePaneRef.current = swipe.paneProps.ref;
  const setPane = useCallback((el: HTMLElement | null) => {
    swipePaneRef.current(el);
    setPaneEl(el);
  }, []);
  const moreBelow = useMoreBelow(pane);
  const phone = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  useChartGrow(pane, phone && inFeatures && sectionDetailTab === "features");

  const headerTabs = inFeatures
    ? {
        track: swipe.track,
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
        track: swipe.track,
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
        <ErrorState
          error={error}
          fallback="Could not load this river."
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      {grade.dialog}
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
              ? sectionSubtitle(waterway?.name ?? "", selectedSection)
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
            ref={setPane}
            sx={paneSx(current, true)}
          >
            {paneBody(current)}
          </Box>
          <SwipeGhost
            swipe={swipe}
            index={swipeIndex}
            count={tabNames.length}
            sx={(i) => paneSx(tabNames[i], false)}
          >
            {(i) => paneBody(tabNames[i])}
          </SwipeGhost>

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
            inset={panel.gutter}
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
              inset={panel.gutter}
              label="Log descent"
              onClick={() => navigate({ to: "/logs/new", search: logSearch })}
            />
          ) : (
            <DockedAction
              inset={panel.gutter}
              label="New feature"
              onClick={() => onSuggestModeChange("feature")}
            />
          ))}
        {!isLoading && foot}
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
    return <EmptyState title="No sections found." py={4} />;
  }
  return (
    <List dense disablePadding sx={{ px: { xs: 1.5, md: 0 } }}>
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

/** "Pitze · Grade III (IV) · 5.8 km": the river, the section's own grade when
 * one range covers most of it (that range is not listed as a feature), and
 * its length. */
function sectionSubtitle(river: string, section: SectionWithFeatures): string {
  const grade = sectionGradeOf(section);
  const km = sectionLengthM(lineCoords(section.location) ?? []) / 1000;
  return [
    river,
    grade && `Grade ${gradeLabel(grade)}`,
    km > 0 && `${km.toFixed(1)} km`,
  ]
    .filter(Boolean)
    .join(" · ");
}
