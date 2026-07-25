import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseIcon from "@mui/icons-material/Close";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import SearchIcon from "@mui/icons-material/Search";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { followsApi } from "@/lib/api";
import { useFollows } from "@/lib/hooks/useFollows";
import { useSession } from "@/lib/hooks/useSession";

/** Follow requests, following/followers lists and user search. */
export default function SocialPanel() {
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
