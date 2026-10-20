import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseIcon from "@mui/icons-material/Close";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type ReactNode, useState } from "react";
import { flatRowSx } from "@/components/canvas/flatRow";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import MemberAvatar from "@/components/trips/MemberAvatar";
import { useAllUsers, useFollows } from "@/lib/hooks/useFollows";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, theme } from "@/lib/theme";
import GroupHead from "./GroupHead";

const { tokens } = theme;

/** One person: an initial, the name, and one menu for what can be done. */
function PersonRow({
  name,
  actions = [],
  note,
}: {
  name: string;
  actions?: RowAction[];
  /** Quiet text at the right edge when there is no menu to open. */
  note?: ReactNode;
}) {
  return (
    <Box
      data-testid="person-row"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        minHeight: 56,
        pl: 1.5,
        pr: actions.length > 0 ? 0.5 : 1.5,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
        [theme.breakpoints.up("md")]: { ...flatRowSx, pl: 2 },
      }}
    >
      <MemberAvatar name={name} size={30} />
      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          fontFamily: fonts.body,
          fontWeight: 600,
          fontSize: "0.9375rem",
        }}
        noWrap
      >
        {name}
      </Typography>
      {note && (
        <Typography
          variant="body2"
          color="textSecondary"
          sx={{ fontSize: "0.8125rem" }}
        >
          {note}
        </Typography>
      )}
      <RowMenu actions={actions} />
    </Box>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: { xs: 0.75, md: 0 },
      }}
    >
      <GroupHead>{title}</GroupHead>
      <Box
        sx={{ display: "flex", flexDirection: "column", gap: { xs: 1, md: 0 } }}
      >
        {children}
      </Box>
    </Box>
  );
}

const quiet = (text: string) => (
  <Typography variant="body2" color="textDisabled" sx={{ px: 0.5 }}>
    {text}
  </Typography>
);

/** Follow requests, following/followers lists and user search. */
export default function SocialPanel() {
  const { isAuthenticated, user: self } = useSession();
  const {
    following,
    followers,
    pendingRequests,
    isLoading: followsLoading,
    error: followsError,
    refetch: refetchFollows,
    follow,
    unfollow,
    accept,
  } = useFollows();
  const [search, setSearch] = useState("");

  const { data: allUsers = [], isLoading: usersLoading } =
    useAllUsers(isAuthenticated);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? allUsers.filter((u) => u.username.toLowerCase().includes(term))
    : [];

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, md: 1 } }}
    >
      <TextField
        sx={{ mx: { md: 1.5 }, mt: { md: 1.5 }, width: { md: "auto" } }}
        placeholder="Find users…"
        hiddenLabel
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

      {term && (
        <Group title="Results">
          {usersLoading && <LoadingBox size={24} pt={1} />}
          {!usersLoading && filtered.length === 0 && quiet("No users found.")}
          {filtered.map((u) => {
            const actions: RowAction[] = [];
            if (u.id !== self?.id && u.outgoing_status !== "pending") {
              actions.push(
                u.outgoing_status === "accepted"
                  ? {
                      label: "Unfollow",
                      icon: <PersonRemoveOutlinedIcon fontSize="small" />,
                      onClick: () => unfollow.mutate(u.id),
                    }
                  : {
                      label: "Follow",
                      icon: <PersonAddOutlinedIcon fontSize="small" />,
                      onClick: () => follow.mutate(u.id),
                    },
              );
            }
            return (
              <PersonRow
                key={u.id}
                name={u.username}
                actions={actions}
                note={u.outgoing_status === "pending" ? "Pending" : undefined}
              />
            );
          })}
        </Group>
      )}

      {followsLoading && <LoadingBox size={24} pt={2} />}
      {!followsLoading && followsError && (
        <ErrorState
          error={followsError}
          fallback="Could not load your follows."
          onRetry={refetchFollows}
        />
      )}
      {!followsLoading && !followsError && (
        <>
          {pendingRequests.length > 0 && (
            <Group title={`Pending requests (${pendingRequests.length})`}>
              {pendingRequests.map((u) => (
                <PersonRow
                  key={u.id}
                  name={u.username}
                  actions={[
                    {
                      label: "Accept",
                      icon: <CheckOutlinedIcon fontSize="small" />,
                      onClick: () => accept.mutate(u.id),
                    },
                    {
                      label: "Decline",
                      icon: <CloseIcon fontSize="small" />,
                      danger: true,
                      onClick: () => unfollow.mutate(u.id),
                    },
                  ]}
                />
              ))}
            </Group>
          )}

          <Group title={`Following (${following.length})`}>
            {following.length === 0 && quiet("Not following anyone yet.")}
            {following.map((u) => (
              <PersonRow
                key={u.id}
                name={u.username}
                actions={[
                  {
                    label: "Unfollow",
                    icon: <PersonRemoveOutlinedIcon fontSize="small" />,
                    danger: true,
                    onClick: () => unfollow.mutate(u.id),
                  },
                ]}
              />
            ))}
          </Group>

          <Group title={`Followers (${followers.length})`}>
            {followers.length === 0 && quiet("No followers yet.")}
            {followers.map((u) => (
              <PersonRow key={u.id} name={u.username} />
            ))}
          </Group>
        </>
      )}
    </Box>
  );
}
