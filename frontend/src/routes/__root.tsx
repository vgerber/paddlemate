import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import AppBar from "@mui/material/AppBar";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
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
import StandingDescentBanner from "@/components/StandingDescentBanner";
import { apiErrorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/hooks/useSession";
import { useLanguage } from "@/lib/languagePreference";
import { fonts } from "@/lib/theme";

const navLinkSx = {
  fontFamily: fonts.label,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.1em",
  color: "text.secondary",
  textDecoration: "none",
  px: 1,
  py: 0.5,
  "&:hover": { color: "text.primary" },
  "&.active": { color: "primary.main" },
};

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
        <Toolbar variant="dense">
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{
              fontFamily: fonts.label,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "primary.main",
              textDecoration: "none",
            }}
          >
            PADDLEMATE
          </Typography>
          <Box
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              gap: 0.5,
              ml: 2,
            }}
          >
            <Box component={Link} to="/" sx={navLinkSx}>
              MAP
            </Box>
            <Box component={Link} to="/logs" sx={navLinkSx}>
              LOGS
            </Box>
            <Box component={Link} to="/tools" sx={navLinkSx}>
              TOOLS
            </Box>
          </Box>
          <Box sx={{ flex: 1 }} />
          {!isLoading &&
            (isAuthenticated ? (
              <UserMenu username={user?.username ?? ""} logout={logout} />
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  variant="text"
                  color="secondary"
                  size="small"
                  onClick={signup}
                  sx={{ fontSize: "0.6875rem" }}
                >
                  Sign Up
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  onClick={login}
                  sx={{ fontSize: "0.6875rem" }}
                >
                  Sign In
                </Button>
              </Box>
            ))}
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          flex: 1,
          mt: { xs: 0, md: "48px" },
          display: "flex",
          flexDirection: "column",
          pb: isMapPage
            ? 0
            : { xs: "calc(56px + env(safe-area-inset-bottom))", md: 0 },
        }}
      >
        <StandingDescentBanner
          sx={{ display: { xs: isMapPage ? "none" : "flex", md: "flex" } }}
        />
        <Box component="main" sx={{ flex: 1 }}>
          <Outlet />
        </Box>
      </Box>
      <BottomNav />
      <AppSnackbar />
    </Box>
  );
}

function BottomNav() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeTab =
    pathname === "/"
      ? 0
      : pathname.startsWith("/logs")
        ? 1
        : pathname.startsWith("/settings") ||
            pathname.startsWith("/proposals") ||
            pathname.startsWith("/tools")
          ? 2
          : false;

  return (
    <BottomNavigation
      value={activeTab}
      onChange={(_, val: number) => {
        const routes = ["/", "/logs", "/settings"] as const;
        navigate({ to: routes[val] });
      }}
      sx={{
        display: { xs: "flex", md: "none" },
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "auto",
        minHeight: 56,
        pb: "env(safe-area-inset-bottom)",
        zIndex: 1300,
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <BottomNavigationAction label="Map" icon={<MapOutlinedIcon />} />
      <BottomNavigationAction
        label="Logs"
        icon={<DirectionsBoatOutlinedIcon />}
      />
      <BottomNavigationAction
        label="Profile"
        icon={<AccountCircleOutlinedIcon />}
      />
    </BottomNavigation>
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
        endIcon={<ArrowDropDownIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          fontFamily: fonts.label,
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "text.secondary",
          textTransform: "none",
        }}
      >
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
          Sign Out
        </MenuItem>
      </Menu>
    </>
  );
}
