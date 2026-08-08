import AddIcon from "@mui/icons-material/Add";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  createFileRoute,
  Outlet,
  useChildMatches,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import MyLogsPanel from "@/components/logs-page/MyLogsPanel";
import SocialPanel from "@/components/logs-page/SocialPanel";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
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

  if (childMatches.length > 0) return <Outlet />;

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

  if (!isAuthenticated) {
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
    <LogsDesktop tab={tab} onTabChange={setTab} onOpen={onOpen} onNew={onNew} />
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

function LogsDesktop({ tab, onTabChange, onOpen, onNew }: LogsViewProps) {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {tab === 0 && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", px: 2, pt: 2 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
            Log descent
          </Button>
        </Box>
      )}
      <LogsTabs tab={tab} onTabChange={onTabChange} />
      <LogsTabContent tab={tab} onOpen={onOpen} />
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
}: {
  tab: number;
  onOpen: (id: number) => void;
}) {
  return (
    <Box sx={{ px: 2, py: 3 }}>
      {tab === 0 && <MyLogsPanel onOpen={onOpen} />}
      {tab === 1 && <SocialPanel />}
    </Box>
  );
}
