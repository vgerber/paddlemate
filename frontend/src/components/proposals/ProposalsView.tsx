import FilterListIcon from "@mui/icons-material/FilterList";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import ChipRow from "@/components/ChipRow";
import ListPaneHeader from "@/components/ListPaneHeader";
import PanelHeader from "@/components/PanelHeader";
import ProposalDetailView from "@/components/proposals/ProposalDetailView";
import ProposalRow from "@/components/proposals/ProposalRow";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import UnderlineTabs from "@/components/UnderlineTabs";
import type {
  ProposalEntityType,
  ProposalOperation,
  ProposalStatus,
} from "@/lib/api";
import { useProposals } from "@/lib/hooks/useProposals";
import { PANEL_HEIGHT, theme } from "@/lib/theme";
import { STATUS_LABEL } from "./status";

const { tokens } = theme;

const STATUS_TABS = (["pending", "approved", "rejected"] as const).map(
  (value) => ({ value, label: STATUS_LABEL[value] }),
);

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

/** One filter dimension as a chip: teal once set, one tap opens its menu. */
function FilterChip({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Chip
        data-testid={id}
        variant="outlined"
        clickable
        color={value ? "primary" : "default"}
        onClick={(e) => setAnchor(e.currentTarget)}
        label={
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            {value ? `${label}: ${current?.label}` : label}
            <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
          </Box>
        }
      />
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
      >
        {options.map((option) => (
          <MenuItem
            key={option.label}
            selected={option.value === value}
            onClick={() => {
              onChange(option.value);
              setAnchor(null);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
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
  const navigate = useNavigate();
  const router = useRouter();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const hasActiveFilters = entityType != null || operation != null;
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);
  const { data: proposals, isLoading } = useProposals({
    status,
    entity_type: entityType,
    operation,
  });

  // The phone reaches the list through the Tools tab, so back goes there.
  const goBack = () => {
    if (window.history.length > 1) router.history.back();
    else router.navigate({ to: "/settings", search: {} });
  };

  const selected = proposals?.find((p) => p.id === selectedId);

  const list = (
    <>
      <ListPaneHeader
        count={proposals?.length ?? 0}
        loading={isLoading}
        actions={
          <IconButton
            onClick={() => setFiltersOpen((v) => !v)}
            aria-label={filtersOpen ? "Hide filters" : "Show filters"}
            title={filtersOpen ? "Hide filters" : "Show filters"}
            sx={{
              width: tokens.touch.min,
              height: tokens.touch.min,
              mr: -1.25,
            }}
          >
            <Badge
              color="primary"
              variant="dot"
              invisible={!hasActiveFilters || filtersOpen}
            >
              <FilterListIcon fontSize="small" />
            </Badge>
          </IconButton>
        }
      />

      <Box sx={{ px: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <UnderlineTabs
          value={status}
          onChange={onStatusChange}
          items={STATUS_TABS}
        />
      </Box>

      {/* Filters - collapsed by default so the list is what you land on */}
      <Collapse in={filtersOpen}>
        <Box sx={{ px: 2 }}>
          <ChipRow>
            <FilterChip
              id="proposal-entity"
              label="Type"
              options={ENTITY_TABS}
              value={entityType ?? ""}
              onChange={(v) =>
                onEntityTypeChange((v || undefined) as ProposalEntityType)
              }
            />

            {onOperationChange && (
              <FilterChip
                id="proposal-operation"
                label="Action"
                options={OPERATION_TABS}
                value={operation ?? ""}
                onChange={(v) =>
                  onOperationChange((v || undefined) as ProposalOperation)
                }
              />
            )}
          </ChipRow>
        </Box>
      </Collapse>

      {/* List */}
      {isLoading ? (
        <LoadingBox size={40} py={6} />
      ) : !proposals || proposals.length === 0 ? (
        <EmptyState title={`No ${status} proposals.`} />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5 }}>
          {proposals.map((p) => (
            <ProposalRow
              key={p.id}
              proposal={p}
              selected={isDesktop && p.id === selectedId}
              onSelect={() =>
                isDesktop
                  ? onSelect?.(p.id)
                  : navigate({
                      to: "/proposals/$proposalId",
                      params: { proposalId: String(p.id) },
                    })
              }
            />
          ))}
        </Box>
      )}
    </>
  );

  if (!isDesktop) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <PanelHeader title="Proposals" onBack={goBack} />
        {list}
      </Box>
    );
  }

  // Desktop: a scannable list beside the full proposal, so reviewing a
  // queue never costs a navigation round-trip.
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          md: "320px minmax(0, 1fr)",
          lg: "420px minmax(0, 1fr)",
        },
        height: PANEL_HEIGHT,
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
      <Box data-testid="proposal-pane" sx={{ overflowY: "auto", p: 1.5 }}>
        <Box
          sx={{
            maxWidth: 880,
            bgcolor: tokens.surface,
            borderRadius: `${tokens.radii.lg}px`,
            boxShadow: tokens.elevation.e1,
            // clip, not hidden: the review bar sticks to the pane's scroll.
            overflow: "clip",
          }}
        >
          {selected ? (
            <ProposalDetailView
              proposal={selected}
              adminMode={adminMode}
              listStatus={status}
            />
          ) : (
            <EmptyState title="Select a proposal to review it." py={10} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
