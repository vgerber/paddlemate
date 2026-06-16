import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import Autocomplete, {
  type AutocompleteRenderValueGetItemProps,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import WaterwayMap from "@/components/map/Map";
import {
  type Descent,
  type Group,
  groupsApi,
  type SectionWithFeatures,
  waterwaysApi,
} from "@/lib/api";
import { useCreateDescent, usePatchDescent } from "@/lib/hooks/useDescents";

type VisibilityType = "private" | "public" | "shared";
type TimingMode = "single" | "multi";
type SectionLocation = { type: "LineString"; coordinates: number[][] };

interface SectionDraft {
  key: string;
  section_id: number;
  sort_order: number;
  note: string;
  display_name: string;
  location?: SectionLocation;
}

interface LogForm {
  timing_mode: TimingMode;
  start_time: string;
  end_time: string;
  name: string;
  sections: SectionDraft[];
  put_in_lat: string;
  put_in_lon: string;
  put_in_label: string;
  take_out_lat: string;
  take_out_lon: string;
  take_out_label: string;
  note: string;
  visibility_type: VisibilityType;
  shared_groups: number[];
  shared_users: string[];
  visible_from: string;
}

function toDatetimeLocal(iso: string): string {
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZoneName: undefined })
    .slice(0, 16)
    .replace(" ", "T");
}

function isValidCoord(val: string): boolean {
  return val !== "" && !Number.isNaN(parseFloat(val));
}

function defaultForm(): LogForm {
  const now = toDatetimeLocal(new Date().toISOString());
  return {
    timing_mode: "single",
    start_time: now,
    end_time: now,
    sections: [],
    put_in_lat: "",
    put_in_lon: "",
    put_in_label: "",
    take_out_lat: "",
    take_out_lon: "",
    take_out_label: "",
    name: "",
    note: "",
    visibility_type: "private",
    shared_groups: [],
    shared_users: [],
    visible_from: "",
  };
}

function initFromDescent(d: Descent): LogForm {
  const vis = d.visibility;
  const isSameDay = d.start_time.slice(0, 10) === d.end_time.slice(0, 10);
  return {
    timing_mode: isSameDay ? "single" : "multi",
    start_time: toDatetimeLocal(d.start_time),
    end_time: toDatetimeLocal(d.end_time),
    sections: [...d.sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        key: String(s.section_id),
        section_id: s.section_id,
        sort_order: s.sort_order,
        note: s.note ?? "",
        display_name: s.section_name ?? `Section #${s.section_id}`,
      })),
    put_in_lat: d.put_in_lat?.toString() ?? "",
    put_in_lon: d.put_in_lon?.toString() ?? "",
    put_in_label: d.put_in_label ?? "",
    take_out_lat: d.take_out_lat?.toString() ?? "",
    take_out_lon: d.take_out_lon?.toString() ?? "",
    take_out_label: d.take_out_label ?? "",
    name: d.name ?? "",
    note: d.note ?? "",
    visibility_type: vis.type,
    shared_groups: vis.type === "shared" ? vis.groups : [],
    shared_users: vis.type === "shared" ? vis.users : [],
    visible_from: d.visible_from ? toDatetimeLocal(d.visible_from) : "",
  };
}

function buildPayload(form: LogForm) {
  const visibility =
    form.visibility_type === "shared"
      ? {
          type: "shared" as const,
          groups: form.shared_groups,
          users: form.shared_users,
        }
      : form.visibility_type === "public"
        ? { type: "public" as const }
        : { type: "private" as const };

  return {
    start_time: new Date(form.start_time).toISOString(),
    end_time: new Date(form.end_time).toISOString(),
    name: form.name || null,
    note: form.note || null,
    put_in_lat: form.put_in_lat ? parseFloat(form.put_in_lat) : null,
    put_in_lon: form.put_in_lon ? parseFloat(form.put_in_lon) : null,
    put_in_label: form.put_in_label || null,
    put_in_feature_id: null,
    take_out_lat: form.take_out_lat ? parseFloat(form.take_out_lat) : null,
    take_out_lon: form.take_out_lon ? parseFloat(form.take_out_lon) : null,
    take_out_label: form.take_out_label || null,
    take_out_feature_id: null,
    visibility,
    visible_from: form.visible_from
      ? new Date(form.visible_from).toISOString()
      : null,
    sections: form.sections.map((s, i) => ({
      section_id: s.section_id,
      sort_order: i + 1,
      note: s.note || null,
    })),
  };
}

