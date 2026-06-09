import DescentCard from "@/components/descents/DescentCard";
import DescentForm from "@/components/descents/DescentForm";
import { LEVEL_CONFIG, maxLevel } from "@/components/WaterLevelChip";
import type { Descent } from "@/lib/api";
import { followsApi } from "@/lib/api";
import { useDeleteDescent, useMyDescents } from "@/lib/hooks/useDescents";
import { useFollows } from "@/lib/hooks/useFollows";
import { useSession } from "@/lib/hooks/useSession";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

function LogsPage() {
  const { isAuthenticated, isLoading: sessionLoading, login } = useSession();
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<"list" | "detail" | "form">("list");
  const [selected, setSelected] = useState<Descent | undefined>(undefined);

  function openDetail(d: Descent) {
    setSelected(d);
    setView("detail");
  }

  function openForm(d?: Descent) {
    setSelected(d);
    setView("form");
  }

  function closeForm() {
    // If editing an existing descent, go back to detail; if new, go to list
    if (selected) {
      setView("detail");
    } else {
      setView("list");
    }
  }

  function backToList() {
    setView("list");
    setSelected(undefined);
  }

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

  // ── Detail view ───────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    return (
      <DescentDetailView
        descent={selected}
        onBack={backToList}
        onEdit={() => openForm(selected)}
        onDeleted={backToList}
      />
    );
  }

  // ── Form view ────────────────────────────────────────────────────────────
  if (view === "form") {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <DescentForm
          descent={selected}
          onSave={closeForm}
          onCancel={closeForm}
        />
      </Box>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        {tab === 0 && (
          <Box
            sx={{
              display: { xs: "none", md: "flex" },
              justifyContent: "flex-end",
              px: 2,
              pt: 2,
            }}
          >
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => openForm()}
              sx={{ borderRadius: 0 }}
            >
              Log descent
            </Button>
          </Box>
        )}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
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

        <Box sx={{ px: 2, py: 3 }}>
          {tab === 0 && <MyLogsPanel onOpen={openDetail} />}
          {tab === 1 && <SocialPanel />}
        </Box>
      </Box>

      {tab === 0 && (
        <Fab
          color="secondary"
          onClick={() => openForm()}
          sx={{
            position: "fixed",
            bottom: "calc(56px + env(safe-area-inset-bottom) + 16px)",
            right: 16,
            display: { xs: "flex", md: "none" },
          }}
        >
          <AddIcon />
        </Fab>
      )}
    </>
  );
}

// ── MyLogsPanel ──────────────────────────────────────────────────────────────

