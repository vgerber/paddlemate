import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import RiverIcon from "@mui/icons-material/Water";
import { useWaterways } from "@/lib/hooks/useWaterways";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [filter, setFilter] = useState("");
  const { data, isLoading, error } = useWaterways();

  const filtered =
    data?.filter((w) =>
      w.name.toLowerCase().includes(filter.toLowerCase()),
    ) ?? [];

  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: "auto",
        px: 3,
        py: 4,
        minHeight: "calc(100vh - 48px)",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <RiverIcon sx={{ color: "primary.main" }} />
        <Typography
          variant="subtitle1"
          sx={{ color: "text.secondary", letterSpacing: "0.12em" }}
        >
          RIVERS
        </Typography>
      </Box>

      <TextField
        fullWidth
        placeholder="Filter rivers…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        size="small"
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: "text.disabled" }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 3 }}
      />

      {isLoading && (
        <Typography color="text.secondary" variant="body2">
          Loading…
        </Typography>
      )}
      {error && (
        <Typography color="error" variant="body2">
          Failed to load rivers.
        </Typography>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {filtered.map((waterway) => (
        <Card key={waterway.id} sx={{ textDecoration: "none" }}>
            <Link
              to="/waterways/$waterwayId"
              params={{ waterwayId: String(waterway.id) }}
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <CardActionArea>
                <CardContent
                  sx={{ display: "flex", alignItems: "flex-start", gap: 2, py: 2 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontFamily: '"Space Grotesk", sans-serif',
                        fontWeight: 700,
                        fontSize: "1rem",
                        mb: 0.25,
                      }}
                    >
                      {waterway.name}
                    </Typography>
                    {waterway.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                      >
                        {waterway.description}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    label={waterway.waterway_type.toUpperCase()}
                    color="primary"
                    size="small"
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  />
                </CardContent>
              </CardActionArea>
            </Link>
          </Card>
        ))}

        {!isLoading && data && filtered.length === 0 && (
          <Typography
            color="text.secondary"
            variant="body2"
            sx={{ textAlign: "center", py: 6 }}
          >
            No rivers found.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

