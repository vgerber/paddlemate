import HowToVoteOutlinedIcon from "@mui/icons-material/HowToVoteOutlined";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import ProposalCard from "@/components/waterway/ProposalCard";
import type {
  ProposalEntityType,
  ProposalOperation,
  ProposalStatus,
} from "@/lib/api";
import { useProposals } from "@/lib/hooks/useProposals";

const STATUS_TABS = ["pending", "approved", "rejected"] as const;

const ENTITY_TABS: { value: ProposalEntityType | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "waterway", label: "Rivers" },
  { value: "water_section", label: "Sections" },
  { value: "feature", label: "Features" },
];

const OPERATION_TABS: { value: ProposalOperation | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
];

const toggleGroupSx = {
  width: "100%",
  "& .MuiToggleButton-root": {
    flex: 1,
    py: 0.5,
    fontSize: "0.75rem",
  },
} as const;

interface ProposalsViewProps {
  status: ProposalStatus;
  entityType?: ProposalEntityType;
  operation?: ProposalOperation;
  onStatusChange: (status: ProposalStatus) => void;
  onEntityTypeChange: (entityType?: ProposalEntityType) => void;
  /** When provided, an operation filter is shown. */
  onOperationChange?: (operation?: ProposalOperation) => void;
  /** Show the admin review controls on each card. */
  adminMode?: boolean;
}

/** Proposals browser: status tabs + filters + card list.
 * Admins additionally get review controls on each card (adminMode). */
export default function ProposalsView({
  status,
  entityType,
  operation,
  onStatusChange,
  onEntityTypeChange,
  onOperationChange,
  adminMode,
}: ProposalsViewProps) {
  const { data: proposals, isLoading } = useProposals({
    status,
    entity_type: entityType,
    operation,
  });

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {/* Header */}
      <Box
        sx={{ display: "flex", alignItems: "baseline", gap: 1, px: 2, pt: 2 }}
      >
        <Typography
          variant="subtitle2"
          sx={{ color: "text.secondary", letterSpacing: "0.12em" }}
        >
          PROPOSALS
        </Typography>
        {!isLoading && (
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", ml: "auto" }}
          >
            {proposals?.length ?? 0} results
          </Typography>
        )}
      </Box>

      {/* Status tabs */}
      <Tabs
        value={status}
        onChange={(_, v) => onStatusChange(v)}
        variant="fullWidth"
        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      >
        {STATUS_TABS.map((s) => (
          <Tab
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            value={s}
          />
        ))}
      </Tabs>

      {/* Filters */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          px: 2,
          py: 1.5,
        }}
      >
        <ToggleButtonGroup
          value={entityType ?? ""}
          exclusive
          size="small"
          onChange={(_, v) => {
            if (v !== null) onEntityTypeChange(v || undefined);
          }}
          sx={toggleGroupSx}
        >
          {ENTITY_TABS.map((t) => (
            <ToggleButton key={t.label} value={t.value}>
              {t.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {onOperationChange && (
          <ToggleButtonGroup
            value={operation ?? ""}
            exclusive
            size="small"
            onChange={(_, v) => {
              if (v !== null) onOperationChange(v || undefined);
            }}
            sx={toggleGroupSx}
          >
            {OPERATION_TABS.map((t) => (
              <ToggleButton key={t.label} value={t.value}>
                {t.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
      </Box>

      {/* List */}
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : !proposals || proposals.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1.5,
            pt: 6,
            px: 2,
          }}
        >
          <HowToVoteOutlinedIcon
            sx={{ fontSize: 56, color: "text.disabled" }}
          />
          <Typography variant="body2" color="text.secondary">
            No {status} proposals.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} adminMode={adminMode} />
          ))}
        </Box>
      )}
    </Box>
  );
}
