import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import { useSession } from "@/lib/hooks/useSession";

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
	const { isAuthenticated, isLoading, user, login, logout } = useSession();

	return (
		<Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
			<AppBar position="fixed">
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
					<Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 2 }}>
						<Box component={Link} to="/" sx={navLinkSx}>
							MAP
						</Box>
						<Box component={Link} to="/logs/" sx={navLinkSx}>
							LOGS
						</Box>
					</Box>
					<Box sx={{ flex: 1 }} />
					{!isLoading &&
						(isAuthenticated ? (
							<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
								<Typography
									variant="subtitle2"
									sx={{ color: "text.secondary", letterSpacing: "0.08em" }}
								>
									{user?.username}
								</Typography>
								<Button
									variant="outlined"
									color="primary"
									size="small"
									onClick={logout}
									sx={{ fontSize: "0.6875rem" }}
								>
									Sign Out
								</Button>
							</Box>
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
				sx={{ flex: 1, mt: "48px", display: "flex", flexDirection: "column" }}
			>
				<StandingDescentBanner />
				<Box component="main" sx={{ flex: 1 }}>
					<Outlet />
				</Box>
			</Box>
		</Box>
	);
}
