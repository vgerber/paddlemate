import HowToVoteOutlinedIcon from "@mui/icons-material/HowToVoteOutlined";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import ProposalDetailView from "@/components/proposals/ProposalDetailView";
import ProposalRow from "@/components/proposals/ProposalRow";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import ProposalCard from "@/components/waterway/ProposalCard";
import type {
  ProposalEntityType,
  ProposalOperation,
  ProposalStatus,
} from "@/lib/api";
import { useProposals } from "@/lib/hooks/useProposals";
import { theme } from "@/lib/theme";

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
  /** Proposal shown in the desktop detail pane. */
  selectedId?: number;
  onSelect?: (id: number | undefined) => void;
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
  selectedId,
  onSelect,
  entityType,
  operation,
  onStatusChange,
  onEntityTypeChange,
  onOperationChange,
  adminMode,
}: ProposalsViewProps) {
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { data: proposals, isLoading } = useProposals({
    status,
    entity_type: entityType,
    operation,
  });

  const selected = proposals?.find((p) => p.id === selectedId);

  const list = (
    <>
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
        <LoadingBox size={40} py={6} />
      ) : !proposals || proposals.length === 0 ? (
        <EmptyState
          icon={
            <HowToVoteOutlinedIcon
              sx={{ fontSize: 56, color: "text.disabled" }}
            />
          }
          title={`No ${status} proposals.`}
        />
      ) : (
        <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
          {proposals.map((p) =>
            isDesktop ? (
              <ProposalRow
                key={p.id}
                proposal={p}
                selected={p.id === selectedId}
                onSelect={() => onSelect?.(p.id)}
              />
            ) : (
              <ProposalCard key={p.id} proposal={p} adminMode={adminMode} />
            ),
          )}
        </Box>
      )}
    </>
  );

  if (!isDesktop) {
    return <Box sx={{ maxWidth: 720, mx: "auto" }}>{list}</Box>;
  }

  // Desktop: a scannable list beside the full proposal, so reviewing a
  // queue never costs a navigation round-trip.
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          md: "380px minmax(0, 1fr)",
          lg: "420px minmax(0, 1fr)",
        },
        height: "calc(100vh - 48px)",
      }}
    >
      <Box
        sx={{
          overflowY: "auto",
          borderRight: "1px solid",
          borderColor: "divider",
        }}
      >
        {list}
      </Box>
      <Box sx={{ overflowY: "auto", px: 3, py: 2 }}>
        {selected ? (
          <ProposalDetailView proposal={selected} adminMode={adminMode} />
        ) : (
          <EmptyState
            icon={
              <HowToVoteOutlinedIcon
                sx={{ fontSize: 56, color: "text.disabled" }}
              />
            }
            title="Select a proposal to review it."
            py={10}
          />
        )}
      </Box>
    </Box>
  );
}
