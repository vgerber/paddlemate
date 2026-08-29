import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DoneIcon from "@mui/icons-material/Done";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LanguagePicker from "@/components/LanguagePicker";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import ToolsList from "@/components/ToolsList";
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

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [tab, setTab] = useState(0);
  const { isAuthenticated, isLoading } = useSession();

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

  return (
    <Box sx={{ maxWidth: { xs: 800, md: 1100 }, mx: "auto" }}>
      {
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
            icon={<BuildOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Tools"
          />
        </Tabs>
      }
      <Box sx={{ px: 2, py: 3 }}>
        {tab === 0 && <ProfilePanel />}
        {tab === 1 && <ToolsList />}
      </Box>
    </Box>
  );
}

function ProfilePanel() {
  const { user, logout } = useSession();
  const [language, setLanguage] = useLanguagePreference();

  return (
    <Box
      sx={{
        display: "grid",
        // Account details and tokens sit side by side on desktop instead of
        // pushing the tokens table below the fold.
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        gap: { xs: 3, md: 5 },
        alignItems: "start",
      }}
    >
      <Stack spacing={3}>
        <Stack spacing={2}>
          <TextField
            label="Username"
            value={user?.username ?? ""}
            slotProps={{ input: { readOnly: true } }}
            size="small"
            fullWidth
          />
          <TextField
            label="User ID"
            value={user?.id ?? ""}
            slotProps={{ input: { readOnly: true } }}
            size="small"
            fullWidth
          />
        </Stack>
        <Divider />
        <Stack spacing={1}>
          <Typography variant="overline" sx={{ lineHeight: 1 }}>
            Display language
          </Typography>
          <LanguagePicker
            value={language}
            onChange={setLanguage}
            size="small"
            label="Language"
          />
          <Typography variant="caption" color="text.secondary">
            Which translation of river, section and rapid names is shown. The
            app interface stays in English.
          </Typography>
        </Stack>
        <Divider />
        <Button
          variant="outlined"
          component="a"
          href={ACCOUNT_CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          fullWidth
        >
          Account Settings
        </Button>
        <Button variant="outlined" color="error" onClick={logout} fullWidth>
          Sign Out
        </Button>
        <Divider sx={{ display: { md: "none" } }} />
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ textAlign: "center" }}
        >
          v{__COMMIT_HASH__}
        </Typography>
      </Stack>
      <TokensPanel />
    </Box>
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
    <Stack spacing={3}>
      <Typography variant="h6">Access Tokens</Typography>

      {/* Create form */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle2" color="text.secondary">
            New token
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Token name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              sx={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
            />
            <Button
              variant="contained"
              disabled={!name.trim() || create.isPending}
              onClick={handleCreate}
            >
              Create
            </Button>
          </Stack>
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
      </Paper>

      {/* Token list */}
      <Divider />
      {isLoading ? (
        <CircularProgress size={24} />
      ) : tokens?.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No tokens yet.
        </Typography>
      ) : (
        <Stack spacing={1}>
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
    <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
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
    </Paper>
  );
}
