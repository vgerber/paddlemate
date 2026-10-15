import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import NotificationList from "@/components/notifications/NotificationList";
import PanelHeader from "@/components/PanelHeader";
import { type GroupId, parseGroup } from "@/components/settings/groups";
import SettingsDetail from "@/components/settings/SettingsDetail";
import SettingsList from "@/components/settings/SettingsList";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import ToolsList from "@/components/ToolsList";
import { useSession } from "@/lib/hooks/useSession";
import { PANEL_HEIGHT, theme } from "@/lib/theme";

type PhoneTab = "profile" | "inbox" | "tools";

const PHONE_TABS: { value: PhoneTab; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "inbox", label: "Inbox" },
  { value: "tools", label: "Tools" },
];

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { group?: GroupId } => ({
    // The open section; keeps it linkable. On a phone it is the overlay.
    group: parseGroup(search.group),
  }),
  component: SettingsPage,
});

const Version = () => (
  <Typography
    color="textSecondary"
    sx={{ fontSize: "0.8125rem", fontWeight: 500 }}
  >
    v{__COMMIT_HASH__}
  </Typography>
);

function SettingsPage() {
  const [tab, setTab] = useState<PhoneTab>("profile");
  const { isAuthenticated, isLoading } = useSession();
  const navigate = useNavigate({ from: "/settings" });
  const { group } = Route.useSearch();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  if (isLoading) {
    return <LoadingBox size={40} pt={8} />;
  }

  if (!isAuthenticated) {
    return (
      <SignInGate
        icon={<AccountCircleOutlinedIcon />}
        title="Sign in to access settings"
      />
    );
  }

  const open = (id: GroupId) =>
    navigate({ search: (prev) => ({ ...prev, group: id }) });

  // A phone reaches the tools through here, because its bottom bar has no
  // room for them; on a desktop they are already a nav item, so settings is
  // settings and the groups become the list beside them.
  if (!isDesktop) {
    return (
      <Box>
        <PanelHeader
          tabs={{ value: tab, onChange: setTab, options: PHONE_TABS }}
        />
        {tab === "profile" && (
          <>
            <SettingsList onOpen={open} />
            <Box sx={{ px: 2, pt: 1.75, pb: 1 }}>
              <Version />
            </Box>
          </>
        )}
        {/* The inbox is a list, edge to edge like every other list. */}
        {tab === "inbox" && <NotificationList cards />}
        {tab === "tools" && (
          <Box sx={{ px: 1.5, py: 3 }}>
            <ToolsList />
          </Box>
        )}
        {group && (
          <SettingsDetail
            group={group}
            overlay
            onBack={() => navigate({ search: {} })}
          />
        )}
      </Box>
    );
  }

  const openGroup: GroupId = group ?? "account";

  return (
    <Box
      data-testid="settings-page"
      sx={{
        display: "flex",
        justifyContent: "center",
        gap: 4,
        px: 4,
        height: PANEL_HEIGHT,
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          width: 240,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          pt: 2,
        }}
      >
        <SettingsList selected={openGroup} onOpen={open} />
        <Box sx={{ px: 2, pt: 1.75, pb: 1, flexShrink: 0 }}>
          <Version />
        </Box>
      </Box>
      <Box
        sx={{
          width: 720,
          minWidth: 0,
          flexShrink: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <SettingsDetail
          group={openGroup}
          overlay={false}
          onBack={() => navigate({ search: {} })}
        />
      </Box>
    </Box>
  );
}