function StepWhen({
  form,
  onChange,
}: {
  form: LogForm;
  onChange: (p: Partial<LogForm>) => void;
}) {
  const startDate = form.start_time.slice(0, 10);
  const startTime = form.start_time.slice(11, 16);
  const endTime = form.end_time.slice(11, 16);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <ToggleButtonGroup
        exclusive
        value={form.timing_mode}
        onChange={(_, v) => v && onChange({ timing_mode: v })}
        size="small"
      >
        <ToggleButton value="single" sx={{ borderRadius: 0 }}>
          Single day
        </ToggleButton>
        <ToggleButton value="multi" sx={{ borderRadius: 0 }}>
          Multi day
        </ToggleButton>
      </ToggleButtonGroup>

      {form.timing_mode === "single" ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Date"
            type="date"
            value={startDate}
            onChange={(e) => {
              const d = e.target.value;
              onChange({
                start_time: `${d}T${startTime}`,
                end_time: `${d}T${endTime}`,
              });
            }}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Start time"
              type="time"
              value={startTime}
              onChange={(e) =>
                onChange({ start_time: `${startDate}T${e.target.value}` })
              }
              sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End time"
              type="time"
              value={endTime}
              onChange={(e) =>
                onChange({ end_time: `${startDate}T${e.target.value}` })
              }
              sx={{ flex: 1 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Start"
            type="datetime-local"
            value={form.start_time}
            onChange={(e) => onChange({ start_time: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End"
            type="datetime-local"
            value={form.end_time}
            onChange={(e) => onChange({ end_time: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      )}
    </Box>
  );
}

function makeDraft(
  section: SectionWithFeatures,
  sortOrder: number,
): SectionDraft {
  return {
    key: String(section.id),
    section_id: section.id,
    sort_order: sortOrder,
    note: "",
    display_name: section.name,
    location:
      section.location.type === "LineString"
        ? (section.location as SectionLocation)
        : undefined,
  };
}

interface LocationPinProps {
  num: number;
  color: string;
  title: string;
  lat: string;
  lon: string;
  label: string;
  onClear: () => void;
  onLabelChange: (v: string) => void;
}

function LocationPin({
  num,
  color,
  title,
  lat,
  lon,
  label,
  onClear,
  onLabelChange,
}: LocationPinProps) {
  const hasCoords = isValidCoord(lat);
  return (
    <Box
      sx={{
        flex: 1,
        border: "1px solid",
        borderColor: hasCoords ? color : "divider",
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        transition: "border-color 0.2s",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: color,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {num}
        </div>
        <Typography
          variant="caption"
          sx={{
            fontFamily: '"Space Grotesk", monospace',
            letterSpacing: "0.06em",
            fontWeight: 600,
            flex: 1,
          }}
        >
          {title}
        </Typography>
        {hasCoords && (
          <IconButton size="small" onClick={onClear} sx={{ p: 0.25 }}>
            <DeleteOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>
      {hasCoords ? (
        <Typography
          variant="caption"
          sx={{
            fontFamily: '"Space Grotesk", monospace',
            color: "text.secondary",
            fontSize: "0.7rem",
          }}
        >
          {parseFloat(lat).toFixed(5)}, {parseFloat(lon).toFixed(5)}
        </Typography>
      ) : (
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontStyle: "italic" }}
        >
          Click ①/② on map to set
        </Typography>
      )}
      <TextField
        label="Label (optional)"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        size="small"
        fullWidth
      />
    </Box>
  );
}

function StepSections({
  form,
  onChange,
  initialWaterwayId = null,
}: {
  form: LogForm;
  onChange: (p: Partial<LogForm>) => void;
  initialWaterwayId?: number | null;
}) {
  const [waterwayInput, setWaterwayInput] = useState("");
  const [selectedWaterwayId, setSelectedWaterwayId] = useState<number | null>(
    initialWaterwayId,
  );
  const [labelMode, setLabelMode] = useState<"section" | "river">("section");

  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ["waterway-search", waterwayInput],
    queryFn: () => waterwaysApi.list({ name: waterwayInput, per_page: 10 }),
    enabled: waterwayInput.trim().length >= 2,
    staleTime: 30_000,
  });

  const { data: selectedWaterway } = useQuery({
    queryKey: ["waterway", selectedWaterwayId],
    queryFn: () => waterwaysApi.get(selectedWaterwayId as number),
    enabled: selectedWaterwayId !== null,
  });

  const mapSections = useMemo<SectionWithFeatures[]>(
    () => selectedWaterway?.sections ?? [],
    [selectedWaterway],
  );
  const selectedIds = new Set(form.sections.map((s) => s.section_id));
  const unaddedSections = mapSections.filter((s) => !selectedIds.has(s.id));

  // Auto-derive put-in/take-out from section geometry whenever sections change
  const sectionIds = form.sections.map((s) => s.section_id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: sectionIds is a stable derived key; onChange and form.sections are intentionally omitted to avoid infinite loops
  useEffect(() => {
    const withLoc = form.sections.filter(
      (s) => s.location?.type === "LineString",
    );
    if (withLoc.length === 0) return;
    const first = withLoc[0];
    const last = withLoc[withLoc.length - 1];
    const putInCoords = (first.location as SectionLocation).coordinates[0];
    const takeOutCoords = (last.location as SectionLocation).coordinates[
      (last.location as SectionLocation).coordinates.length - 1
    ];
    onChange({
      put_in_lon: putInCoords[0].toFixed(6),
      put_in_lat: putInCoords[1].toFixed(6),
      take_out_lon: takeOutCoords[0].toFixed(6),
      take_out_lat: takeOutCoords[1].toFixed(6),
    });
  }, [sectionIds]);

  function addSection(section: SectionWithFeatures) {
    if (selectedIds.has(section.id)) return;
    onChange({
      sections: [
        ...form.sections,
        makeDraft(section, form.sections.length + 1),
      ],
    });
  }

  function toggleSection(section: SectionWithFeatures) {
    if (selectedIds.has(section.id)) {
      onChange({
        sections: form.sections.filter((s) => s.section_id !== section.id),
      });
    } else {
      addSection(section);
    }
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const arr = [...form.sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    onChange({ sections: arr });
  }

  const validPutIn =
    isValidCoord(form.put_in_lat) && isValidCoord(form.put_in_lon);
  const validTakeOut =
    isValidCoord(form.take_out_lat) && isValidCoord(form.take_out_lon);

  const formSectionsForMap = useMemo(
    () =>
      form.sections
        .filter(
          (s): s is SectionDraft & { location: SectionLocation } =>
            !!s.location,
        )
        .map((s) => ({
          id: s.section_id,
          name: s.display_name,
          waterway_id: 0,
          description: null,
          location: s.location,
          features: [],
          created_at: "",
          updated_at: "",
        })) as SectionWithFeatures[],
    [form.sections],
  );
  const sectionsForMap =
    mapSections.length > 0 ? mapSections : formSectionsForMap;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Autocomplete
        options={searchResults?.items ?? []}
        getOptionLabel={(opt) => opt.name}
        inputValue={waterwayInput}
        onInputChange={(_, v) => setWaterwayInput(v)}
        onChange={(_, val) => setSelectedWaterwayId(val?.id ?? null)}
        loading={searching}
        noOptionsText={
          waterwayInput.length < 2 ? "Type to search waterways" : "No results"
        }
        renderInput={(params) => (
          <TextField {...params} label="Search waterway" />
        )}
      />

      <Box
        sx={{
          height: 380,
          border: "1px solid",
          borderColor: "divider",
          position: "relative",
        }}
      >
        {sectionsForMap.length === 0 && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Search a waterway to see its sections
            </Typography>
          </Box>
        )}
        <WaterwayMap
          sections={sectionsForMap}
          selectedSectionIds={selectedIds}
          labelMode={labelMode}
          onLabelModeChange={setLabelMode}
          onSectionToggle={(id) => {
            const section = sectionsForMap.find((s) => s.id === id);
            if (section) toggleSection(section);
          }}
          putIn={
            validPutIn
              ? {
                  lat: parseFloat(form.put_in_lat),
                  lon: parseFloat(form.put_in_lon),
                }
              : null
          }
          takeOut={
            validTakeOut
              ? {
                  lat: parseFloat(form.take_out_lat),
                  lon: parseFloat(form.take_out_lon),
                }
              : null
          }
          onPickPutIn={(lat, lon) =>
            onChange({ put_in_lat: lat.toFixed(6), put_in_lon: lon.toFixed(6) })
          }
          onPickTakeOut={(lat, lon) =>
            onChange({
              take_out_lat: lat.toFixed(6),
              take_out_lon: lon.toFixed(6),
            })
          }
        />
      </Box>

      <Autocomplete
        key={selectedWaterwayId ?? "none"}
        options={unaddedSections}
        getOptionLabel={(opt) => opt.name}
        value={null}
        onChange={(_, val) => val && addSection(val)}
        disabled={mapSections.length === 0}
        noOptionsText={
          mapSections.length === 0
            ? "Search a waterway first"
            : "All sections added"
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Add section"
            size="small"
            placeholder={
              mapSections.length === 0 ? "Search a waterway first" : undefined
            }
          />
        )}
      />

      {form.sections.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {form.sections.map((s, i) => (
            <Box
              key={s.key}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontFamily: '"Space Grotesk", monospace',
                  color: "text.disabled",
                  minWidth: 20,
                }}
              >
                {i + 1}
              </Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {s.display_name}
              </Typography>
              <IconButton
                size="small"
                onClick={() => moveSection(i, -1)}
                disabled={i === 0}
              >
                <ArrowUpwardIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => moveSection(i, 1)}
                disabled={i === form.sections.length - 1}
              >
                <ArrowDownwardIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() =>
                  onChange({
                    sections: form.sections.filter((_, j) => j !== i),
                  })
                }
              >
                <DeleteOutlinedIcon fontSize="inherit" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: "flex", gap: 1.5 }}>
        <LocationPin
          num={1}
          color="#0072B2"
          title="PUT-IN"
          lat={form.put_in_lat}
          lon={form.put_in_lon}
          label={form.put_in_label}
          onClear={() =>
            onChange({ put_in_lat: "", put_in_lon: "", put_in_label: "" })
          }
          onLabelChange={(v) => onChange({ put_in_label: v })}
        />
        <LocationPin
          num={2}
          color="#D55E00"
          title="TAKE-OUT"
          lat={form.take_out_lat}
          lon={form.take_out_lon}
          label={form.take_out_label}
          onClear={() =>
            onChange({ take_out_lat: "", take_out_lon: "", take_out_label: "" })
          }
          onLabelChange={(v) => onChange({ take_out_label: v })}
        />
      </Box>
    </Box>
  );
}

function StepDetails({
  form,
  onChange,
}: {
  form: LogForm;
  onChange: (p: Partial<LogForm>) => void;
}) {
  const [userInput, setUserInput] = useState("");

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: groupsApi.list,
    staleTime: 60_000,
  });

  const selectedGroups: Group[] = (groups ?? []).filter((g) =>
    form.shared_groups.includes(g.id),
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <TextField
        label="Title"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        fullWidth
        placeholder="Leave blank to use section / waterway name"
        slotProps={{ htmlInput: { maxLength: 255 } }}
      />
      <TextField
        label="Note"
        value={form.note}
        onChange={(e) => onChange({ note: e.target.value })}
        multiline
        minRows={3}
        fullWidth
      />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography variant="overline" sx={{ lineHeight: 1 }}>
          Visibility
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={form.visibility_type}
          onChange={(_, v) => v && onChange({ visibility_type: v })}
          size="small"
        >
          <ToggleButton value="private" sx={{ borderRadius: 0 }}>
            Private
          </ToggleButton>
          <ToggleButton value="shared" sx={{ borderRadius: 0 }}>
            Shared
          </ToggleButton>
          <ToggleButton value="public" sx={{ borderRadius: 0 }}>
            Public
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {form.visibility_type === "shared" && (
        <>
          <Autocomplete
            multiple
            options={groups ?? []}
            getOptionLabel={(opt) => opt.name}
            value={selectedGroups}
            onChange={(_, val) =>
              onChange({ shared_groups: val.map((g) => g.id) })
            }
            renderInput={(params) => (
              <TextField {...params} label="Groups" size="small" />
            )}
            renderValue={(
              value: Group[],
              getItemProps: AutocompleteRenderValueGetItemProps<true>,
            ) =>
              value.map((opt, idx) => (
                <Chip
                  {...getItemProps({ index: idx })}
                  key={opt.id}
                  label={opt.name}
                  size="small"
                />
              ))
            }
          />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <TextField
              label="Add user by ID"
              value={userInput}
              size="small"
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const t = userInput.trim();
                  if (t && !form.shared_users.includes(t)) {
                    onChange({ shared_users: [...form.shared_users, t] });
                  }
                  setUserInput("");
                }
              }}
              helperText="Press Enter to add"
            />
            {form.shared_users.length > 0 && (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {form.shared_users.map((u) => (
                  <Chip
                    key={u}
                    label={u}
                    size="small"
                    onDelete={() =>
                      onChange({
                        shared_users: form.shared_users.filter((x) => x !== u),
                      })
                    }
                  />
                ))}
              </Box>
            )}
          </Box>
        </>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {[
            { label: "1 day", days: 1 },
            { label: "1 week", days: 7 },
            { label: "1 month", days: 30 },
          ].map(({ label, days }) => (
            <Button
              key={days}
              size="small"
              variant="outlined"
              sx={{ borderRadius: 0, fontSize: "0.65rem", px: 1 }}
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + days);
                onChange({ visible_from: toDatetimeLocal(d.toISOString()) });
              }}
            >
              {label}
            </Button>
          ))}
          {form.visible_from && (
            <Button
              size="small"
              sx={{ borderRadius: 0, fontSize: "0.65rem", px: 1, ml: "auto" }}
              onClick={() => onChange({ visible_from: "" })}
            >
              Clear
            </Button>
          )}
        </Box>
        <TextField
          label="Publish after (optional)"
          type="datetime-local"
          value={form.visible_from}
          onChange={(e) => onChange({ visible_from: e.target.value })}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
    </Box>
  );
}

