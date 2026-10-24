import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  createRootRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import AppSnackbar, { showErrorSnackbar } from "@/components/AppSnackbar";
import CanvasHost from "@/components/canvas/CanvasHost";
import NotificationBell, {
  UnreadBadge,
} from "@/components/notifications/NotificationBell";
import ProposalSentSnackbar from "@/components/proposals/ProposalSentSnackbar";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import UpdateReadySnackbar from "@/components/UpdateReadySnackbar";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useLiveTripEvents,
  useNotificationState,
} from "@/lib/hooks/useNotifications";
import { useSession } from "@/lib/hooks/useSession";
import { AccountIcon, LogIcon, MapIcon, TripIcon } from "@/lib/icons";
import { useLanguage } from "@/lib/languagePreference";
import { transition } from "@/lib/motion";
import { activeNav, DESKTOP_NAV, PHONE_NAV } from "@/lib/nav";
import { shouldRetryQuery } from "@/lib/retry";
import { alphas, BOTTOM_NAV_SPACE, fonts, theme } from "@/lib/theme";

const { tokens } = theme;

const navLinkSx = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.touch.min,
  fontFamily: fonts.body,
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "text.secondary",
  textDecoration: "none",
  px: 1.75,
  py: 0.75,
  borderRadius: `${tokens.radii.sm}px`,
  transition: transition(["color", "background-color"], { duration: "fast" }),
  "&:hover": { color: "text.primary" },
  "&[aria-current=page]": {
    color: "primary.main",
    bgcolor: `${tokens.primary}${alphas.hover}`,
  },
} as const;

declare module "@tanstack/react-query" {
  interface Register {
    /** Mutations rendering their own inline error UI set this to skip the
     * global error snackbar. */
    mutationMeta: { errorHandledLocally?: boolean };
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: true,
    },
  },
  // Failure floor for every mutation: nothing fails silently. Mutations with
  // dedicated inline error UI opt out via meta.errorHandledLocally.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.errorHandledLocally) return;
      showErrorSnackbar(
        apiErrorMessage(error, "Something went wrong. Please try again."),
      );
    },
  }),
});

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout />
    </QueryClientProvider>
  );
}

function Layout() {
  // Subscribing here re-renders every localized name in the app when the
  // display language changes; no component below memoizes its render.
  useLanguage();
  const { isAuthenticated, isLoading, user, login, signup, logout } =
    useSession();
  useLiveTripEvents(isAuthenticated);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeTo = activeNav(DESKTOP_NAV, pathname);
  // Full-bleed map pages: the main world map and the gauge coverage map.
  const isMapPage = pathname === "/" || pathname === "/tools/gauge-catalog";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        // 100vh includes the area behind the mobile URL bar, leaving the
        // body scrollable by that difference - which drags the whole app
        // (bottom nav included) over the map. dvh tracks the visible
        // viewport; vh stays as the fallback for older browsers.
        minHeight: "100vh",
        "@supports (min-height: 100dvh)": { minHeight: "100dvh" },
      }}
    >
      <AppBar position="fixed" sx={{ display: { xs: "none", md: "flex" } }}>
        <Toolbar
          sx={{
            gap: 0.5,
            px: 2.5,
            // MUI's own sm-up min height would win over a plain value.
            minHeight: { xs: tokens.chrome.appBar, sm: tokens.chrome.appBar },
          }}
        >
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: tokens.touch.min,
              fontFamily: fonts.body,
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "primary.main",
              gap: 1,
              textDecoration: "none",
            }}
          >
            <Box
              component="img"
              src="/logo.svg"
              alt=""
              sx={{ width: 28, height: 28, flexShrink: 0 }}
            />
            Paddlemate
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              ml: 2.5,
            }}
          >
            {DESKTOP_NAV.map(({ to, label }) => (
              <Box
                key={to}
                component={Link}
                to={to}
                aria-current={activeTo === to ? "page" : undefined}
                sx={navLinkSx}
              >
                {label}
              </Box>
            ))}
          </Box>
          <Box sx={{ flex: 1 }} />
          {!isLoading &&
            (isAuthenticated ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <NotificationBell />
                <UserMenu username={user?.username ?? ""} logout={logout} />
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  variant="text"
                  size="small"
                  onClick={signup}
                  sx={{ fontSize: "0.875rem" }}
                >
                  Create account
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={login}
                  sx={{ fontSize: "0.875rem" }}
                >
                  Sign in
                </Button>
              </Box>
            ))}
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          flex: 1,
          mt: { xs: 0, md: `${tokens.chrome.appBar}px` },
          display: "flex",
          flexDirection: "column",
          pb: isMapPage ? 0 : { xs: BOTTOM_NAV_SPACE, md: 0 },
        }}
      >
        <StandingDescentBanner
          sx={{
            display: { xs: isMapPage ? "none" : "flex", md: "flex" },
            // A desktop floats it at the foot, so the panes keep the full
            // viewport height and their docked actions stay on screen.
            position: { md: "fixed" },
            right: { md: 16 },
            bottom: { md: 16 },
            m: { md: 0 },
            width: { md: 380 },
            zIndex: { md: theme.zIndex.drawer },
          }}
        />
        <CanvasHost />
        <Box component="main" sx={{ flex: 1 }}>
          <Outlet />
        </Box>
      </Box>
      <BottomNav signedIn={isAuthenticated} />
      <AppSnackbar />
      <ProposalSentSnackbar />
      <UpdateReadySnackbar />
    </Box>
  );
}

