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
import { useCanvasScene } from "@/components/canvas/CanvasContext";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import { isLogFormRoute } from "@/components/canvas/canvasRoutes";
import FloatingCard from "@/components/canvas/FloatingCard";
import DockedAction from "@/components/DockedAction";
import ListPaneHeader from "@/components/ListPaneHeader";
import MyLogsPanel from "@/components/logs-page/MyLogsPanel";
import SocialPanel from "@/components/logs-page/SocialPanel";
import { useLogsScene } from "@/components/logs-page/useLogsScene";
import { fabRoom, fabSx } from "@/components/PaneFab";
import PanelHeader from "@/components/PanelHeader";
import { SwipeGhost } from "@/components/SwipeGhost";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { useSwipeTabs } from "@/lib/hooks/useSwipeTabs";
import { AddIcon, LogIcon } from "@/lib/icons";
import { PANEL_HEIGHT, theme } from "@/lib/theme";

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
  const search = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const hasChild = childMatches.length > 0;
  // The same cached query the list panel reads, so the count costs no
  // extra request - it just has to be known one level up to be shown.
  const { data: myDescents } = useMyDescents({}, isAuthenticated);
  // Drawn by the canvas host from md; called on a phone too, where it is
  // harmless.
  useCanvasScene(useLogsScene(selectedId, isAuthenticated));

  // On a phone the log replaces the list; on a desktop it opens beside it.
  if (isMobile && hasChild) return <Outlet />;

  const onOpen = (id: number) =>
    navigate({
      to: "/logs/$descentId",
      params: { descentId: String(id) },
      search: { edit: undefined },
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
        floating
        icon={<LogIcon />}
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
            color="primary"
            aria-label="Log descent"
            onClick={onNew}
            sx={fabSx}
          >
            <AddIcon />
          </Fab>
        )}
      </Box>
    );
  }

  // The log form has its own picker map, so the canvas map steps aside and
  // the form takes the page.
  if (isLogFormRoute(pathname, search)) {
    return (
      <Box
        sx={{
          minHeight: PANEL_HEIGHT,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Outlet />
      </Box>
    );
  }

  // Desktop: the list and the open log float over the map, which draws the
  // open log (or all of them).
  return (
    <CanvasLayout>
      <FloatingCard
        id="list"
        side="left"
        kind="list"
        screen="logs"
        title="Logs"
        selfHeaded
        fullHeight
      >
        <Box
          sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{list}</Box>
          {tab === "mine" && (
            <DockedAction label="Log descent" onClick={onNew} />
          )}
        </Box>
      </FloatingCard>
      {hasChild && (
        <FloatingCard
          id="log"
          side="right"
          kind="side"
          screen="logs"
          title="Log"
          selfHeaded
        >
          <Box
            sx={{
              minHeight: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Outlet />
          </Box>
        </FloatingCard>
      )}
    </CanvasLayout>
  );
}

const paneSx = { p: { xs: 1.5, md: 0 }, pb: { ...fabRoom, md: 0 } };

function LogsTabBody({
  tab,
  onOpen,
  selectedId,
}: {
  tab: LogsTab;
  onOpen: (id: number) => void;
  selectedId?: number;
}) {
  return tab === "mine" ? (
    <MyLogsPanel onOpen={onOpen} selectedId={selectedId} />
  ) : (
    <SocialPanel />
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
    // On a phone the pane runs down to the bottom nav, so a swipe anywhere
    // below the tabs turns the page, not only over the rows.
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: { xs: PANEL_HEIGHT.xs, md: 0 },
      }}
    >
      {tab === "mine" && <ListPaneHeader count={count} noun="log" />}
      <PanelHeader
        tabs={{
          value: tab,
          onChange: onTabChange,
          track: swipe.track,
          gesture: swipe.gestureProps,
          options: [
            { value: "mine", label: "My logs" },
            { value: "social", label: "Social" },
          ],
        }}
      />
      <Box
        sx={{
          position: "relative",
          overflowX: "clip",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box {...swipe.paneProps} sx={{ ...paneSx, flex: 1 }}>
          <LogsTabBody tab={tab} onOpen={onOpen} selectedId={selectedId} />
        </Box>
        <SwipeGhost
          swipe={swipe}
          index={TABS.indexOf(tab)}
          count={TABS.length}
          sx={() => paneSx}
        >
          {(i) => <LogsTabBody tab={TABS[i]} onOpen={onOpen} />}
        </SwipeGhost>
      </Box>
    </Box>
  );
}
