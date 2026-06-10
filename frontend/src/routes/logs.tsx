import DescentCard from "@/components/descents/DescentCard";
import { followsApi } from "@/lib/api";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { useFollows } from "@/lib/hooks/useFollows";
import { useSession } from "@/lib/hooks/useSession";
import AddIcon from "@mui/icons-material/Add";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Fab from "@mui/material/Fab";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  useChildMatches,
  useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

function LogsPage() {
  const childMatches = useChildMatches();
  const { isAuthenticated, isLoading: sessionLoading, login } = useSession();
  const navigate = useNavigate();
  const isMobile = useMediaQuery((theme: any) => theme.breakpoints.down("md"));
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
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pt: 10,
          px: 2,
        }}
      >
        <DirectionsBoatOutlinedIcon
          sx={{ fontSize: 56, color: "text.disabled" }}
        />
        <Typography variant="h6" color="text.secondary">
          Sign in to view your logs
        </Typography>
        <Button variant="contained" color="secondary" onClick={login}>
          Sign In
        </Button>
      </Box>
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

// ── LogsMobile ────────────────────────────────────────────────────────────────

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

// ── LogsDesktop ───────────────────────────────────────────────────────────────

function LogsDesktop({ tab, onTabChange, onOpen, onNew }: LogsViewProps) {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {tab === 0 && (
        <Box
          sx={{ display: "flex", justifyContent: "flex-end", px: 2, pt: 2 }}
        >
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onNew}
            sx={{ borderRadius: 0 }}
          >
            Log descent
          </Button>
        </Box>
      )}
      <LogsTabs tab={tab} onTabChange={onTabChange} />
      <LogsTabContent tab={tab} onOpen={onOpen} />
    </Box>
  );
}

// ── Shared tab chrome ─────────────────────────────────────────────────────────

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

// ── MyLogsPanel ──────────────────────────────────────────────────────────────

function MyLogsPanel({ onOpen }: { onOpen: (id: number) => void }) {
  const { data, isLoading } = useMyDescents({});
  const descents = data?.items ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, (typeof descents)[0][]>();
    for (const d of descents) {
      const key = new Date(d.start_time).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [descents]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (descents.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          pt: 8,
          color: "text.disabled",
        }}
      >
        <DirectionsBoatOutlinedIcon sx={{ fontSize: 48 }} />
        <Typography variant="body2">No descents logged yet.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {groups.map(([label, items]) => (
        <Box key={label}>
          <Typography
            variant="caption"
            sx={{
              px: 0,
              pb: 1,
              display: "block",
              color: "text.secondary",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </Typography>
          <Box sx={{ border: "1px solid", borderColor: "divider" }}>
            {items.map((d) => (
              <DescentCard key={d.id} descent={d} onClick={() => onOpen(d.id)} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ── SocialPanel ───────────────────────────────────────────────────────────────

function SocialPanel() {
  const { isAuthenticated, user: self } = useSession();
  const {
    following,
    followers,
    pendingRequests,
    isLoading: followsLoading,
    follow,
    unfollow,
    accept,
  } = useFollows();
  const [search, setSearch] = useState("");

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["follows", "all"],
    queryFn: () => followsApi.listAll(),
    enabled: isAuthenticated,
  });

  const filtered = search.trim()
    ? allUsers.filter((u) =>
        u.username.toLowerCase().includes(search.toLowerCase()),
      )
    : [];

  return (
    <Stack spacing={3}>
      {/* User search */}
      <TextField
        placeholder="Find users…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        fullWidth
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
              <Paper
                key={u.id}
                variant="outlined"
                sx={{ px: 2, py: 1.5, borderRadius: 0 }}
              >
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                    {u.username}
                  </Typography>
                  {u.id !== self?.id && (
                    <IconButton
                      size="small"
                      disabled={
                        u.outgoing_status === "pending" ||
                        follow.isPending ||
                        unfollow.isPending
                      }
                      onClick={() =>
                        u.outgoing_status === "accepted"
                          ? unfollow.mutate(u.id)
                          : follow.mutate(u.id)
                      }
                      title={
                        u.outgoing_status === "accepted"
                          ? "Unfollow"
                          : u.outgoing_status === "pending"
                            ? "Pending"
                            : "Follow"
                      }
                    >
                      {u.outgoing_status === "accepted" ? (
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
          {/* Pending incoming requests */}
          {pendingRequests.length > 0 && (
            <>
              <Stack spacing={1}>
                <Typography variant="subtitle2" color="text.secondary">
                  Pending requests ({pendingRequests.length})
                </Typography>
                {pendingRequests.map((u) => (
                  <Paper
                    key={u.id}
                    variant="outlined"
                    sx={{ px: 2, py: 1.5, borderRadius: 0 }}
                  >
                    <Stack
                      direction="row"
                      sx={{ alignItems: "center", gap: 1 }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ flex: 1, fontWeight: 500 }}
                      >
                        {u.username}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => accept.mutate(u.id)}
                        disabled={accept.isPending}
                        title="Accept"
                      >
                        <CheckOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => unfollow.mutate(u.id)}
                        disabled={unfollow.isPending}
                        title="Decline"
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              <Divider />
            </>
          )}

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
                <Paper
                  key={u.id}
                  variant="outlined"
                  sx={{ px: 2, py: 1.5, borderRadius: 0 }}
                >
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ flex: 1, fontWeight: 500 }}
                    >
                      {u.username}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => unfollow.mutate(u.id)}
                      disabled={unfollow.isPending}
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
                <Paper
                  key={u.id}
                  variant="outlined"
                  sx={{ px: 2, py: 1.5, borderRadius: 0 }}
                >
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


