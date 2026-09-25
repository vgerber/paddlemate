import AddIcon from "@mui/icons-material/Add";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
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
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { theme } from "@/lib/theme";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

function LogsPage() {
  const childMatches = useChildMatches();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [tab, setTab] = useState(0);
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
        icon={
          <DirectionsBoatOutlinedIcon
            sx={{ fontSize: 56, color: "text.disabled" }}
          />
        }
        title="Sign in to view your logs"
      />
    );
  }

  return isMobile ? (
    <LogsMobile tab={tab} onTabChange={setTab} onOpen={onOpen} onNew={onNew} />
  ) : (
    <LogsDesktop
      tab={tab}
      onTabChange={setTab}
      onOpen={onOpen}
      onNew={onNew}
      selectedId={selectedId}
      hasChild={hasChild}
      logCount={myDescents?.total}
    />
  );
}

interface LogsViewProps {
  tab: number;
  onTabChange: (tab: number) => void;
  onOpen: (id: number) => void;
  onNew: () => void;
}

function LogsMobile({ tab, onTabChange, onOpen, onNew }: LogsViewProps) {
  return (
    <>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <LogsTabs tab={tab} onTabChange={onTabChange} />
        <LogsTabContent tab={tab} onOpen={onOpen} />
      </Box>
      {tab === 0 && (
        <Fab
          color="secondary"
          onClick={onNew}
          sx={{
            position: "fixed",
            bottom: "calc(56px + env(safe-area-inset-bottom) + 16px)",
            right: 16,
          }}
        >
          <AddIcon />
        </Fab>
      )}
    </>
  );
}

/** Desktop: the log list beside the open log, so moving between a week's
 * descents never costs a navigation round trip. */
function LogsDesktop({
  tab,
  onTabChange,
  onOpen,
  onNew,
  selectedId,
  hasChild,
  logCount,
}: LogsViewProps & {
  selectedId?: number;
  hasChild: boolean;
  logCount?: number;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          md: "320px minmax(0, 1fr)",
          lg: "420px minmax(0, 1fr)",
        },
        height: "calc(100vh - 48px)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          bgcolor: theme.tokens.surfaceLow,
          borderRight: "1px solid",
          borderColor: `${theme.tokens.outlineVariant}55`,
        }}
      >
        <ListPaneHeader count={tab === 0 ? logCount : undefined} />
        <LogsTabs tab={tab} onTabChange={onTabChange} />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <LogsTabContent
            tab={tab}
            onOpen={onOpen}
            selectedId={selectedId}
            flush
          />
        </Box>
        {tab === 0 && <DockedAction label="Log descent" onClick={onNew} />}
      </Box>
      <Box sx={{ minHeight: 0, overflowY: "auto" }}>
        {hasChild ? (
          <Outlet />
        ) : (
          <EmptyState
            icon={
              <DirectionsBoatOutlinedIcon
                sx={{ fontSize: 48, color: "text.disabled" }}
              />
            }
            title="Pick a log to open it."
            py={10}
          />
        )}
      </Box>
    </Box>
  );
}

function LogsTabs({
  tab,
  onTabChange,
}: {
  tab: number;
  onTabChange: (tab: number) => void;
}) {
  return (
    <Tabs
      value={tab}
      onChange={(_, v) => onTabChange(v)}
      variant="fullWidth"
      sx={{ borderBottom: "1px solid", borderColor: "divider" }}
    >
      <Tab
        icon={<DirectionsBoatOutlinedIcon fontSize="small" />}
        iconPosition="start"
        label="My Logs"
      />
      <Tab
        icon={<PeopleAltOutlinedIcon fontSize="small" />}
        iconPosition="start"
        label="Social"
      />
    </Tabs>
  );
}

function LogsTabContent({
  tab,
  onOpen,
  selectedId,
  flush,
}: {
  tab: number;
  onOpen: (id: number) => void;
  selectedId?: number;
  flush?: boolean;
}) {
  return (
    <Box sx={{ px: flush ? 0 : 2, py: flush ? 2 : 3 }}>
      {tab === 0 && (
        <MyLogsPanel onOpen={onOpen} selectedId={selectedId} flush={flush} />
      )}
      {/* Social is follows, not logs, so it keeps its own padding. */}
      {tab === 1 && (
        <Box sx={{ px: flush ? 1.5 : 0 }}>
          <SocialPanel />
        </Box>
      )}
    </Box>
  );
}