function MyLogsPanel({ onOpen }: { onOpen: (d: Descent) => void }) {
  const { data, isLoading } = useMyDescents({});
  const descents = data?.items ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, Descent[]>();
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
              <DescentCard key={d.id} descent={d} onClick={() => onOpen(d)} />
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

// ── DescentDetailView ─────────────────────────────────────────────────────────

function DescentDetailView({
  descent,
  onBack,
  onEdit,
  onDeleted,
}: {
  descent: Descent;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const deleteDescent = useDeleteDescent();

  const sectionNames = descent.sections
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.section_name)
    .filter(Boolean) as string[];

  const waterwayNames = [
    ...new Set(
      descent.sections
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => s.waterway_name)
        .filter(Boolean),
    ),
  ] as string[];

  const dateLabel = new Date(descent.start_time).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const startTime = new Date(descent.start_time).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const endTime = new Date(descent.end_time).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const durationMs =
    new Date(descent.end_time).getTime() -
    new Date(descent.start_time).getTime();
  const durationH = Math.floor(durationMs / 3600000);
  const durationM = Math.floor((durationMs % 3600000) / 60000);
  const durationStr =
    durationMs > 0
      ? durationH > 0
        ? `${durationH}h ${durationM}m`
        : `${durationM}m`
      : null;

  async function handleDelete() {
    await deleteDescent.mutateAsync(descent.id);
    onDeleted();
  }

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <IconButton onClick={onBack} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            fontFamily: '"Space Grotesk", monospace',
            ml: 1,
            flex: 1,
          }}
        >
          {descent.name ||
            (waterwayNames.length > 0 ? waterwayNames.join(" / ") : null) ||
            sectionNames[0] ||
            dateLabel}
        </Typography>
        <IconButton size="small" onClick={onEdit} title="Edit">
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={handleDelete}
          disabled={deleteDescent.isPending}
          title="Delete"
          color="error"
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>

      <Stack spacing={2.5} sx={{ px: 2, py: 3 }}>
        {/* Date / time / duration */}
        <Stack spacing={0.5}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            When
          </Typography>
          <Typography variant="body2">
            {dateLabel} · {startTime} – {endTime}
            {durationStr ? ` (${durationStr})` : ""}
          </Typography>
        </Stack>

        {/* Visibility */}
        <Stack spacing={0.5}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Visibility
          </Typography>
          <Typography variant="body2" sx={{ textTransform: "capitalize" }}>
            {descent.visibility.type}
          </Typography>
        </Stack>

        {/* Sections */}
        {descent.sections.length > 0 && (
          <Stack spacing={0.5}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Sections
            </Typography>
            <Stack spacing={1}>
              {descent.sections
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((s) => {
                  const snapshots = s.water_snapshots ?? [];
                  const level =
                    snapshots.length > 0
                      ? maxLevel(snapshots.map((ws) => ws.level))
                      : null;
                  const cfg = level ? LEVEL_CONFIG[level] : null;
                  return (
                    <Box
                      key={s.section_id}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        p: 1.5,
                      }}
                    >
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, fontWeight: 500 }}
                        >
                          {s.section_name ?? "Unnamed section"}
                          {s.waterway_name ? (
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                              sx={{ ml: 0.75 }}
                            >
                              {s.waterway_name}
                            </Typography>
                          ) : null}
                        </Typography>
                        {cfg && level && (
                          <Chip
                            label={cfg.label}
                            size="small"
                            variant={level === "empty" ? "outlined" : "filled"}
                            sx={{
                              fontSize: "0.6rem",
                              height: 18,
                              color: cfg.color,
                              bgcolor: cfg.bgcolor,
                              borderColor: cfg.border,
                            }}
                          />
                        )}
                      </Box>
                      {s.note && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 0.5, display: "block" }}
                        >
                          {s.note}
                        </Typography>
                      )}
                      {snapshots.length > 0 && (
                        <Stack spacing={0.25} sx={{ mt: 1 }}>
                          {snapshots.map((ws) => (
                            <Typography
                              key={ws.gauge_id}
                              variant="caption"
                              color="text.secondary"
                            >
                              {ws.gauge_name}:{" "}
                              {ws.value != null
                                ? `${ws.value} ${ws.unit}`
                                : "—"}{" "}
                              ({ws.level})
                            </Typography>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  );
                })}
            </Stack>
          </Stack>
        )}

        {/* Put-in / Take-out */}
        {(descent.put_in_label ||
          descent.put_in_lat ||
          descent.take_out_label ||
          descent.take_out_lat) && (
          <Stack spacing={0.5}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Locations
            </Typography>
            <Box sx={{ display: "flex", gap: 2 }}>
              {(descent.put_in_label || descent.put_in_lat) && (
                <Typography variant="body2">
                  <strong>In:</strong>{" "}
                  {descent.put_in_label ||
                    `${descent.put_in_lat?.toFixed(4)}, ${descent.put_in_lon?.toFixed(4)}`}
                </Typography>
              )}
              {(descent.take_out_label || descent.take_out_lat) && (
                <Typography variant="body2">
                  <strong>Out:</strong>{" "}
                  {descent.take_out_label ||
                    `${descent.take_out_lat?.toFixed(4)}, ${descent.take_out_lon?.toFixed(4)}`}
                </Typography>
              )}
            </Box>
          </Stack>
        )}

        {/* Note */}
        {descent.note && (
          <Stack spacing={0.5}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Note
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {descent.note}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
