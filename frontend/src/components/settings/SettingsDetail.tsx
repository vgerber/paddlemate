import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { phoneCardSx } from "@/components/canvas/flatRow";
import PushSettings from "@/components/notifications/PushSettings";
import PanelHeader from "@/components/PanelHeader";
import { SYSTEM_INSET, theme } from "@/lib/theme";
import AccountSection from "./AccountSection";
import AppearanceSection from "./AppearanceSection";
import { type GroupId, groupLabel } from "./groups";
import LanguageSection from "./LanguageSection";
import TokensSection from "./TokensSection";

const { tokens } = theme;
const { phone } = tokens;

function SettingsSection({ group }: { group: GroupId }) {
  if (group === "language") return <LanguageSection />;
  if (group === "appearance") return <AppearanceSection />;
  if (group === "tokens") return <TokensSection />;
  if (group === "notifications") return <PushSettings />;
  return <AccountSection />;
}

/** One open section. On a phone it is the overlay, with a back arrow in the
 * panel header; on a desktop the column beside the nav already carries the
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
    <Box sx={overlay ? { maxWidth: 640 } : undefined}>
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
          bottom: `calc(${tokens.chrome.bottomNav}px + ${SYSTEM_INSET})`,
          zIndex: theme.zIndex.appBar - 1,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
        }}
      >
        <PanelHeader title={title} onBack={onBack} />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: 1.5 }}>
          <Box sx={{ ...phoneCardSx, p: `${phone.inner}px` }}>{body}</Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      data-testid="settings-detail"
      sx={{ minHeight: 0, overflowY: "auto", py: 2 }}
    >
      <Box
        sx={{
          p: 3,
          bgcolor: tokens.surfaceLowest,
          borderRadius: `${tokens.radii.lg}px`,
          boxShadow: tokens.elevation.e1,
        }}
      >
        <Typography
          component="h2"
          sx={{ fontSize: "1.125rem", fontWeight: 700, mb: 2 }}
        >
          {title}
        </Typography>
        {body}
      </Box>
    </Box>
  );
}
