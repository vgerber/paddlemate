import FilterListIcon from "@mui/icons-material/FilterList";
import HowToVoteOutlinedIcon from "@mui/icons-material/HowToVoteOutlined";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
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

/** One filter dimension as selectable chips - the design language's marker
 * for a type or status, and far lighter than a full row of toggle buttons. */
function FilterChips({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { tokens } = theme;
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Chip
            key={option.label}
            label={option.label}
            size="small"
            variant="outlined"
            onClick={() => onChange(option.value)}
            sx={{
              color: active ? tokens.primary : "text.secondary",
              borderColor: active
                ? `${tokens.primary}80`
                : `${tokens.outlineVariant}66`,
              bgcolor: active ? `${tokens.primary}14` : "transparent",
              "&:hover": {
                bgcolor: active
                  ? `${tokens.primary}1f`
                  : `${tokens.outlineVariant}33`,
              },
            }}
          />
        );
      })}
    </Box>
  );
}

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
  const hasActiveFilters = entityType != null || operation != null;
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);
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
        <IconButton
          size="small"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          title={filtersOpen ? "Hide filters" : "Show filters"}
          sx={{ ml: isLoading ? "auto" : 0 }}
        >
          <Badge
            color="primary"
            variant="dot"
            invisible={!hasActiveFilters || filtersOpen}
          >
            <FilterListIcon fontSize="small" />
          </Badge>
        </IconButton>
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

      {/* Filters - collapsed by default so the list is what you land on */}
      <Collapse in={filtersOpen}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            px: 2,
            py: 1.5,
          }}
        >
          <FilterChips
            options={ENTITY_TABS}
            value={entityType ?? ""}
            onChange={(v) =>
              onEntityTypeChange((v || undefined) as ProposalEntityType)
            }
          />

          {onOperationChange && (
            <FilterChips
              options={OPERATION_TABS}
              value={operation ?? ""}
              onChange={(v) =>
                onOperationChange((v || undefined) as ProposalOperation)
              }
            />
          )}
        </Box>
      </Collapse>

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
                showStatus={p.status !== status}
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
          bgcolor: theme.tokens.surfaceLow,
          borderRight: "1px solid",
          borderColor: `${theme.tokens.outlineVariant}55`,
        }}
      >
        {list}
      </Box>
      <Box sx={{ overflowY: "auto", px: 4, py: 3 }}>
        <Box sx={{ maxWidth: 880 }}>
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
    </Box>
  );
}
