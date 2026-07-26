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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import { useSession } from "@/lib/hooks/useSession";
import { useLanguage } from "@/lib/languagePreference";

const navLinkSx = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: "0.7rem",
  fontWeight: 600,
  letterSpacing: "0.1em",
  color: "text.secondary",
  textDecoration: "none",
  px: 1,
  py: 0.5,
  "&:hover": { color: "text.primary" },
  "&.active": { color: "primary.main" },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: true,
    },
  },
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
  const { isAuthenticated, isLoading, user, login, logout } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMapPage = pathname === "/";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ display: { xs: "none", md: "flex" } }}>
        <Toolbar variant="dense">
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{
              fontFamily: '"Space Grotesk", sans-serif',
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
            <Box component={Link} to="/proposals" sx={navLinkSx}>
              PROPOSALS
            </Box>
          </Box>
          <Box sx={{ flex: 1 }} />
          {!isLoading &&
            (isAuthenticated ? (
              <UserMenu username={user?.username ?? ""} logout={logout} />
            ) : (
              <Button
                variant="contained"
                color="secondary"
                size="small"
                onClick={login}
                sx={{ fontSize: "0.6875rem" }}
              >
                Sign In
              </Button>
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
        : pathname.startsWith("/settings") || pathname.startsWith("/proposals")
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
          fontFamily: '"Space Grotesk", sans-serif',
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
