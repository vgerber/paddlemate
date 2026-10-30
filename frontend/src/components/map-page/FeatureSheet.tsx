import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import {
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Fact from "@/components/Fact";
import { CoordsInfo } from "@/components/waterway/section-details/CoordsInfo";
import { DeleteFeatureDialog } from "@/components/waterway/section-details/DeleteFeatureDialog";
import {
  IconDisc,
  NumberDisc,
} from "@/components/waterway/section-details/railParts";
import {
  featureNumbers,
  featureOrder,
} from "@/components/waterway/section-details/rows";
import {
  featureDesc,
  featureDifficulty,
  featureName,
  fmtKm,
  fmtKmSpan,
} from "@/components/waterway/section-details/utils";
import { humanize, sentenceCase } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import {
  BackIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "@/lib/icons";
import { css, ms, prefersReducedMotion, releaseMs } from "@/lib/motion";
import { lockDirection, releaseVelocity, type Sample } from "@/lib/swipe";
import { theme } from "@/lib/theme";
import {
  dragHeight,
  HALF_RATIO,
  type SheetOutcome,
  settleSheet,
  stepOf,
} from "./featureSnap";
import type { MapPageState } from "./useMapPageState";

const { tokens } = theme;

/** Round buttons floating over the map, in the app's map-control style. */
const floatSx = {
  position: "absolute",
  top: 12,
  zIndex: 11,
  width: tokens.touch.min,
  height: tokens.touch.min,
  bgcolor: tokens.surface,
  color: tokens.onSurface,
  boxShadow: tokens.elevation.e2,
  "&:hover": { bgcolor: tokens.surface },
} as const;

const stepSx = {
  width: tokens.touch.min,
  height: tokens.touch.min,
  color: tokens.onSurface,
  "&.Mui-disabled": { color: tokens.outlineVariant },
} as const;

/** Moves the sheet to `to` px below its top frame; a curve whose time grows
 * with the distance, none under reduced motion. */
function settleTo(el: HTMLElement, from: number, to: number, fast = false) {
  const px = Math.abs(to - from);
  const time = fast ? ms("fast") : prefersReducedMotion() ? 0 : releaseMs(px);
  el.style.transition =
    time === 0 || px === 0
      ? "none"
      : `transform ${time}ms ${to < from ? css.settle : css.easeOut}`;
  el.style.transform = `translate3d(0,${to}px,0)`;
  return time;
}

interface DragState {
  id: number;
  x0: number;
  y0: number;
  h0: number;
  axis: "pending" | "vertical" | "horizontal";
  samples: Sample[];
  xs: Sample[];
}

/**
 * The phone's feature sheet, over the map and above the bottom nav. It rests
 * at a peek (name, type, km, the key line) or at half height (facts, the
 * whole note, actions), steps to the next or previous feature in list order
 * and keeps its height while it does. Dragging it down closes it, dragging it
 * past half goes back to the list. Moves by transform only.
 */
export default function FeatureSheet({ state }: { state: MapPageState }) {
  const {
    featureSheet: sheet,
    sections,
    selectedSectionId,
    selectedFeature,
    setSelectedFeatureId,
    startEditFeature,
  } = state;
  const section = sections.find((s) => s.id === selectedSectionId);
  const order = useMemo(
    () => (section ? featureOrder(section) : []),
    [section],
  );
  const numbers = useMemo(
    () => (section ? featureNumbers(section) : new Map<number, number>()),
    [section],
  );
  const index = order.findIndex((i) => i.feature.id === selectedFeature?.id);
  const item = order[index];
  const { isAuthenticated } = useSession();
  const [deleting, setDeleting] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const dragged = useRef(false);
  const [half, setHalf] = useState(() =>
    Math.round(window.innerHeight * HALF_RATIO),
  );
  const [peek, setPeek] = useState(112);
  const heights = { peek, half };
  const resting = sheet.snap === "half" ? half : peek;
  const gap = half - resting;
  const offset = useRef(half);
  const shown = useRef(false);

  // The sheet is a share of the map above it and its peek is as tall as its
  // header; both follow resizes (rotation, text size, the 320 px key line).
  useLayoutEffect(() => {
    const el = root.current;
    const header = head.current;
    if (!el?.parentElement || !header) return;
    const read = () => {
      setHalf(Math.round((el.parentElement?.clientHeight ?? 0) * HALF_RATIO));
      setPeek(Math.round(header.offsetHeight));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el.parentElement);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const { setVisible } = sheet;
  useEffect(() => setVisible(resting), [resting, setVisible]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!shown.current) {
      // Rises from below the map on its first frame.
      shown.current = true;
      offset.current = half;
      el.style.transition = "none";
      el.style.transform = `translate3d(0,${half}px,0)`;
      el.getBoundingClientRect();
    }
    settleTo(el, offset.current, gap);
    offset.current = gap;
  }, [gap, half]);

  // Focus moves into the sheet when it appears.
  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  // While the sheet follows a drag the browser must not also pan.
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      if (drag.current?.axis === "vertical" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, []);

  if (!section || !item) return null;

  const feature = item.feature;
  const n = numbers.get(feature.id);
  const isZone = item.isZone;
  const km = isZone ? fmtKmSpan(item.startM, item.endM) : fmtKm(item.distM);
  const subtitle = [
    sentenceCase(humanize(feature.feature_type)),
    km,
    `${index + 1} of ${order.length}`,
  ].join(" · ");
  const desc = featureDesc(feature);
  const grade = featureDifficulty(feature);

  /** Slides away, then does `then` (closing, or going back to the list). */
  const leave = (then: () => void) => {
    const el = root.current;
    if (!el) return then();
    const time = settleTo(el, offset.current, half, true);
    offset.current = half;
    if (time === 0) return then();
    window.setTimeout(then, time);
  };
  const close = () =>
    leave(() => {
      sheet.close();
      // The bar renders once the sheet is gone.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[data-selection-bar]")?.focus(),
      );
    });
  const back = () => leave(sheet.back);

  const step = (by: -1 | 1) => {
    const next = order[index + by];
    if (next) setSelectedFeatureId(next.feature.id);
  };

  const finish = (outcome: SheetOutcome) => {
    if (outcome === "close") return close();
    if (outcome === "list") return back();
    sheet.setSnap(outcome);
    // Same snap: the layout effect will not run, settle by hand.
    const el = root.current;
    if (el && outcome === sheet.snap) {
      settleTo(el, offset.current, gap);
      offset.current = gap;
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    dragged.current = false;
    if (e.pointerType === "mouse") return;
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      h0: resting,
      axis: "pending",
      samples: [{ x: e.clientY, t: e.timeStamp }],
      xs: [{ x: e.clientX, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !root.current) return;
    d.samples.push({ x: e.clientY, t: e.timeStamp });
    d.xs.push({ x: e.clientX, t: e.timeStamp });
    const dy = e.clientY - d.y0;
    if (d.axis === "pending") {
      const lock = lockDirection(e.clientX - d.x0, dy);
      if (lock === "pending") return;
      d.axis = lock;
      dragged.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      if (lock === "vertical") root.current.style.transition = "none";
    }
    if (d.axis !== "vertical") return;
    const h = dragHeight(d.h0, dy, heights);
    offset.current = half - Math.min(h, half);
    root.current.style.transform = `translate3d(0,${offset.current}px,0)`;
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.axis === "pending") return;
    if (d.axis === "horizontal") {
      d.xs.push({ x: e.clientX, t: e.timeStamp });
      const by = stepOf(e.clientX - d.x0, releaseVelocity(d.xs));
      if (by) step(by);
      return;
    }
    d.samples.push({ x: e.clientY, t: e.timeStamp });
    finish(
      settleSheet(
        dragHeight(d.h0, e.clientY - d.y0, heights),
        releaseVelocity(d.samples),
        sheet.snap,
        heights,
      ),
    );
  };

  return (
    <>
      <IconButton
        aria-label="Back to the list"
        onClick={back}
        sx={{ ...floatSx, left: 12 }}
      >
        <BackIcon />
      </IconButton>
      <IconButton
        aria-label="Close"
        onClick={close}
        sx={{ ...floatSx, right: 12 }}
      >
        <CloseIcon />
      </IconButton>
      <Box
        ref={root}
        role="region"
        aria-label="Feature"
        tabIndex={-1}
        data-testid="feature-sheet"
        data-snap={sheet.snap}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        onClickCapture={(e) => {
          // A drag ends in a click on whatever was under the finger.
          if (!dragged.current) return;
          dragged.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: half,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          bgcolor: tokens.surface,
          borderRadius: `${tokens.radii.xl}px ${tokens.radii.xl}px 0 0`,
          boxShadow: tokens.elevation.e2,
          outline: "none",
          overflow: "hidden",
        }}
      >
        <Box
          ref={head}
          data-testid="feature-sheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          sx={{ flexShrink: 0, touchAction: "none" }}
        >
          <ButtonBase
            aria-expanded={sheet.snap === "half"}
            aria-label={sheet.snap === "half" ? "Show less" : "Show more"}
            onClick={() =>
              sheet.setSnap(sheet.snap === "half" ? "peek" : "half")
            }
            sx={{
              width: "100%",
              height: tokens.touch.min,
              "&.Mui-focusVisible": {
                outline: `2px solid ${tokens.primary}`,
                outlineOffset: -2,
              },
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 4,
                borderRadius: `${tokens.radii.pill}px`,
                bgcolor: tokens.outlineControl,
              }}
            />
          </ButtonBase>
          <Box sx={{ px: 2, pb: 1 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                minHeight: tokens.touch.min,
              }}
            >
              {n != null ? (
                <NumberDisc n={n} size={36} />
              ) : (
                <IconDisc type={feature.feature_type} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  component="h2"
                  noWrap
                  sx={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    lineHeight: 1.25,
                  }}
                >
                  {featureName(feature)}
                </Typography>
                <Typography
                  data-testid="feature-sheet-sub"
                  noWrap
                  sx={{ fontSize: "0.8125rem", color: tokens.onSurfaceVariant }}
                >
                  {subtitle}
                </Typography>
              </Box>
              <IconButton
                aria-label="Previous feature"
                disabled={index <= 0}
                onClick={() => step(-1)}
                sx={stepSx}
              >
                <ChevronLeftIcon />
              </IconButton>
              <IconButton
                aria-label="Next feature"
                disabled={index >= order.length - 1}
                onClick={() => step(1)}
                sx={{ ...stepSx, mr: -1 }}
              >
                <ChevronRightIcon />
              </IconButton>
            </Box>
            {desc && (
              <Typography
                data-testid="feature-sheet-key"
                noWrap
                sx={{
                  mt: 0.5,
                  fontSize: "0.9375rem",
                  // The 320 px peek keeps the map; the note is in the half.
                  display: sheet.snap === "half" ? "none" : "block",
                  "@media (max-width: 359.95px)": { display: "none" },
                }}
              >
                {desc}
              </Typography>
            )}
          </Box>
        </Box>
        <Box
          data-testid="feature-sheet-body"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            px: 2,
            pb: 2,
            borderTop: `1px solid ${tokens.outlineVariant}`,
          }}
        >
          <Box sx={{ display: "flex", gap: 4, py: 1.5 }}>
            {grade && <Fact label="Grade" value={grade} />}
            <Fact
              label={isZone ? "Length" : "Distance"}
              value={isZone ? fmtKm(item.endM - item.startM) : km}
            />
          </Box>
          {desc && <Typography sx={{ mb: 1 }}>{desc}</Typography>}
          <CoordsInfo
            coords={item.coords}
            onHistory={() => sheet.openHistory(feature.id)}
            onEdit={
              isAuthenticated ? () => startEditFeature(feature) : undefined
            }
            onDelete={isAuthenticated ? () => setDeleting(true) : undefined}
          />
        </Box>
      </Box>
      <DeleteFeatureDialog
        feature={deleting ? feature : null}
        waterwayId={section.waterway_id}
        sectionId={section.id}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          setSelectedFeatureId(null);
        }}
      />
    </>
  );
}
