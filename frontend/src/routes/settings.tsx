import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DoneIcon from "@mui/icons-material/Done";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import Fact from "@/components/Fact";
import LanguagePicker from "@/components/LanguagePicker";
import NotificationList from "@/components/notifications/NotificationList";
import PushSettings from "@/components/notifications/PushSettings";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import ToolsList from "@/components/ToolsList";
import FormSection from "@/components/waterway/FormSection";
import { type ApiToken, type ApiTokenCreated } from "@/lib/api";
import { ACCOUNT_CONSOLE_URL } from "@/lib/auth";
import {
  useApiTokens,
  useCreateApiToken,
  useRevokeApiToken,
} from "@/lib/hooks/useApiTokens";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { useSession } from "@/lib/hooks/useSession";
import { useLanguagePreference } from "@/lib/languagePreference";
import { fonts, theme } from "@/lib/theme";

/** The groups the desktop sidebar lists. Adding one is a row here plus a
 * case in `GroupContent`. */
const GROUPS = [
  { id: "account", label: "Account", hint: "Who you are signed in as" },
  { id: "language", label: "Display language", hint: "Which names are shown" },
  {
    id: "notifications",
    label: "Notifications",
    hint: "Push when trip plans change",
  },
  { id: "tokens", label: "Access tokens", hint: "For scripts and the API" },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

const isGroupId = (v: unknown): v is GroupId => GROUPS.some((g) => g.id === v);

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { group?: GroupId } => ({
    // Which group the desktop pane shows; keeps it linkable.
    group: isGroupId(search.group) ? search.group : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [tab, setTab] = useState(0);
  const { isAuthenticated, isLoading } = useSession();
  const navigate = useNavigate({ from: "/settings" });
  const { group } = Route.useSearch();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const openGroup: GroupId = group ?? "account";

  if (isLoading) {
    return <LoadingBox size={40} pt={8} />;
  }

  if (!isAuthenticated) {
    return (
      <SignInGate
        icon={
          <AccountCircleOutlinedIcon
            sx={{ fontSize: 56, color: "text.disabled" }}
          />
        }
        title="Sign in to access settings"
      />
    );
  }

  // A phone reaches the tools through here, because its bottom bar has no
  // room for them; on a desktop they are already a nav item, so settings is
  // settings and the groups become the list beside them.
  if (!isDesktop) {
    return (
      <Box>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{ borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Tab
            icon={<AccountCircleOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Profile"
          />
          <Tab
            icon={<NotificationsNoneOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Inbox"
          />
          <Tab
            icon={<BuildOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Tools"
          />
        </Tabs>
        {/* The inbox is a list, edge to edge like every other list. */}
        {tab === 1 && <NotificationList />}
        {tab !== 1 && (
          <Box sx={{ px: 2, py: 3 }}>
            {tab === 0 && <ProfilePanel />}
            {tab === 2 && <ToolsList />}
          </Box>
        )}
      </Box>
    );
  }

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
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {GROUPS.map((g) => (
            <ListItemButton
              key={g.id}
              selected={g.id === openGroup}
              onClick={() =>
                navigate({ search: (prev) => ({ ...prev, group: g.id }) })
              }
              sx={{
                display: "block",
                borderBottom: "1px solid",
                borderColor: `${theme.tokens.outlineVariant}55`,
                py: 1.25,
              }}
            >
              <Typography
                sx={{
                  fontFamily: fonts.label,
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                }}
              >
                {g.label}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {g.hint}
              </Typography>
            </ListItemButton>
          ))}
        </Box>
        {/* Docked, the way every other list pane carries its own footer. */}
        <Box
          sx={{
            px: 2,
            py: 1,
            flexShrink: 0,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.disabled">
            v{__COMMIT_HASH__}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ minHeight: 0, overflowY: "auto", px: 4, py: 3 }}>
        <Box sx={{ maxWidth: 640 }}>
          <GroupContent group={openGroup} />
        </Box>
      </Box>
    </Box>
  );
}

/** One settings group's content. The mobile tab stacks all of them instead. */
function GroupContent({ group }: { group: GroupId }) {
  if (group === "language") return <LanguageSection />;
  if (group === "tokens") return <TokensPanel />;
  if (group === "notifications") return <PushSettings />;
  return <AccountSection />;
}

/** Every group stacked, for the phone tab that has no sidebar to pick from. */
function ProfilePanel() {
  return (
    <Stack spacing={3}>
      <AccountSection />
      <Divider />
      <LanguageSection />
      <Divider />
      <PushSettings />
      <Divider />
      <TokensPanel />
      <Divider />
      <Typography variant="caption" color="text.disabled">
        v{__COMMIT_HASH__}
      </Typography>
    </Stack>
  );
}

function AccountSection() {
  const { user, logout } = useSession();

  return (
    <Stack spacing={3}>
      {/* Read-only facts, not fields: a disabled input stretched across a
          desktop column only looks like something you may edit. */}
      <FormSection label="Account">
        {/* gap, not Stack spacing: a wrapped item would keep the left
            margin and sit indented under the first. */}
        <Box
          sx={{ display: "flex", flexWrap: "wrap", columnGap: 5, rowGap: 2 }}
        >
          <Fact label="Username" value={user?.username ?? "-"} />
          <Fact
            label="User ID"
            value={
              <Box component="span" sx={{ fontFamily: fonts.mono }}>
                {user?.id ?? "-"}
              </Box>
            }
          />
        </Box>
      </FormSection>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <Button
          variant="outlined"
          component="a"
          href={ACCOUNT_CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Account Settings
        </Button>
        <Button variant="outlined" color="error" onClick={logout}>
          Sign Out
        </Button>
      </Stack>
    </Stack>
  );
}

function LanguageSection() {
  const [language, setLanguage] = useLanguagePreference();

  return (
    <FormSection
      label="Display language"
      hint="Which translation of river, section and rapid names is shown. The app interface stays in English."
    >
      <Box sx={{ maxWidth: 320 }}>
        <LanguagePicker
          value={language}
          onChange={setLanguage}
          size="small"
          label="Language"
        />
      </Box>
    </FormSection>
  );
}

function TokensPanel() {
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<ApiTokenCreated | null>(null);

  const { data: tokens, isLoading } = useApiTokens();

  function handleCreate() {
    create.mutate(name.trim(), {
      onSuccess: (created) => {
        setNewToken(created);
        setName("");
      },
    });
  }

  const create = useCreateApiToken();
  const revoke = useRevokeApiToken();
  // Token queued for revocation; drives the confirm dialog.
  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);
  const { copied: tokenCopied, copy: copyToken } = useCopyToClipboard();

  return (
    // Capped: a create button or a revoke icon flung to the far side of a
    // desktop column is a long way from the thing it acts on.
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <FormSection
        label="Access tokens"
        hint="For scripts and the API. A token is shown once, when you make it."
        action={
          <Button
            size="small"
            variant="outlined"
            disabled={!name.trim() || create.isPending}
            onClick={handleCreate}
          >
            Create
          </Button>
        }
      >
        <Stack spacing={2}>
          <TextField
            label="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            sx={{ maxWidth: 360 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) handleCreate();
            }}
          />
          {create.isError && (
            <Alert severity="error">
              {(create.error as Error)?.message ?? "Failed to create token"}
            </Alert>
          )}
          {newToken && (
            <Alert
              severity="success"
              onClose={() => setNewToken(null)}
              sx={{ wordBreak: "break-all" }}
            >
              <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>
                Copy this token - it won't be shown again.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "monospace", flex: 1 }}
                >
                  {newToken.token}
                </Typography>
                <IconButton
                  size="small"
                  title={tokenCopied ? "Copied!" : "Copy token"}
                  onClick={() => copyToken(newToken.token)}
                >
                  {tokenCopied ? (
                    <DoneIcon fontSize="small" />
                  ) : (
                    <ContentCopyOutlinedIcon fontSize="small" />
                  )}
                </IconButton>
              </Stack>
            </Alert>
          )}
        </Stack>
      </FormSection>

      {isLoading ? (
        <LoadingBox size={28} pt={2} />
      ) : tokens?.length === 0 ? (
        <EmptyState title="No tokens yet." py={4} />
      ) : (
        <Stack>
          {tokens?.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              onRevoke={() => setRevokeTarget(token)}
              revoking={revoke.isPending}
            />
          ))}
        </Stack>
      )}
      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke token?"
        body={`"${revokeTarget?.name ?? ""}" stops working immediately and cannot be restored.`}
        confirmLabel="Revoke"
        pendingLabel="Revoking…"
        color="error"
        pending={revoke.isPending}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (!revokeTarget) return;
          revoke.mutate(revokeTarget.id, {
            onSuccess: () => setRevokeTarget(null),
          });
        }}
      />
    </Stack>
  );
}

function TokenRow({
  token,
  onRevoke,
  revoking,
}: {
  token: ApiToken;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const lastUsed = token.last_used_at
    ? new Date(token.last_used_at).toLocaleDateString()
    : "never";
  const expires = token.expires_at
    ? new Date(token.expires_at).toLocaleDateString()
    : "never";

  return (
    <Box
      sx={{
        py: 1.5,
        borderBottom: "1px solid",
        // A full-strength rule between every row reads as a grid; these only
        // need to separate.
        borderColor: `${theme.tokens.outlineVariant}55`,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Stack sx={{ flex: 1 }} spacing={0.25}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {token.name}
            </Typography>
            {token.is_active ? (
              <Chip
                label="active"
                size="small"
                color="success"
                variant="outlined"
              />
            ) : (
              <Chip
                label="expired"
                size="small"
                color="default"
                variant="outlined"
              />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Last used: {lastUsed} · Expires: {expires}
          </Typography>
        </Stack>
        <IconButton
          size="small"
          color="error"
          onClick={onRevoke}
          disabled={revoking}
          title="Revoke token"
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