const PHONE_ICONS: Record<string, typeof MapIcon> = {
  "/": MapIcon,
  "/logs": LogIcon,
  "/trips": TripIcon,
  "/settings": AccountIcon,
};

function BottomNav({ signedIn }: { signedIn: boolean }) {
  const { data: notifications } = useNotificationState(signedIn);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = activeNav(PHONE_NAV, pathname);

  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        display: { xs: "flex", md: "none" },
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: tokens.chrome.bottomNav,
        boxSizing: "content-box",
        pb: "env(safe-area-inset-bottom)",
        zIndex: theme.zIndex.modal,
        bgcolor: tokens.surfaceLowest,
        boxShadow: tokens.elevation.e1,
      }}
    >
      {PHONE_NAV.map(({ to, label }) => {
        const Icon = PHONE_ICONS[to];
        const current = active === to;
        return (
          <Box
            key={to}
            component={Link}
            to={to}
            aria-current={current ? "page" : undefined}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: tokens.touch.min,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.25,
              textDecoration: "none",
              fontFamily: fonts.body,
              fontSize: "0.75rem",
              fontWeight: 600,
              color: current ? "text.primary" : "text.secondary",
            }}
          >
            <Box
              data-testid="nav-pill"
              sx={{
                width: 44,
                height: 26,
                display: "grid",
                placeItems: "center",
                borderRadius: `${tokens.radii.pill}px`,
                color: current ? tokens.primary : "inherit",
                bgcolor: current ? tokens.primaryContainer : "transparent",
                transition: transition(["background-color", "color"], {
                  duration: "fast",
                }),
              }}
            >
              {to === "/settings" ? (
                // A phone has no top bar: the inbox is a tab on the profile.
                <UnreadBadge count={notifications?.unread_count ?? 0}>
                  <Icon sx={{ fontSize: 22 }} />
                </UnreadBadge>
              ) : (
                <Icon sx={{ fontSize: 22 }} />
              )}
            </Box>
            {label}
          </Box>
        );
      })}
    </Box>
  );
}

function UserMenu({
  username,
  logout,
}: {
  username: string;
  logout: () => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();

  return (
    <>
      <Button
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          fontFamily: fonts.body,
          fontSize: "0.875rem",
          fontWeight: 500,
          color: "text.secondary",
          gap: 0.5,
        }}
      >
        <Box
          aria-hidden
          data-testid="user-avatar"
          sx={{
            width: 30,
            height: 30,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            bgcolor: `${tokens.primary}${alphas.strong}`,
            color: tokens.primary,
            fontSize: "0.8125rem",
            fontWeight: 700,
            mr: 0.75,
          }}
        >
          {username.charAt(0).toUpperCase()}
        </Box>
        {username}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate({ to: "/settings" });
          }}
          dense
        >
          Settings
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            logout();
          }}
          dense
        >
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
