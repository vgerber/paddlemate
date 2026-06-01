import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { type ApiToken, type ApiTokenCreated, followsApi, tokensApi } from "@/lib/api";
import { useFollows } from "@/lib/hooks/useFollows";
import { useSession } from "@/lib/hooks/useSession";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [tab, setTab] = useState(0);
  const { isAuthenticated, isLoading } = useSession();

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">
          Sign in to access settings.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", minHeight: "calc(100vh - 48px)" }}>
      <Tabs
        orientation="vertical"
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          borderRight: 1,
          borderColor: "divider",
          minWidth: 180,
          pt: 2,
          "& .MuiTab-root": {
            alignItems: "flex-start",
            textAlign: "left",
            gap: 1,
            minHeight: 48,
            px: 3,
          },
        }}
      >
        <Tab
          icon={<AccountCircleOutlinedIcon fontSize="small" />}
          iconPosition="start"
          label="Profile"
        />
        <Tab
          icon={<KeyOutlinedIcon fontSize="small" />}
          iconPosition="start"
          label="Access Tokens"
        />
        <Tab
          icon={<PeopleAltOutlinedIcon fontSize="small" />}
          iconPosition="start"
          label="Social"
        />
      </Tabs>

      <Box sx={{ flex: 1, p: 4 }}>
        {tab === 0 && <ProfilePanel />}
        {tab === 1 && <TokensPanel />}
        {tab === 2 && <SocialPanel />}
      </Box>
    </Box>
  );
}

function ProfilePanel() {
  const { user } = useSession();

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Profile</Typography>
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
    </Stack>
  );
}

function TokensPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<ApiTokenCreated | null>(null);

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => tokensApi.list(),
  });

  const create = useMutation({
    mutationFn: () => tokensApi.create(name.trim()),
    onSuccess: (created) => {
      setNewToken(created);
      setName("");
      qc.invalidateQueries({ queryKey: ["tokens"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: number) => tokensApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }),
  });

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
                if (e.key === "Enter" && name.trim()) create.mutate();
              }}
            />
            <Button
              variant="contained"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
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
                Copy this token — it won't be shown again.
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
                  onClick={() => navigator.clipboard.writeText(newToken.token)}
                >
                  <ContentCopyOutlinedIcon fontSize="small" />
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
              onRevoke={() => revoke.mutate(token.id)}
              revoking={revoke.isPending}
            />
          ))}
        </Stack>
      )}
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

function SocialPanel() {
  const { isAuthenticated, user: self } = useSession();
  const qc = useQueryClient();
  const { following, followers, isLoading: followsLoading, toggle } = useFollows();
  const [search, setSearch] = useState("");

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: [...["follows"], "all"],
    queryFn: () => followsApi.listAll(),
    enabled: isAuthenticated,
  });

  const follow = useMutation({
    mutationFn: (userId: string) => followsApi.follow(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["follows"] }),
  });

  const unfollow = useMutation({
    mutationFn: (userId: string) => followsApi.unfollow(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["follows"] }),
  });

  const filtered = search.trim()
    ? allUsers.filter((u) =>
        u.username.toLowerCase().includes(search.toLowerCase()),
      )
    : [];

  return (
    <Stack spacing={3}>
      {/* Header + search */}
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Social
        </Typography>
        <TextField
          placeholder="Find users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: 220 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>

      {/* Search results */}
      {search.trim() && (
        <Stack spacing={1}>
          {usersLoading ? (
            <CircularProgress size={20} />
          ) : filtered.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              No users found.
            </Typography>
          ) : (
            filtered.map((u) => (
              <Paper key={u.id} variant="outlined" sx={{ px: 2, py: 1.5 }}>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                    {u.username}
                  </Typography>
                  {u.id !== self?.id && (
                    <IconButton
                      size="small"
                      disabled={follow.isPending || unfollow.isPending}
                      onClick={() =>
                        u.is_following
                          ? unfollow.mutate(u.id)
                          : follow.mutate(u.id)
                      }
                      title={u.is_following ? "Unfollow" : "Follow"}
                    >
                      {u.is_following ? (
                        <PersonRemoveOutlinedIcon fontSize="small" />
                      ) : (
                        <PersonAddOutlinedIcon fontSize="small" />
                      )}
                    </IconButton>
                  )}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      )}

      {followsLoading ? (
        <CircularProgress size={24} />
      ) : (
        <>
          {/* Following */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary">
              Following ({following.length})
            </Typography>
            {following.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                Not following anyone yet.
              </Typography>
            ) : (
              following.map((u) => (
                <Paper key={u.id} variant="outlined" sx={{ px: 2, py: 1.5 }}>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                      {u.username}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => toggle(u.id)}
                      title="Unfollow"
                    >
                      <PersonRemoveOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>

          <Divider />

          {/* Followers */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary">
              Followers ({followers.length})
            </Typography>
            {followers.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                No followers yet.
              </Typography>
            ) : (
              followers.map((u) => (
                <Paper key={u.id} variant="outlined" sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {u.username}
                  </Typography>
                </Paper>
              ))
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}
