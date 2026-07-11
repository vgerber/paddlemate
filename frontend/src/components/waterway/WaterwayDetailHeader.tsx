import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { DetailTab } from "./types";

interface WaterwayDetailHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backIcon?: "arrow" | "close";
  actionButton?: ReactNode;
  tabs?: { value: DetailTab; onChange: (t: DetailTab) => void };
}

export default function WaterwayDetailHeader({
  title,
  subtitle,
  onBack,
  backIcon = "arrow",
  actionButton,
  tabs,
}: WaterwayDetailHeaderProps) {
  return (
    <Box
      sx={{
        px: 1.5,
        pt: 1.5,
        pb: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: tabs ? 0.75 : 0,
        }}
      >
        <IconButton
          size="small"
          onClick={onBack}
          aria-label={backIcon === "close" ? "Cancel" : "Back"}
        >
          {backIcon === "close" ? (
            <CloseIcon fontSize="small" />
          ) : (
            <ArrowBackIcon fontSize="small" />
          )}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {actionButton}
      </Box>

      {tabs && (
        <ToggleButtonGroup
          value={tabs.value}
          exclusive
          onChange={(_, v) => v && tabs.onChange(v)}
          size="small"
          sx={{
            width: "100%",
            "& .MuiToggleButton-root": {
              flex: 1,
              py: 0.5,
              fontSize: "0.75rem",
            },
          }}
        >
          <ToggleButton value="sections">Sections</ToggleButton>
          <ToggleButton value="gauges">Gauges</ToggleButton>
        </ToggleButtonGroup>
      )}
    </Box>
  );
}
