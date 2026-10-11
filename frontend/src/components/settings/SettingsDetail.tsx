import Box from "@mui/material/Box";
import PushSettings from "@/components/notifications/PushSettings";
import PanelHeader from "@/components/PanelHeader";
import { theme } from "@/lib/theme";
import AccountSection from "./AccountSection";
import { type GroupId, groupLabel } from "./groups";
import LanguageSection from "./LanguageSection";
import TokensSection from "./TokensSection";

const { tokens } = theme;

function SettingsSection({ group }: { group: GroupId }) {
  if (group === "language") return <LanguageSection />;
  if (group === "tokens") return <TokensSection />;
  if (group === "notifications") return <PushSettings />;
  return <AccountSection />;
}

/** One open section. On a phone it is the overlay, with a back arrow in the
 * panel header; on a desktop the pane beside the list already carries the
 * way back, so it opens with a bold title instead. */
export default function SettingsDetail({
  group,
  overlay,
  onBack,
}: {
  group: GroupId;
  overlay: boolean;
  onBack: () => void;
}) {
  const title = groupLabel(group);
  const body = (
    <Box sx={{ maxWidth: 640 }}>
      <SettingsSection group={group} />
    </Box>
  );

  if (overlay) {
    return (
      <Box
        data-testid="settings-detail"
        sx={{
          position: "fixed",
          inset: 0,
          bottom: `calc(${tokens.chrome.bottomNav}px + env(safe-area-inset-bottom))`,
          zIndex: theme.zIndex.appBar - 1,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
        }}
      >
        <PanelHeader title={title} onBack={onBack} />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 2 }}>
          {body}
        </Box>
      </Box>
    );
  }

  return (
    <Box data-testid="settings-detail" sx={{ minHeight: 0, overflowY: "auto" }}>
      <PanelHeader title={title} />
      <Box sx={{ px: 4, py: 3 }}>{body}</Box>
    </Box>
  );
}