const STEPS = ["When", "Sections", "Details"];

interface Props {
  descent?: Descent;
  initialSection?: { section: SectionWithFeatures; waterwayId: number };
  initialStartTime?: string;
  onSave: (id: number) => void;
  onCancel: () => void;
}

export default function DescentForm({
  descent,
  initialSection,
  initialStartTime,
  onSave,
  onCancel,
}: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<LogForm>(() => {
    if (descent) return initFromDescent(descent);
    const base = initialStartTime
      ? { ...defaultForm(), start_time: toDatetimeLocal(initialStartTime) }
      : defaultForm();
    if (initialSection) {
      return { ...base, sections: [makeDraft(initialSection.section, 1)] };
    }
    return base;
  });

  const createDescent = useCreateDescent();
  const patchDescent = usePatchDescent();

  async function handleSave() {
    const payload = buildPayload(form);
    const result = descent
      ? await patchDescent.mutateAsync({ id: descent.id, body: payload })
      : await createDescent.mutateAsync(payload);
    onSave(result.id);
  }

  function patch(update: Partial<LogForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  const isLast = step === STEPS.length - 1;
  const isBusy = createDescent.isPending || patchDescent.isPending;

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mb: 3,
          pb: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontFamily: '"Space Grotesk", monospace',
            fontWeight: 700,
            fontSize: "0.9rem",
            letterSpacing: "0.05em",
          }}
        >
          {descent ? "Edit descent" : "Log descent"}
        </Typography>
        <Button onClick={onCancel} sx={{ ml: "auto", borderRadius: 0 }}>
          Cancel
        </Button>
      </Box>

      <Stepper activeStep={step} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((label, i) => (
          <Step key={label} completed={i < step}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ mb: 4 }}>
        {step === 0 && <StepWhen form={form} onChange={patch} />}
        {step === 1 && (
          <StepSections
            form={form}
            onChange={patch}
            initialWaterwayId={initialSection?.waterwayId}
          />
        )}
        {step === 2 && <StepDetails form={form} onChange={patch} />}
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 1,
          pt: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {step > 0 && (
          <Button
            variant="outlined"
            onClick={() => setStep((s) => s - 1)}
            sx={{ borderRadius: 0 }}
          >
            Back
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {isLast ? (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={isBusy}
            sx={{ borderRadius: 0 }}
          >
            {isBusy ? "Saving…" : "Save"}
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={() => setStep((s) => s + 1)}
            sx={{ borderRadius: 0 }}
          >
            Next
          </Button>
        )}
      </Box>
    </Box>
  );
}
