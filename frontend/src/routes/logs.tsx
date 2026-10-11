import AddIcon from "@mui/icons-material/Add";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  createFileRoute,
  Outlet,
  useChildMatches,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import DockedAction from "@/components/DockedAction";
import ListPaneHeader from "@/components/ListPaneHeader";
import MyLogsPanel from "@/components/logs-page/MyLogsPanel";
import SocialPanel from "@/components/logs-page/SocialPanel";
import PanelHeader from "@/components/PanelHeader";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { useSwipeTabs } from "@/lib/hooks/useSwipeTabs";
import { BOTTOM_NAV_SPACE, PANEL_HEIGHT, theme } from "@/lib/theme";

const { tokens } = theme;

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

const TABS = ["mine", "social"] as const;
type LogsTab = (typeof TABS)[number];

function LogsPage() {
  const childMatches = useChildMatches();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [tab, setTab] = useState<LogsTab>("mine");
  // The open log comes from the child route rather than a search param: the
  // log already had its own address, and /logs/123 has to keep working.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const selectedId = Number(pathname.match(/^\/logs\/(\d+)/)?.[1]) || undefined;
  const hasChild = childMatches.length > 0;
  // The same cached query the list panel reads, so the count costs no
  // extra request - it just has to be known one level up to be shown.
  const { data: myDescents } = useMyDescents({}, isAuthenticated);

  // On a phone the log replaces the list; on a desktop it opens beside it.
  if (isMobile && hasChild) return <Outlet />;

  const onOpen = (id: number) =>
    navigate({
      to: "/logs/$descentId",
      params: { descentId: String(id) },
      search: { edit: false },
    });

  const onNew = () =>
    navigate({
      to: "/logs/new",
      search: {
        waterwayId: undefined,
        sectionId: undefined,
        startTime: undefined,
      },
    });

  if (sessionLoading) {
    return <LoadingBox size={40} pt={8} />;
  }

  // A public log is readable signed out, so the child route still renders.
  if (!isAuthenticated) {
    if (hasChild) return <Outlet />;
    return (
      <SignInGate
        icon={<DirectionsBoatOutlinedIcon />}
        title="Sign in to view your logs"
      />
    );
  }

  const list = (
    <LogsList
      tab={tab}
      onTabChange={setTab}
      onOpen={onOpen}
      selectedId={selectedId}
      count={myDescents?.total}
    />
  );

  if (isMobile) {
    return (
      <Box sx={{ minHeight: PANEL_HEIGHT, bgcolor: tokens.surfaceLow }}>
        <Box sx={{ maxWidth: 720, mx: "auto" }}>{list}</Box>
        {tab === "mine" && (
          <Fab
            color="secondary"
            aria-label="Log descent"
            onClick={onNew}
            sx={{
              position: "fixed",
              bottom: `calc(${BOTTOM_NAV_SPACE} + 16px)`,
              right: 16,
            }}
          >
            <AddIcon />
          </Fab>
        )}
      </Box>
    );
  }

  // Desktop: the log list beside the open log, so moving between a week's
  // descents never costs a navigation round trip.
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          md: "320px minmax(0, 1fr)",
          lg: "420px minmax(0, 1fr)",
        },
        height: PANEL_HEIGHT,
        bgcolor: tokens.surfaceLow,
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{list}</Box>
        {tab === "mine" && <DockedAction label="Log descent" onClick={onNew} />}
      </Box>
      <Box sx={{ minHeight: 0, overflowY: "auto", p: 1.5 }}>
        <Box
          sx={{
            maxWidth: 880,
            minHeight: "100%",
            boxSizing: "border-box",
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e1,
          }}
        >
          {hasChild ? (
            <Outlet />
          ) : (
            <EmptyState
              icon={<DirectionsBoatOutlinedIcon />}
              title="Pick a log to open it."
              py={10}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

function LogsList({
  tab,
  onTabChange,
  onOpen,
  selectedId,
  count,
}: {
  tab: LogsTab;
  onTabChange: (tab: LogsTab) => void;
  onOpen: (id: number) => void;
  selectedId?: number;
  count?: number;
}) {
  const swipe = useSwipeTabs({
    index: TABS.indexOf(tab),
    count: TABS.length,
    onIndexChange: (i) => onTabChange(TABS[i]),
  });
  return (
    <>
      <ListPaneHeader
        count={tab === "mine" ? count : undefined}
        noun={{ one: "log", other: "logs" }}
      />
      <PanelHeader
        tabs={{
          value: tab,
          onChange: onTabChange,
          progress: swipe.progress,
          dragging: swipe.dragging,
          gesture: swipe.gestureProps,
          options: [
            { value: "mine", label: "My logs" },
            { value: "social", label: "Social" },
          ],
        }}
      />
      <Box {...swipe.paneProps} sx={{ px: 1.5, py: 1.5 }}>
        {tab === "mine" ? (
          <MyLogsPanel onOpen={onOpen} selectedId={selectedId} />
        ) : (
          <SocialPanel />
        )}
      </Box>
    </>
  );
}
